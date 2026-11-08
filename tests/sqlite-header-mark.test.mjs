import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, access, stat, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { openSqliteStore } from '../src/sqlite-store.mjs';
import { inspectSqlite, SQLITE_APPLICATION_ID } from '../src/sqlite-migrate.mjs';
import { markLegacySqliteHeader } from '../src/sqlite-header-mark.mjs';
import { acquireSingleWriterLock } from '../src/lock.mjs';

const date = '2026-11-08T12:00:00.000Z';
const collection = {id:'c1',name:'Preserve 💙',createdAt:date};
const bookmark = {id:'b1',url:'https://example.org/ö',title:'日本語 🧪',description:'',notes:'test',tags:['安全'],
  collectionId:'c1',status:'unread',favorite:true,pinned:false,trashedAt:null,createdAt:date,updatedAt:date};
async function fixture(){
  const dir=await mkdtemp(join(tmpdir(),'gcb-header-'));
  const source=join(dir,'old.sqlite'),target=join(dir,'new.sqlite');
  const store=await openSqliteStore(source);
  await store.mutate(s=>{s.collections.push(collection);s.bookmarks.push(bookmark);});
  await store.close();
  const d=new DatabaseSync(source);
  try {d.exec('PRAGMA application_id=0; PRAGMA user_version=0;');}finally{d.close();}
  return {dir,source,target};
}
async function absent(file){await assert.rejects(access(file),e=>e.code==='ENOENT');}

test('offline legacy header conversion preserves original bytes, Unicode, references, order and permissions',async()=>{
  const f=await fixture();const before=await readFile(f.source);
  const result=await markLegacySqliteHeader(f.source,f.target);
  assert.equal(result.bookmarks,1);assert.equal(result.collections,1);
  assert.equal((await stat(f.target)).mode&0o777,0o600);
  assert.deepEqual(await readFile(f.source),before);
  const source=new DatabaseSync(f.source,{readOnly:true});const target=new DatabaseSync(f.target,{readOnly:true});
  try {
    assert.equal(source.prepare('PRAGMA application_id').get().application_id,0);
    assert.equal(source.prepare('PRAGMA user_version').get().user_version,0);
    assert.equal(target.prepare('PRAGMA application_id').get().application_id,SQLITE_APPLICATION_ID);
    assert.equal(target.prepare('PRAGMA user_version').get().user_version,1);
  } finally {source.close();target.close();}
  const data=(await inspectSqlite(f.target)).data;
  assert.deepEqual(data.collections,[collection]);assert.deepEqual(data.bookmarks,[bookmark]);
  await absent(f.source+'.lock');
  const store=await openSqliteStore(f.target);
  await store.mutate(s=>s.bookmarks[0].notes='updated 🐱');await store.close();
  assert.equal((await inspectSqlite(f.target)).data.bookmarks[0].notes,'updated 🐱');
  assert.deepEqual(await readFile(f.source),before);
});

test('offline header conversion refuses overwrites and nonlegacy sources without modifying data',async()=>{
  const f=await fixture();const before=await readFile(f.source);
  await writeFile(f.target,'private destination');
  await assert.rejects(markLegacySqliteHeader(f.source,f.target),/Destination already exists/);
  assert.equal(await readFile(f.target,'utf8'),'private destination');
  assert.deepEqual(await readFile(f.source),before);
  await absent(f.source+'.lock');
  const newFile=join(f.dir,'fresh.sqlite');
  await markLegacySqliteHeader(f.source,newFile);
  await assert.rejects(markLegacySqliteHeader(newFile,join(f.dir,'again.sqlite')),/not a legacy/);
  await absent(join(f.dir,'again.sqlite'));
});

test('offline header conversion holds the canonical source writer lock and rejects foreign version headers',async()=>{
  const f=await fixture();const before=await readFile(f.source);
  const alias=join(f.dir,'alias.sqlite');await symlink(f.source,alias);
  const lock=await acquireSingleWriterLock(f.source);
  try {
    await assert.rejects(markLegacySqliteHeader(alias,f.target),/locked by another writer/);
    await absent(f.target);
  } finally { await lock.release(); }
  const h=new DatabaseSync(f.source);
  try {h.exec('PRAGMA application_id=999;');}finally{h.close();}
  await assert.rejects(markLegacySqliteHeader(f.source,f.target),/application ID or file schema version/);
  await absent(f.target);
  await absent(f.source+'.lock');
  assert.notDeepEqual(await readFile(f.source),before); // only intentional fixture header changed
});

test('header conversion CLI operates only on create-new destination',async()=>{
  const f=await fixture();
  const res=spawnSync(process.execPath,['src/sqlite-header-mark.mjs',f.source,f.target],{
    cwd:new URL('..',import.meta.url),encoding:'utf8'
  });
  assert.equal(res.status,0,res.stderr);
  assert.equal(JSON.parse(res.stdout).userVersion,1);
  assert.equal((await inspectSqlite(f.target)).data.bookmarks.length,1);
});
