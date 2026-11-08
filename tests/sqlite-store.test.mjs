import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, stat, access, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { openSqliteStore, validateSqliteTarget } from '../src/sqlite-store.mjs';
import { migrateJsonToSqlite, inspectSqlite, exportSqliteToJson } from '../src/sqlite-migrate.mjs';
const timestamp='2026-11-08T12:00:00.000Z';
const c=(id='c1')=>({id,name:`Research ${id}`,createdAt:timestamp});
const b=(id='b1',collectionId='c1')=>({id,url:`https://example.net/${id}`,title:`書籍 ${id}`,
  description:'ö',notes:'💾 notes',tags:['research','読書'],status:'unread',favorite:false,pinned:false,
  trashedAt:null,collectionId,createdAt:timestamp,updatedAt:timestamp});
const empty=()=>({schema:1,bookmarks:[],collections:[]});
const sandbox=async()=>{const dir=await mkdtemp(join(tmpdir(),'gcb-sqlite-runtime-'));return {dir,db:join(dir,'bookmarks.sqlite'),json:join(dir,'data.json')};};

// Use the same snapshot/mutate semantics as the live JSON adapter. Transactions
// may fail; those failures must not change the cached view or on-disk rows.
test('SQLite store creates private empty DB, preserves order, Unicode and tags across restart',async()=>{
  const f=await sandbox(); const store=await openSqliteStore(f.db);
  assert.deepEqual(store.snapshot(),empty());
  assert.equal((await stat(f.db)).mode&0o777,0o600);
  await store.mutate(s=>{s.collections.push(c());s.bookmarks.push(b());});
  await store.mutate(s=>{s.bookmarks.unshift(b('b2'));s.bookmarks.push(b('b3',null));});
  await store.mutate(s=>{s.bookmarks[1]={...s.bookmarks[1],tags:['changed','読書'],notes:'updated'};});
  const snapshot=store.snapshot();
  assert.deepEqual(snapshot.bookmarks.map(x=>x.id),['b2','b1','b3']);
  await store.close();
  await assert.rejects(store.mutate(()=>{}),/closed/);
  const recovered=await openSqliteStore(f.db);
  assert.deepEqual(recovered.snapshot(),snapshot);
  await recovered.close();
  const inspected=await inspectSqlite(f.db); assert.deepEqual(inspected.data,snapshot);
  const db=new DatabaseSync(f.db,{readOnly:true});
  try{assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
    assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0);
    assert.deepEqual(db.prepare('SELECT id FROM bookmarks ORDER BY ordinal').all().map(r=>r.id),['b2','b1','b3']);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM tags').get().n,6);
  }finally{db.close();}
});

test('SQLite store rolls back duplicate ID, dangling FK, exceptions and continues after rejected writes',async()=>{
  const f=await sandbox();const store=await openSqliteStore(f.db);
  await store.mutate(s=>{s.collections.push(c());s.bookmarks.push(b());});
  const preserved=store.snapshot();
  await assert.rejects(store.mutate(s=>{s.bookmarks.push(b());}),/duplicate bookmark ID/);
  await assert.rejects(store.mutate(s=>{s.collections.pop();}),/unknown collection reference/);
  await assert.rejects(store.mutate(s=>{s.bookmarks[0].notes='should never persist';throw new Error('cancel');}),/cancel/);
  assert.deepEqual(store.snapshot(),preserved);
  await store.mutate(s=>{s.bookmarks[0].favorite=true;});
  assert.equal(store.snapshot().bookmarks[0].favorite,true);
  await store.close();
  const inspected=await inspectSqlite(f.db);assert.equal(inspected.data.bookmarks[0].favorite,true);
});

test('SQLite store handles reorder, deletion, relation clearing and concurrent serialized edits',async()=>{
  const f=await sandbox();const store=await openSqliteStore(f.db);
  await store.mutate(s=>{s.collections.push(c(),c('c2'));s.bookmarks.push(b(),b('b2','c2'),b('b3',null));});
  const result=await Promise.all([
    store.mutate(s=>{s.bookmarks.unshift(b('b4'));return 'first';}),
    store.mutate(s=>{s.bookmarks[1].status='reading';return 'second';}),
    store.mutate(s=>{s.collections.splice(1,1);s.bookmarks=s.bookmarks.map(x=>x.collectionId==='c2'?{...x,collectionId:null}:x);return 'third';})
  ]);
  assert.deepEqual(result,['first','second','third']);
  await store.mutate(s=>{s.bookmarks.splice(0,1);s.collections.unshift(c('c3'));});
  const final=store.snapshot();
  assert.deepEqual(final.bookmarks.map(x=>x.id),['b1','b2','b3']);
  assert.equal(final.bookmarks.find(x=>x.id==='b2').collectionId,null);
  assert.deepEqual(final.collections.map(x=>x.id),['c3','c1']);
  await store.close();
  assert.deepEqual((await inspectSqlite(f.db)).data,final);
});

