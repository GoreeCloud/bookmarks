import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cleanUrl, makeBookmark, makeCollection, dedupeKey, exportHtml, AppError } from '../src/core.mjs';
import { openStore } from '../src/store.mjs';
import { backupLibrary, verifyBackup } from '../src/backup.mjs';

test('URL safety: reject scripts, local files and malformed URLs', () => {
  for (const input of ['javascript:alert(1)', 'file:///etc/passwd', 'data:text/html,<script>x</script>', 'not a URL']) {
    assert.throws(() => cleanUrl(input), AppError);
  }
});
test('clean tracking parameters but preserve meaningful query and fragment', () => {
  assert.equal(cleanUrl('https://example.com/a?utm_source=ad&id=42&fbclid=x#intro'), 'https://example.com/a?id=42#intro');
  assert.equal(cleanUrl('https://user:password@example.com/'), 'https://example.com/');
});
test('bookmark validation, tag normalization and collection authorization', () => {
  const c = makeCollection({ name: 'Reading' });
  const item = makeBookmark({ url: 'https://example.com', tags: ['Research', 'research', '  AI  '], collectionId: c.id }, null, [c]);
  assert.deepEqual(item.tags, ['research', 'ai']);
  assert.equal(item.title, 'example.com');
  assert.throws(() => makeBookmark({ url: 'https://example.com', collectionId: 'missing' }, null, [c]), AppError);
});
test('reject invalid limits and statuses', () => {
  assert.throws(() => makeBookmark({ url: 'https://example.com', title: 'x'.repeat(201) }), AppError);
  assert.throws(() => makeBookmark({ url: 'https://example.com', status: 'unknown' }), AppError);
  assert.throws(() => makeBookmark({ url: 'https://example.com', tags: ['x'.repeat(33)] }), AppError);
});
test('deduplication ignores fragments and tracking but not meaningful parameters', () => {
  assert.equal(dedupeKey('https://example.com/a#x'), dedupeKey('https://example.com/a?utm_medium=x#y'));
  assert.notEqual(dedupeKey('https://example.com/a?id=1'), dedupeKey('https://example.com/a?id=2'));
});
test('Netscape HTML export escapes untrusted titles and URL parameters', () => {
  const html = exportHtml([{ url: 'https://example.com/?a=1&b=2', title: '<hello> "friend"', trashedAt: null }]);
  assert.match(html, /&lt;hello&gt;/);
  assert.match(html, /&amp;b=2/);
  assert.doesNotMatch(html, /<hello>/);
});
test('atomic store persists and serializes concurrent changes, and tolerates failed transactions', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'gcb-test-'));
  try {
    const path = join(dir, 'bookmarks.json');
    const store = await openStore(path);
    await Promise.all(Array.from({ length: 12 }, (_, i) => store.mutate(s => { s.bookmarks.push(makeBookmark({ url: 'https://example.org/' + i })); })));
    assert.equal(store.snapshot().bookmarks.length, 12);
    const reopened = await openStore(path);
    assert.equal(reopened.snapshot().bookmarks.length, 12);
    await assert.rejects(() => store.mutate(() => { throw new Error('abort'); }), /abort/);
    assert.equal(store.snapshot().bookmarks.length, 12);
    await store.mutate(s => { s.collections.push(makeCollection({ name: 'Future' })); });
    assert.equal((await openStore(path)).snapshot().collections.length, 1);
    assert.equal(JSON.parse(await readFile(path, 'utf8')).schema, 1);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('backup command copies the exact snapshot with verified SHA-256', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'gcb-backup-'));
  try {
    const source = join(folder, 'data.json');
    const store = await openStore(source);
    await store.mutate(s => s.bookmarks.push(makeBookmark({ url: 'https://example.org/backup' })));
    const report = await backupLibrary(source, join(folder, 'backups'));
    const restored = JSON.parse(await readFile(report.target, 'utf8'));
    assert.equal(restored.bookmarks[0].title, 'example.org');
    assert.match(report.sha256, /^[0-9a-f]{64}$/);
  } finally { await rm(folder, { recursive: true, force: true }); }
});

