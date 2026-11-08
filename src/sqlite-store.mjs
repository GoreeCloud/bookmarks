/** Opt-in local SQLite v1 storage adapter. JSON remains the default server backend.
 * Uses the existing offline migration schema and serialized mutation contract.
 * SQLite's local DELETE journal and synchronous=EXTRA protect each transaction;
 * the server's canonical-file sidecar lock still provides fail-closed startup.
 * No implicit JSON migration, auto-restoration, replication or encryption.
 */
import { open, stat, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { assertLibrary } from './schema.mjs';
import { openDb, schemaSql, SQLITE_SCHEMA_VERSION, loadVerified } from './sqlite-migrate.mjs';

const emptyLibrary = () => ({schema: 1, bookmarks: [], collections: []});
const sha256 = data => createHash('sha256').update(data).digest('hex');

/** A SQLite file is never inferred from a JSON path; it must be selected deliberately. */
export function validateSqliteTarget(location) {
  if (!location || typeof location !== 'string' || !/\.(?:sqlite|db)$/i.test(location)) {
    throw new Error('SQLite backend requires an explicit GCB_DATA_FILE ending in .sqlite or .db');
  }
  return resolve(location);
}

function initialize(db) {
  db.exec(schemaSql);
  const meta = db.prepare('INSERT INTO metadata(key,value) VALUES(?,?)');
  const virgin = emptyLibrary();
  const entries = {
    schema_version: SQLITE_SCHEMA_VERSION,
    source_sha256: sha256(Buffer.from(JSON.stringify(virgin))),
    bookmark_count: '0', collection_count: '0', tag_count: '0'
  };
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const [key, value] of Object.entries(entries)) meta.run(key, value);
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
}

function upsertRows(db, before, after) {
  const collections = db.prepare(`INSERT INTO collections(id,name,created_at,ordinal,payload)
    VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,
    created_at=excluded.created_at, ordinal=excluded.ordinal, payload=excluded.payload`);
  const bookmarks = db.prepare(`INSERT INTO bookmarks
    (id,url,title,description,notes,status,favorite,pinned,trashed_at,collection_id,created_at,updated_at,ordinal,payload)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET
    url=excluded.url, title=excluded.title, description=excluded.description,
    notes=excluded.notes, status=excluded.status, favorite=excluded.favorite,
    pinned=excluded.pinned, trashed_at=excluded.trashed_at, collection_id=excluded.collection_id,
    created_at=excluded.created_at, updated_at=excluded.updated_at,
    ordinal=excluded.ordinal, payload=excluded.payload`);
  const deleteTag = db.prepare('DELETE FROM tags WHERE bookmark_id=?');
  const insertTag = db.prepare('INSERT INTO tags(bookmark_id,ordinal,tag) VALUES(?,?,?)');
  const deleteBookmark = db.prepare('DELETE FROM bookmarks WHERE id=?');
  const deleteCollection = db.prepare('DELETE FROM collections WHERE id=?');
  const upsertMeta = db.prepare(`INSERT INTO metadata(key,value) VALUES(?,?)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value`);
  const oldBookmarks = new Map(before.bookmarks.map(b => [b.id, JSON.stringify(b)]));
  const oldCollections = new Map(before.collections.map(c => [c.id, JSON.stringify(c)]));
  const retainedBookmarkOrder = before.bookmarks.length === after.bookmarks.length &&
    before.bookmarks.every((b, i) => b.id === after.bookmarks[i].id);
  const retainedCollectionOrder = before.collections.length === after.collections.length &&
    before.collections.every((c, i) => c.id === after.collections[i].id);
  const keptBookmarks = new Set(after.bookmarks.map(b => b.id));
  const keptCollections = new Set(after.collections.map(c => c.id));

  // The published v1 schema has UNIQUE ordinals. On an insert/delete/reorder,
  // first relocate old ordinals into a disjoint range to avoid transient collisions.
  // For ordinary metadata edits, skip both the O(n) reindex and unchanged row
  // upserts; the single transaction still protects all touched rows and counts.
  for (const [table, count, orderUnchanged] of [
    ['collections', after.collections.length, retainedCollectionOrder],
    ['bookmarks', after.bookmarks.length, retainedBookmarkOrder]]) {
    if (orderUnchanged) continue;
    const maximum = db.prepare(`SELECT COALESCE(MAX(ordinal), -1) AS n FROM ${table}`).get().n;
    const offset = Number(maximum) + count + 2;
    if (!Number.isSafeInteger(offset)) throw new Error('SQLite ordinal range exhausted');
    db.exec(`UPDATE ${table} SET ordinal=ordinal+${offset}`);
  }
  for (const [i, c] of after.collections.entries()) {
    const serialized = JSON.stringify(c);
    if (!retainedCollectionOrder || oldCollections.get(c.id) !== serialized) {
      collections.run(c.id, c.name, c.createdAt, i, serialized);
    }
  }
  for (const [i, b] of after.bookmarks.entries()) {
    const serialized = JSON.stringify(b);
    const changed = oldBookmarks.get(b.id) !== serialized;
    if (!retainedBookmarkOrder || changed) {
      bookmarks.run(b.id,b.url,b.title,b.description,b.notes,b.status,Number(b.favorite),
        Number(b.pinned),b.trashedAt,b.collectionId,b.createdAt,b.updatedAt,i,serialized);
    }
    if (changed) {
      deleteTag.run(b.id);
      b.tags.forEach((tag, ordinal) => insertTag.run(b.id,ordinal,tag));
    }
  }
  for (const b of before.bookmarks) if (!keptBookmarks.has(b.id)) deleteBookmark.run(b.id);
  for (const c of before.collections) if (!keptCollections.has(c.id)) deleteCollection.run(c.id);
  const tagCount = after.bookmarks.reduce((n,b)=>n+b.tags.length,0);
  for (const [name, count] of [['bookmark_count',after.bookmarks.length],
    ['collection_count',after.collections.length], ['tag_count',tagCount]]) {
    upsertMeta.run(name, String(count));
  }
}