test('SQLite adapter opens a migrated database without touching source, and JSON export preserves edits',async()=>{
  const f=await sandbox();const fixture={schema:1,collections:[c()],bookmarks:[b()]};
  await writeFile(f.json,JSON.stringify(fixture));const original=await readFile(f.json);
  await migrateJsonToSqlite(f.json,f.db);
  const store=await openSqliteStore(f.db);
  assert.deepEqual(store.snapshot(),fixture);
  await store.mutate(s=>{s.bookmarks.unshift(b('b2'));s.bookmarks[1].tags.push('extra');});
  await store.close();
  await exportSqliteToJson(f.db,join(f.dir,'export.json'));
  assert.deepEqual(JSON.parse(await readFile(join(f.dir,'export.json'),'utf8')).bookmarks.map(x=>x.id),['b2','b1']);
  assert.deepEqual(await readFile(f.json),original,'Source JSON may not be modified');
});

test('SQLite mode does not open JSON paths or accept permissive files',async()=>{
  const f=await sandbox(); assert.throws(()=>validateSqliteTarget(f.json),/explicit GCB_DATA_FILE/);
  await writeFile(f.db,'not a SQLite file',{mode:0o644});
  await assert.rejects(openSqliteStore(f.db),/private regular file/);
  assert.equal(await readFile(f.db,'utf8'),'not a SQLite file');
});

// The HTTP API must use precisely the same store methods under SQLite and
// preserve records when a new process restarts on the same disposable database.
test('SQLite opt-in server retains authenticated API writes across process restart', {timeout:25000},async()=>{
  const f=await sandbox();const root=new URL('..',import.meta.url);
  const token='sqlite-test-'+'q'.repeat(48);
  const env={...process.env,GCB_AUTH_TOKEN:token,GCB_STORAGE_BACKEND:'sqlite',GCB_DATA_FILE:f.db,HOST:'127.0.0.1',PORT:'0'};
  const start=async()=>{
    const cp=spawn(process.execPath,['src/server.mjs'],{cwd:root,env,stdio:['ignore','pipe','pipe']});
    let stderr='';cp.stderr.on('data',x=>{stderr+=x.toString();});
    const address=await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error('Timeout: '+stderr)),6500);
      cp.once('error',reject);cp.once('exit',code=>reject(new Error(`Exit ${code}: ${stderr}`)));
      cp.stdout.on('data',x=>{const match=x.toString().match(/http:\/\/127\.0\.0\.1:(\d+)/);if(match){clearTimeout(timer);resolve('http://127.0.0.1:'+match[1]);}});
    });
    return {cp,address};
  };
  const stop=async cp=>{cp.kill('SIGTERM');await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(new Error('stop timeout')),5000);cp.once('exit',()=>{clearTimeout(t);resolve();});});};
  const call=async(address,path,method='GET',body)=>{
    const resp=await fetch(address+path,{method,headers:{Authorization:'Bearer '+token,...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});
    return {status:resp.status,data:await resp.json()};
  };
  let run;
  try{
    run=await start();
    const added=await call(run.address,'/api/collections','POST',{name:'SQLite Research'});
    assert.equal(added.status,201);
    const addedBookmark=await call(run.address,'/api/bookmarks','POST',{url:'https://example.org/book','title':'hello'});
    assert.equal(addedBookmark.status,201);
    await stop(run.cp); run=null;
    const inspect=await inspectSqlite(f.db);assert.equal(inspect.data.bookmarks.length,1);
    run=await start();
    const lib=await call(run.address,'/api/library');
    assert.equal(lib.status,200);
    assert.equal(lib.data.bookmarks[0].id,addedBookmark.data.id);
    assert.equal(lib.data.collections[0].id,added.data.id);
  }finally{if(run){await stop(run.cp).catch(()=>run.cp.kill('SIGKILL'));}}
  await assert.rejects(access(f.db+'.lock'),e=>e.code==='ENOENT');
});

