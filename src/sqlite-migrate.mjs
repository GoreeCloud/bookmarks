/** Offline-only migration tooling; the live Bookmarks server continues to use JSON.
 * SQLite is supplied by node:sqlite (experimental in Node 22). No third-party package.
 */
import { DatabaseSync } from 'node:sqlite';
import { createHash, randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { open, readFile, link, unlink, mkdir, stat } from 'node:fs/promises';
import { resolve, dirname, basename, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { assertLibrary } from './schema.mjs';
import { parseUtf8Json } from './json.mjs';

const MAX_BYTES = 64 * 1024 * 1024;
export const SQLITE_SCHEMA_VERSION = '1';
// 'GCBM': identify databases owned by GoreeCloud Bookmarks to prevent an
// unrelated SQLite file from being mistaken for a Bookmarks library.
export const SQLITE_APPLICATION_ID = 0x4743424d;
const VERSION = SQLITE_SCHEMA_VERSION;
export const sqliteFileHeaderSql = `PRAGMA application_id=${SQLITE_APPLICATION_ID}; PRAGMA user_version=1;`;
const sha256 = b => createHash('sha256').update(b).digest('hex');
export const schemaSql = `
CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT;
CREATE TABLE collections (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
  created_at TEXT NOT NULL,
  ordinal INTEGER NOT NULL UNIQUE CHECK (ordinal >= 0),
  payload TEXT NOT NULL
) STRICT;
CREATE TABLE bookmarks (
  id TEXT PRIMARY KEY NOT NULL,
  url TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  notes TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('unread','reading','read')),
  favorite INTEGER NOT NULL CHECK (favorite IN (0,1)),
  pinned INTEGER NOT NULL CHECK (pinned IN (0,1)),
  trashed_at TEXT,
  collection_id TEXT REFERENCES collections(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  ordinal INTEGER NOT NULL UNIQUE CHECK (ordinal >= 0),
  payload TEXT NOT NULL
) STRICT;
CREATE TABLE tags (
  bookmark_id TEXT NOT NULL REFERENCES bookmarks(id) ON DELETE CASCADE,
  ordinal INTEGER NOT NULL CHECK (ordinal >= 0),
  tag TEXT NOT NULL CHECK (length(tag) BETWEEN 1 AND 32),
  PRIMARY KEY(bookmark_id, ordinal)
) STRICT;
CREATE INDEX idx_bookmarks_collection ON bookmarks(collection_id);
CREATE INDEX idx_bookmarks_read_status ON bookmarks(status);
CREATE INDEX idx_bookmarks_trashed ON bookmarks(trashed_at);
CREATE INDEX idx_bookmarks_created ON bookmarks(created_at);
CREATE INDEX idx_tags_text ON tags(tag);
`;
function stats(data, bytes) {
  return { schema: data.schema, collections: data.collections.length, bookmarks: data.bookmarks.length,
    tags: data.bookmarks.reduce((s,b) => s + b.tags.length,0), bytes: bytes.length, sha256: sha256(bytes) };
}
async function readSource(file) {
  const path = resolve(file);
  const info = await stat(path);
  if (!info.isFile() || info.size > MAX_BYTES) throw new Error('JSON library must be a regular file no larger than 64 MiB');
  const bytes = await readFile(path);
  if (bytes.length > MAX_BYTES) throw new Error('JSON library exceeds 64 MiB');
  const data = assertLibrary(parseUtf8Json(bytes));
  return { path, bytes, data, summary: stats(data,bytes) };
}

export async function planSqliteMigration(source) {
  return (await readSource(source)).summary;
}
export function openDb(path, readOnly = false) {
  const db = new DatabaseSync(path, { readOnly });
  db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=2000;');
  return db;
}
export function loadVerified(db, { queryOnly = true } = {}) {
  if (queryOnly) db.exec('PRAGMA query_only=ON');
  const appId = db.prepare('PRAGMA application_id').get().application_id;
  const fileVersion = db.prepare('PRAGMA user_version').get().user_version;
  // Keep previously issued v0.1.18-v0.1.20 version-zero headers read/write
  // compatible without altering them. All new databases have a distinct ID
  // and file schema version; unknown or mixed headers fail closed.
  if (!((appId === 0 && fileVersion === 0) ||
        (appId === SQLITE_APPLICATION_ID && fileVersion === 1))) {
    throw new Error('Unsupported SQLite application ID or file schema version');
  }
  if (db.prepare('PRAGMA integrity_check').all().some(x=>Object.values(x)[0] !== 'ok')) throw new Error('SQLite integrity_check failed');
  if (db.prepare('PRAGMA foreign_key_check').all().length) throw new Error('SQLite foreign_key_check failed');
  const metadata = new Map(db.prepare('SELECT key,value FROM metadata').all().map(({key,value})=>[key,value]));
  if (metadata.get('schema_version') !== VERSION || !/^[0-9a-f]{64}$/.test(metadata.get('source_sha256')||'')) {
    throw new Error('Unsupported or incomplete SQLite migration schema');
  }
  const collectionRows = db.prepare('SELECT * FROM collections ORDER BY ordinal').all();
  const bookmarkRows = db.prepare('SELECT * FROM bookmarks ORDER BY ordinal').all();
  const tagRows = db.prepare('SELECT * FROM tags ORDER BY bookmark_id, ordinal').all();
  const tags = new Map();
  for (const t of tagRows) {
    if (!tags.has(t.bookmark_id)) tags.set(t.bookmark_id,[]);
    tags.get(t.bookmark_id).push(t.tag);
  }
  const collections = collectionRows.map(c => {
    const parsed = parseUtf8Json(Buffer.from(c.payload, 'utf8'));
    if (parsed.id !== c.id || parsed.name !== c.name || parsed.createdAt !== c.created_at) throw new Error('SQLite collection payload mismatch');
    return parsed;
  });
  const bookmarks = bookmarkRows.map(b => {
    const parsed = parseUtf8Json(Buffer.from(b.payload, 'utf8'));
    if (parsed.id !== b.id || parsed.url !== b.url || parsed.title !== b.title || parsed.description !== b.description ||
        parsed.notes !== b.notes || parsed.status !== b.status || parsed.favorite !== !!b.favorite ||
        parsed.pinned !== !!b.pinned || parsed.trashedAt !== b.trashed_at || parsed.collectionId !== b.collection_id ||
        parsed.createdAt !== b.created_at || parsed.updatedAt !== b.updated_at ||
        JSON.stringify(parsed.tags) !== JSON.stringify(tags.get(b.id)||[])) throw new Error('SQLite bookmark payload mismatch');
    return parsed;
  });
  const data = assertLibrary({ schema:1, bookmarks, collections });
  const summary = stats(data, Buffer.from(JSON.stringify(data),'utf8'));
  const counts = ['bookmark_count','collection_count','tag_count'];
  for (const [k,v] of counts.map((key,i)=>[key,[summary.bookmarks,summary.collections,summary.tags][i]])) {
    if (metadata.get(k) !== String(v)) throw new Error(`SQLite metadata mismatch: ${k}`);
  }
  return { data, metadata, summary };
}
async function publishNew(temp, target) {
  try { await link(temp,target); }
  catch (e) {
    if (e.code === 'EEXIST') throw new Error('Destination already exists; no file was overwritten');
    throw e;
  }
}
async function createPrivateTemp(target, suffix) {
  await mkdir(dirname(target),{recursive:true,mode:0o700});
  const temp = join(dirname(target),`.gcb-${basename(target)}-${randomUUID()}.${suffix}.tmp`);
  const handle = await open(temp,'wx',0o600);
  await handle.close();
  return temp;
}
export async function migrateJsonToSqlite(source, destination) {
  if (!destination || typeof destination !== 'string') throw new Error('A new SQLite destination is required');
  const input = await readSource(source);
  const target = resolve(destination);
  if (target === input.path) throw new Error('Source and target must differ');
  const temp = await createPrivateTemp(target, 'sqlite');
  let db;
  try {
    db = openDb(temp);
    db.exec('PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL;');
    db.exec(schemaSql);
    db.exec(sqliteFileHeaderSql);
    db.exec('BEGIN IMMEDIATE');
    try {
      const meta = db.prepare('INSERT INTO metadata(key,value) VALUES(?,?)');
      for (const [key,value] of Object.entries({schema_version:VERSION,source_sha256:input.summary.sha256,
        bookmark_count:String(input.summary.bookmarks),collection_count:String(input.summary.collections),tag_count:String(input.summary.tags)})) meta.run(key,value);
      const insertCollection=db.prepare('INSERT INTO collections(id,name,created_at,ordinal,payload) VALUES(?,?,?,?,?)');
      input.data.collections.forEach((c,i)=>insertCollection.run(c.id,c.name,c.createdAt,i,JSON.stringify(c)));
      const insertBookmark=db.prepare(`INSERT INTO bookmarks
        (id,url,title,description,notes,status,favorite,pinned,trashed_at,collection_id,created_at,updated_at,ordinal,payload)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
      const insertTag=db.prepare('INSERT INTO tags(bookmark_id,ordinal,tag) VALUES(?,?,?)');
      input.data.bookmarks.forEach((b,i)=>{
        insertBookmark.run(b.id,b.url,b.title,b.description,b.notes,b.status,Number(b.favorite),Number(b.pinned),
          b.trashedAt,b.collectionId,b.createdAt,b.updatedAt,i,JSON.stringify(b));
        b.tags.forEach((t,n)=>insertTag.run(b.id,n,t));
      });
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }
    db.close(); db=null;
    // Fully reopen and verify before exposing the candidate at the requested path.
    const confirmed=await inspectSqlite(temp);
    if (!isDeepStrictEqual(confirmed.data,input.data)) throw new Error('Round-trip data mismatch; migration refused');
    // Recheck source bytes before publishing: a concurrent writer must not cause a stale migration to be advertised.
    if (sha256(await readFile(input.path)) !== input.summary.sha256) throw new Error('Source changed during migration');
    await publishNew(temp,target);
    return {target,...input.summary};
  } finally {
    if(db) {try {db.close();}catch {}}
    await unlink(temp).catch(()=>{});
    for (const suffix of ['-journal','-wal','-shm']) await unlink(temp+suffix).catch(()=>{});
  }
}
export async function inspectSqlite(file) {
  const path=resolve(file);
  const db=openDb(path,true);
  try { return loadVerified(db); }
  finally { db.close(); }
}
export async function exportSqliteToJson(source,destination) {
  if (!destination || typeof destination!=='string') throw new Error('A new JSON destination is required');
  const file=resolve(source),target=resolve(destination);
  if(file===target) throw new Error('Source and target must differ');
  const {data,metadata,summary}=await inspectSqlite(file);
  const temp=await createPrivateTemp(target,'json');
  try {
    const handle=await open(temp,'w',0o600);
    try {await handle.writeFile(JSON.stringify(data,null,2)+'\n');await handle.sync();}
    finally {await handle.close();}
    await publishNew(temp,target);
    return {target,bookmarks:summary.bookmarks,collections:summary.collections,sourceSha256:metadata.get('source_sha256')};
  } finally {await unlink(temp).catch(()=>{});}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const [operation,source,destination,...rest]=process.argv.slice(2);
  try{
    if(rest.length||!source)throw new Error('Usage: node src/sqlite-migrate.mjs plan JSON | migrate JSON NEW_DB | inspect DB | export DB NEW_JSON');
    const result=operation==='plan'&&!destination ? await planSqliteMigration(source):
      operation==='migrate'&&destination ? await migrateJsonToSqlite(source,destination):
      operation==='inspect'&&!destination ? (await inspectSqlite(source)).summary:
      operation==='export'&&destination ? await exportSqliteToJson(source,destination):null;
    if(!result)throw new Error('Invalid arguments');
    console.log(JSON.stringify(result,null,2));
  }catch(e){console.error('Migration failed:',e.message);process.exitCode=1;}
}
