import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, access, stat, open, unlink, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openSqliteStore } from '../src/sqlite-store.mjs';
import { backupSqlite, verifySqliteBackup, restoreSqliteBackup } from '../src/sqlite-backup.mjs';
import { inspectSqlite } from '../src/sqlite-migrate.mjs';
import { acquireSingleWriterLock } from '../src/lock.mjs';
const date='2026-11-08T10:00:00.000Z';
const record={id:'b1',url:'https://example.org/backup',title:'保存 💾',description:'',notes:'é',tags:['t'],
  status:'unread',favorite:false,pinned:false,collectionId:null,trashedAt:null,createdAt:date,updatedAt:date};
async function fixture(){
  const root=await mkdtemp(join(tmpdir(),'gcb-db-backup-')); const source=join(root,'data.sqlite');
  const s=await openSqliteStore(source);await s.mutate(d=>d.bookmarks.push(record));await s.close();
  return {root,source,folder:join(root,'snapshots'),restore:join(root,'restored.sqlite')};
}
test('offline SQLite backup verifies checksum and data, restores into a new file, preserves source',async()=>{
  const f=await fixture();const before=await readFile(f.source);
  const backed=await backupSqlite(f.source,f.folder);
  assert.equal(backed.bookmarks,1);
  assert.equal((await stat(backed.target)).mode&0o777,0o600);
  assert.equal((await stat(backed.target+'.sha256')).mode&0o777,0o600);
  assert.equal((await verifySqliteBackup(backed.target)).sha256,backed.sha256);
  const recovered=await restoreSqliteBackup(backed.target,f.restore);
  assert.equal(recovered.bookmarks,1);
  assert.deepEqual((await inspectSqlite(f.restore)).data.bookmarks[0],record);
  assert.deepEqual(await readFile(f.source),before,'Backup must not modify source bytes');
});
test('SQLite restore refuses overwrites; wrong manifest and tampered backups fail closed',async()=>{
  const f=await fixture();const backed=await backupSqlite(f.source,f.folder);
  await writeFile(f.restore,'private data');
  await assert.rejects(restoreSqliteBackup(backed.target,f.restore),/destination already exists/i);
  assert.equal(await readFile(f.restore,'utf8'),'private data');
  await writeFile(backed.target+'.sha256','0'.repeat(64)+'\n');
  await assert.rejects(verifySqliteBackup(backed.target),/checksum mismatch/);
  await assert.rejects(restoreSqliteBackup(backed.target,join(f.root,'another.sqlite')),/checksum mismatch/);
  await assert.rejects(access(join(f.root,'another.sqlite')),e=>e.code==='ENOENT');
});
test('SQLite backups refuse a locked live writer without changing the database',async()=>{
  const f=await fixture();const lock=await open(f.source+'.lock','wx',0o600);
  try{await assert.rejects(backupSqlite(f.source,f.folder),/locked by another writer/);}
  finally{await lock.close();await unlink(f.source+'.lock');}
  assert.equal((await inspectSqlite(f.source)).data.bookmarks.length,1);
});

test('backup through a symlink cannot bypass the canonical writer lock', async () => {
  const f = await fixture();
  const alias = join(f.root, 'alias.sqlite');
  await symlink(f.source, alias);
  const lock = await acquireSingleWriterLock(f.source);
  try {
    await assert.rejects(backupSqlite(alias, f.folder), /locked by another writer/);
    await assert.rejects(access(f.folder), e => e.code === 'ENOENT');
  } finally { await lock.release(); }
  const copied = await backupSqlite(alias, f.folder);
  assert.equal(copied.bookmarks, 1);
  await assert.rejects(access(f.source + '.lock'), e => e.code === 'ENOENT');
  assert.equal((await inspectSqlite(f.source)).data.bookmarks.length, 1);
});

test('a destination error releases the offline backup writer lock', async () => {
  const f = await fixture();
  // The source file itself cannot be used as a backup directory.
  await assert.rejects(backupSqlite(f.source, f.source), e => e.code === 'EEXIST' || e.code === 'ENOTDIR');
  await assert.rejects(access(f.source + '.lock'), e => e.code === 'ENOENT');
  const next = await acquireSingleWriterLock(f.source);
  await next.release();
  assert.equal((await inspectSqlite(f.source)).data.bookmarks.length, 1);
});