test('search API helper filters content and enforces pagination and safe options', async () => {
  const { searchBookmarks } = await import('../src/core.mjs');
  const c = makeCollection({ name: 'Research' });
  const a = makeBookmark({ url: 'https://example.org/research', title: 'Personal research', tags: ['reference'], favorite: true, collectionId: c.id, pinned: true }, null, [c]);
  const b = makeBookmark({ url: 'https://example.org/guide', title: 'Design guide', tags: ['design'], status: 'read' });
  const trashed = makeBookmark({ url: 'https://example.org/old', title: 'Old notes', trashedAt: new Date().toISOString() });
  const library = { bookmarks: [a, b, trashed] };
  const result = searchBookmarks(library, new URLSearchParams('q=research&favorite=true&tag=reference'));
  assert.equal(result.total, 1);
  assert.equal(result.items[0].id, a.id);
  assert.equal(searchBookmarks(library, new URLSearchParams('collectionId=none')).total, 1);
  assert.equal(searchBookmarks(library, new URLSearchParams('status=read')).items[0].id, b.id);
  assert.equal(searchBookmarks(library, new URLSearchParams('trash=true')).items[0].id, trashed.id);
  assert.equal(searchBookmarks(library, new URLSearchParams('sort=title&limit=1&offset=1')).items[0].id, a.id);
  for (const filter of ['limit=10000', 'limit=0', 'offset=-1', 'favorite=bad', 'status=deleted', 'sort=random', 'limit=1&limit=2', 'q=x'.repeat(201), 'unexpected=hello']) {
    assert.throws(() => searchBookmarks(library, new URLSearchParams(filter)), AppError);
  }
  assert.equal(library.bookmarks.length, 3);
});


test('snapshot checksum manifest catches corruption without changing the backup', async () => {
  const { writeFile } = await import('node:fs/promises');
  const dir = await mkdtemp(join(tmpdir(), 'gcb-verify-'));
  try {
    const source = join(dir, 'db.json');
    const store = await openStore(source);
    await store.mutate(s => s.collections.push(makeCollection({ name: 'Private notes' })));
    const saved = await backupLibrary(source, join(dir, 'safe'));
    const info = await verifyBackup(saved.target);
    assert.equal(info.sha256, saved.sha256);
    assert.equal(info.collections, 1);
    await writeFile(saved.target, JSON.stringify({ schema: 1, bookmarks: [], collections: [] }));
    await assert.rejects(() => verifyBackup(saved.target), /integrity mismatch/);
    assert.equal((await openStore(source)).snapshot().collections.length, 1);
  } finally { await rm(dir, {recursive: true, force: true}); }
});