/**
 * Open an existing, verified SQLite migration or create a private empty library.
 * Never converts or opens a JSON file in this function. The caller owns the
 * lifetime of the single-writer `.lock` and closes the adapter before releasing.
 */
export async function openSqliteStore(location) {
  const file = validateSqliteTarget(location);
  await mkdir(dirname(file), { recursive: true, mode: 0o700 });
  let fresh = false;
  try {
    const handle = await open(file, 'wx', 0o600);
    fresh = true;
    await handle.close();
  } catch (e) { if (e.code !== 'EEXIST') throw e; }
  const info = await stat(file);
  if (!info.isFile() || info.mode & 0o077) {
    throw new Error('SQLite library must be a private regular file (mode 0600)');
  }
  let db;
  try {
    db = openDb(file);
    db.exec('PRAGMA journal_mode=DELETE; PRAGMA synchronous=EXTRA;');
    if (fresh) initialize(db);
    let state = loadVerified(db, { queryOnly: false }).data;
    let pending = Promise.resolve();
    let closed = false;
    return {
      snapshot: () => {
        if (closed) throw new Error('SQLite library is closed');
        return structuredClone(state);
      },
      mutate(fn) {
        if (closed) return Promise.reject(new Error('SQLite library is closed'));
        const operation = pending.then(() => {
          const draft = structuredClone(state);
          const output = fn(draft);
          if (output?.then && typeof output.then === 'function') {
            throw new Error('SQLite mutations must be synchronous');
          }
          assertLibrary(draft);
          db.exec('BEGIN IMMEDIATE');
          try {
            upsertRows(db, state, draft);
            db.exec('COMMIT');
          } catch (e) {
            try { db.exec('ROLLBACK'); } catch { /* preserve original failure */ }
            throw e;
          }
          state = draft;
          return output;
        });
        pending = operation.catch(() => {});
        return operation;
      },
      async close() {
        if (closed) return;
        closed = true;
        await pending;
        db.close();
      }
    };
  } catch (e) {
    if (db) { try { db.close(); } catch { /* fail closed */ } }
    throw e;
  }
}
