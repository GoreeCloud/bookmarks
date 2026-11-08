import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, access, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { planSqliteMigration, migrateJsonToSqlite, exportSqliteToJson, inspectSqlite } from '../src/sqlite-migrate.mjs';
const date = '2026-11-08T12:00:00.000Z';
const collection = (id = 'c1') => ({ id, name: 'Rèsearch 📚', createdAt: date });
const bookmark = (id = 'b1', collectionId = 'c1') => ({ id, url:`https://example.org/${id}`, title:`日本語 ${id}`,
  description:'ö', notes:'🐱 研究', tags:['science','読書'], collectionId, status:'unread', favorite:false,
  pinned:true, trashedAt:null, createdAt:date, updatedAt:date });
const fixture = () => ({ schema:1, bookmarks:[bookmark(), bookmark('b2', null)], collections:[collection()] });
async function sandbox() {
  const dir = await mkdtemp(join(tmpdir(), 'gcb-sqlite-'));
  return { dir, source:join(dir,'input.json'), db:join(dir,'library.sqlite'), json:join(dir,'roundtrip.json') };
}
async function absent(path) {await assert.rejects(access(path), e => e.code === 'ENOENT');}

test('offline SQLite plan is read-only; migration and export preserve Unicode, IDs, tags, status and ordering',async()=>{
  const f=await sandbox();const original=fixture();
  const bytes=Buffer.from(JSON.stringify(original));await writeFile(f.source,bytes);
  const planned=await planSqliteMigration(f.source);assert.equal(planned.bookmarks,2);assert.equal(planned.tags,4);
  assert.equal(planned.sha256,createHash('sha256').update(bytes).digest('hex'));
  await absent(f.db);
  const result=await migrateJsonToSqlite(f.source,f.db);
  assert.equal(result.sha256,planned.sha256);
  assert.deepEqual(JSON.parse(await readFile(f.source,'utf8')),original);
  assert.equal((await stat(f.db)).mode&0o777,0o600);
  const inspected=await inspectSqlite(f.db);assert.deepEqual(inspected.data,original);
  await exportSqliteToJson(f.db,f.json);
  assert.equal((await stat(f.json)).mode&0o777,0o600);
  assert.deepEqual(JSON.parse(await readFile(f.json,'utf8')),original);
  assert.equal(inspected.metadata.get('source_sha256'),planned.sha256);
});

test('migration never replaces a preexisting destination or source, even on a repeated request',async()=>{
  const f=await sandbox(); const bytes=JSON.stringify(fixture());await writeFile(f.source,bytes);
  await writeFile(f.db,'do not replace');
  await assert.rejects(migrateJsonToSqlite(f.source,f.db),/Destination already exists/);
  assert.equal(await readFile(f.db,'utf8'),'do not replace');assert.equal(await readFile(f.source,'utf8'),bytes);
  const fresh=join(f.dir,'fresh.sqlite');await migrateJsonToSqlite(f.source,fresh);
  await writeFile(f.json,'keep me');
  await assert.rejects(exportSqliteToJson(fresh,f.json),/Destination already exists/);
  assert.equal(await readFile(f.json,'utf8'),'keep me');
});

test('migration fails closed on invalid UTF-8, duplicate IDs and broken collection references',async()=>{
  const f=await sandbox();
  const cases=[Buffer.from([0x7b,0xc3,0x28]),
    Buffer.from(JSON.stringify({...fixture(),bookmarks:[bookmark(),bookmark()]})),
    Buffer.from(JSON.stringify({...fixture(),bookmarks:[bookmark('x','does-not-exist')]})),
    Buffer.from(JSON.stringify({...fixture(),collections:[collection(),collection()]}))];
  for(const bytes of cases){
    await writeFile(f.source,bytes);
    await assert.rejects(migrateJsonToSqlite(f.source,f.db));
    await absent(f.db);
    assert.deepEqual(await readFile(f.source),bytes);
  }
});

test('corruption/tampering are detected without creating a JSON export',async()=>{
  const f=await sandbox();await writeFile(f.source,JSON.stringify(fixture()));
  await migrateJsonToSqlite(f.source,f.db);
  const db=new DatabaseSync(f.db);
  db.exec("PRAGMA foreign_keys=OFF");
  db.prepare("UPDATE bookmarks SET status='read' WHERE id='b1'").run();
  db.close();
  await assert.rejects(exportSqliteToJson(f.db,f.json),/payload mismatch/);
  await absent(f.json);
});

test('bulk round trip preserves 1,201 ordered records and is restart/read-only compatible',async()=>{
  const f=await sandbox();const library={schema:1,collections:[collection()],bookmarks:Array.from({length:1201},(_,i)=>bookmark('id'+i,i%2?'c1':null))};
  await writeFile(f.source,JSON.stringify(library));
  await migrateJsonToSqlite(f.source,f.db);
  const opened=await inspectSqlite(f.db);assert.deepEqual(opened.data,library);
  const db=new DatabaseSync(f.db,{readOnly:true});
  try{assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM bookmarks').get().n,1201);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM tags').get().n,2402);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM bookmarks WHERE collection_id IS NULL').get().n,601);
  }finally{db.close();}
});

test('SQLite CLI supports plan, migrate, inspect and export without creating files during plan',async()=>{
  const f=await sandbox();await writeFile(f.source,JSON.stringify(fixture()));
  const cli= (...args)=>spawnSync(process.execPath,['src/sqlite-migrate.mjs',...args],{cwd:new URL('..',import.meta.url),encoding:'utf8'});
  const plan=cli('plan',f.source);assert.equal(plan.status,0);assert.equal(JSON.parse(plan.stdout).bookmarks,2);
  await absent(f.db);
  const migrate=cli('migrate',f.source,f.db);assert.equal(migrate.status,0,migrate.stderr);
  const inspect=cli('inspect',f.db);assert.equal(inspect.status,0,inspect.stderr);
  assert.equal(JSON.parse(inspect.stdout).collections,1);
  const exp=cli('export',f.db,f.json);assert.equal(exp.status,0,exp.stderr);
  assert.deepEqual(JSON.parse(await readFile(f.json,'utf8')),fixture());
});