test('restore creates a separate data file with byte-for-byte integrity and refuses overwrite', async () => {
  const { stat, writeFile } = await import('node:fs/promises');
  const { restoreBackup } = await import('../src/backup.mjs');
  const dir = await mkdtemp(join(tmpdir(), 'gcb-restore-'));
  try {
    const liveFile = join(dir, 'live.json');
    const store = await openStore(liveFile);
    const c = makeCollection({ name: 'Keep' });
    await store.mutate(s => { s.collections.push(c); s.bookmarks.push(makeBookmark({url:'https://example.org/restore',collectionId:c.id},null,[c])); });
    const backup = await backupLibrary(liveFile, join(dir, 'backups'));
    const dest = join(dir, 'restored', 'new-data.json');
    const restored = await restoreBackup(backup.target, dest);
    assert.equal(restored.sha256, backup.sha256);
    assert.deepEqual(await readFile(dest), await readFile(backup.target));
    assert.equal((await openStore(dest)).snapshot().bookmarks[0].collectionId, c.id);
    assert.equal((await stat(dest)).mode & 0o777, 0o600);
    await assert.rejects(() => restoreBackup(backup.target, dest), /already exists/);
    assert.deepEqual(await readFile(dest), await readFile(backup.target));
    await assert.rejects(() => restoreBackup(backup.target, backup.target), /Cannot restore onto/);
    await writeFile(backup.target, '{"schema":1,"bookmarks":[],"collections":[]}');
    await assert.rejects(() => restoreBackup(backup.target, join(dir,'bad.json')), /integrity mismatch/);
    await assert.rejects(() => readFile(join(dir,'bad.json')), {code:'ENOENT'});
    assert.equal((await openStore(liveFile)).snapshot().bookmarks.length, 1);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('restore CLI reports a verified new file and fails on existing destination', async () => {
  const { spawnSync } = await import('node:child_process');
  const dir = await mkdtemp(join(tmpdir(), 'gcb-restore-cli-'));
  try {
    const source = join(dir, 'source.json');
    await openStore(source).then(s => s.mutate(x => x.collections.push(makeCollection({name:'CLI example'}))));
    const saved = await backupLibrary(source, join(dir,'backups'));
    const destination = join(dir,'new','library.json');
    const script = new URL('../src/backup.mjs', import.meta.url).pathname;
    const first = spawnSync(process.execPath, [script,'restore',saved.target,destination],{encoding:'utf8'});
    assert.equal(first.status,0,first.stderr);
    assert.match(first.stdout,/Backup restored into new file/);
    const second = spawnSync(process.execPath, [script,'restore',saved.target,destination],{encoding:'utf8'});
    assert.notEqual(second.status,0);
    assert.match(second.stderr,/already exists/);
  } finally {await rm(dir,{recursive:true,force:true});}
});

test('invalid stored records fail closed instead of being persisted or restored', async () => {
  const {writeFile} = await import('node:fs/promises');
  const {createHash} = await import('node:crypto');
  const dir = await mkdtemp(join(tmpdir(), 'gcb-schema-'));
  try {
    const file = join(dir, 'library.json');
    const store = await openStore(file);
    const item = makeBookmark({url:'https://example.com/safe'});
    await store.mutate(s => s.bookmarks.push(item));
    await assert.rejects(() => store.mutate(s => s.bookmarks.push({id:'incomplete'})), /Invalid library data/);
    assert.equal((await openStore(file)).snapshot().bookmarks.length, 1);
    const invalid = {schema:1, bookmarks:[{...item, url:'javascript:alert(1)'}],collections:[]};
    await writeFile(join(dir,'corrupt.json'),JSON.stringify(invalid));
    await assert.rejects(() => openStore(join(dir,'corrupt.json')), /unsafe bookmark URL/);
    const raw = Buffer.from(JSON.stringify(invalid));
    const backupFile = join(dir,'malformed-backup.json');
    await writeFile(backupFile,raw);
    await writeFile(backupFile+'.sha256',createHash('sha256').update(raw).digest('hex')+'\n');
    const {restoreBackup} = await import('../src/backup.mjs');
    await assert.rejects(() => restoreBackup(backupFile,join(dir,'should-not-exist.json')),/unsafe bookmark URL/);
    await assert.rejects(() => readFile(join(dir,'should-not-exist.json')),{code:'ENOENT'});
    assert.equal((await openStore(file)).snapshot().bookmarks.length, 1);
  }finally{await rm(dir,{recursive:true,force:true});}
});

// Regression: new snapshots must be flushed with restrictive permissions; malformed mutations
// must never leave partial data or obsolete swap files behind.
test('durable store writes keep private permissions and leave no temporary files on invalid updates', async () => {
  const { readdir, stat } = await import('node:fs/promises');
  const dir = await mkdtemp(join(tmpdir(), 'gcb-durable-'));
  try {
    const file = join(dir, 'library.json');
    const store = await openStore(file);
    await store.mutate(s => s.bookmarks.push(makeBookmark({url:'https://example.com/keep'})));
    assert.equal((await stat(file)).mode & 0o777, 0o600);
    const original = await readFile(file);
    await assert.rejects(() => store.mutate(s => {s.bookmarks[0].url='javascript:alert(1)';}), /Invalid library data/);
    assert.deepEqual(await readFile(file), original);
    assert.deepEqual(await readdir(dir), ['library.json']);
    await store.mutate(s => s.bookmarks.push(makeBookmark({url:'https://example.com/another'})));
    assert.equal((await openStore(file)).snapshot().bookmarks.length, 2);
    assert.deepEqual(await readdir(dir), ['library.json']);
  } finally { await rm(dir,{recursive:true,force:true}); }
});

test('backup data and manifest use private file permissions and remain independently verifiable', async () => {
  const {stat} = await import('node:fs/promises');
  const dir = await mkdtemp(join(tmpdir(), 'gcb-backup-mode-'));
  try {
    const file = join(dir,'source.json');
    const store = await openStore(file);
    await store.mutate(s => s.bookmarks.push(makeBookmark({url:'https://example.org/private'})));
    const saved = await backupLibrary(file, join(dir,'backups'));
    assert.equal((await stat(saved.target)).mode & 0o777, 0o600);
    assert.equal((await stat(saved.target+'.sha256')).mode & 0o777, 0o600);
    assert.equal((await verifyBackup(saved.target)).sha256, saved.sha256);
  } finally { await rm(dir,{recursive:true,force:true}); }
});
