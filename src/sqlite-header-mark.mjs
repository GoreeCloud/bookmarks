/**
 * Offline, create-new-file transition from legacy (0,0) SQLite header markers
 * to the Bookmarks v1 (GCBM,1) marker pair. This changes no table schema,
 * records, running configuration, or existing source file. It is NOT a general
 * schema-upgrade engine, nor a production cutover tool.
 */
import { backup } from 'node:sqlite';
import { createHash, randomUUID } from 'node:crypto';
import { open, readFile, link, unlink, mkdir, stat } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { pathToFileURL } from 'node:url';
import { acquireSingleWriterLock } from './lock.mjs';
import { openDb, loadVerified, sqliteFileHeaderSql } from './sqlite-migrate.mjs';
import { validateSqliteTarget } from './sqlite-store.mjs';

const MAX_BYTES = 256 * 1024 * 1024;
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

async function sync(file) {
  const f = await open(file, 'r');
  try { await f.sync(); } finally { await f.close(); }
}

/** Explicitly stamp an independently verified legacy database as a new v1 file. */
export async function markLegacySqliteHeader(source, destination) {
  if (!destination || typeof destination !== 'string') throw new Error('A new SQLite destination is required');
  const requested = validateSqliteTarget(source);
  const target = validateSqliteTarget(destination);
  const writer = await acquireSingleWriterLock(requested);
  let candidate;
  try {
    const file = writer.dataFile; // canonical path: aliases cannot evade the lock
    if (target === file) throw new Error('Source and destination must differ');
    const info = await stat(file);
    if (!info.isFile() || info.size > MAX_BYTES || (info.mode & 0o077)) {
      throw new Error('Source must be a private SQLite file no larger than 256 MiB');
    }
    const sourceBytes = await readFile(file);
    const beforeHash = sha256(sourceBytes);
    let existing;
    const input = openDb(file, true);
    try {
      existing = loadVerified(input);
      const appId = input.prepare('PRAGMA application_id').get().application_id;
      const version = input.prepare('PRAGMA user_version').get().user_version;
      if (appId !== 0 || version !== 0) {
        throw new Error('Source is not a legacy zero-header SQLite database; no change made');
      }
      await mkdir(dirname(target), {recursive: true, mode: 0o700});
      candidate = join(dirname(target), `.gcb-${basename(target)}-${randomUUID()}.tmp`);
      const staging = await open(candidate, 'wx', 0o600);
      await staging.close();
      await backup(input, candidate);
    } finally { input.close(); }

    const output = openDb(candidate);
    try {
      output.exec('PRAGMA journal_mode=DELETE; PRAGMA synchronous=EXTRA;');
      output.exec(sqliteFileHeaderSql);
    } finally { output.close(); }
    await sync(candidate);
    const verified = openDb(candidate, true);
    try {
      const after = loadVerified(verified);
      if (!isDeepStrictEqual(after.data, existing.data)) {
        throw new Error('Record mismatch after header stamping; refusing publication');
      }
    } finally { verified.close(); }
    const current = await stat(file);
    if (current.dev !== info.dev || current.ino !== info.ino || sha256(await readFile(file)) !== beforeHash) {
      throw new Error('SQLite source changed during header conversion; refusing publication');
    }
    try { await link(candidate, target); }
    catch (e) {
      if (e.code === 'EEXIST') throw new Error('Destination already exists; no file was overwritten');
      throw e;
    }
    const afterInfo = await stat(target);
    return { target, sourceSha256: beforeHash, size: afterInfo.size,
      bookmarks: existing.summary.bookmarks, collections: existing.summary.collections,
      applicationId: '0x4743424d', userVersion: 1 };
  } finally {
    if (candidate) {
      await unlink(candidate).catch(() => {});
      for (const suffix of ['-journal', '-wal', '-shm']) await unlink(candidate + suffix).catch(() => {});
    }
    await writer.release();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [source, dest, ...extra] = process.argv.slice(2);
  try {
    if (!source || !dest || extra.length) {
      throw new Error('Usage: node src/sqlite-header-mark.mjs LEGACY.sqlite NEW.sqlite');
    }
    console.log(JSON.stringify(await markLegacySqliteHeader(source, dest), null, 2));
  } catch (e) {
    console.error('SQLite header conversion failed:', e.message);
    process.exitCode = 1;
  }
}