test('SQLite rollback on injected mid-transaction database failure preserves old records and counters', async()=>{
  const f=await sandbox();const store=await openSqliteStore(f.db);
  const injection=new DatabaseSync(f.db);
  injection.exec(`CREATE TRIGGER inject_failure BEFORE INSERT ON bookmarks
    WHEN NEW.id='b_bad' BEGIN SELECT RAISE(ABORT, 'simulated disk/SQL write failure'); END;`);
  injection.close();
  await assert.rejects(store.mutate(s=>{s.collections.push(c());s.bookmarks.push(b('b_bad'));}),/simulated disk\/SQL write failure/);
  assert.deepEqual(store.snapshot(),empty());
  assert.deepEqual((await inspectSqlite(f.db)).data,empty());
  await store.mutate(s=>{s.collections.push(c());s.bookmarks.push(b('b_good'));});
  assert.equal(store.snapshot().bookmarks[0].id,'b_good');
  await store.close();
  assert.equal((await inspectSqlite(f.db)).data.bookmarks.length,1);
});

test('SQLite unclean shutdown retains committed record and fail-closed lock, supports verified manual recovery', {timeout:25000},async()=>{
  const f=await sandbox(); const root=new URL('..',import.meta.url);
  const token='sqlite-crash-'+'k'.repeat(50);
  const env={...process.env,GCB_AUTH_TOKEN:token,GCB_STORAGE_BACKEND:'sqlite',GCB_DATA_FILE:f.db,HOST:'127.0.0.1',PORT:'0'};
  const start=()=>new Promise((resolve,reject)=>{
    const cp=spawn(process.execPath,['src/server.mjs'],{cwd:root,env,stdio:['ignore','pipe','pipe']});
    let stderr='';cp.stderr.on('data',x=>{stderr+=x.toString();});
    const timer=setTimeout(()=>reject(new Error('Startup timeout: '+stderr)),6000);
    cp.once('error',reject);cp.once('exit',code=>{clearTimeout(timer);resolve({cp,code,stderr,address:null});});
    cp.stdout.on('data',x=>{const m=x.toString().match(/http:\/\/127\.0\.0\.1:(\d+)/);if(m){clearTimeout(timer);resolve({cp,address:'http://127.0.0.1:'+m[1]});}});
  });
  const stop=async(cp,signal)=>{
    cp.kill(signal);await new Promise((resolve,reject)=>{
      const t=setTimeout(()=>reject(new Error('Process did not exit')),4500);
      cp.once('exit',()=>{clearTimeout(t);resolve();});
    });
  };
  let live;
  try{
    live=await start();assert.ok(live.address);
    const response=await fetch(live.address+'/api/bookmarks',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({url:'https://example.org/crash',title:'before SIGKILL'})});
    assert.equal(response.status,201);const added=await response.json();
    await stop(live.cp,'SIGKILL');live=null;
    assert.equal((await inspectSqlite(f.db)).data.bookmarks[0].id,added.id);
    const failed=await start();assert.equal(failed.address,null);assert.match(failed.stderr,/Library is locked/);
    // Only the disposable fixture's now-abandoned lock is removed, after the
    // exited child process has been explicitly observed above.
    await unlink(f.db+'.lock');
    live=await start();assert.ok(live.address);
    const data=await fetch(live.address+'/api/library',{headers:{Authorization:'Bearer '+token}});
    assert.equal(data.status,200);assert.equal((await data.json()).bookmarks[0].id,added.id);
  }finally{if(live)await stop(live.cp,'SIGTERM').catch(()=>live.cp.kill('SIGKILL'));}
  await assert.rejects(access(f.db+'.lock'),e=>e.code==='ENOENT');
});

test('single-record updates leave unrelated SQLite rows untouched and reorders still transact', async () => {
  const f = await sandbox();
  const store = await openSqliteStore(f.db);
  try {
    await store.mutate(s => { s.collections.push(c()); s.bookmarks.push(b('b1'), b('b2')); });
    const injection = new DatabaseSync(f.db);
    try {
      injection.exec(`CREATE TRIGGER fail_unrelated BEFORE UPDATE ON bookmarks
        WHEN OLD.id = 'b2' BEGIN SELECT RAISE(ABORT, 'unrelated row must not be rewritten'); END;`);
    } finally { injection.close(); }
    await store.mutate(s => { s.bookmarks[0].notes = 'one-row edit'; });
    const persisted = store.snapshot();
    assert.equal(persisted.bookmarks[0].notes, 'one-row edit');
    assert.equal(persisted.bookmarks[1].notes, '💾 notes');
    await assert.rejects(store.mutate(s => { s.bookmarks.reverse(); }), /unrelated row must not be rewritten/);
    assert.deepEqual(store.snapshot(), persisted, 'failed reorder must not change cached data');
    assert.deepEqual((await inspectSqlite(f.db)).data, persisted, 'failed reorder must roll back on disk');
  } finally { await store.close(); }
});
