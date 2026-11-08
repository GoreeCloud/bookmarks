import { readFile, mkdir, open, link, unlink } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { assertLibrary } from './schema.mjs';
import { parseUtf8Json } from './json.mjs';

function digest(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
function parseLibrary(bytes) {
  return assertLibrary(parseUtf8Json(bytes));
}
/** Read the backup and paired checksum exactly once so restoration uses verified bytes. */
async function checkedSnapshot(path) {
  const file = resolve(path);
  const [bytes, manifest] = await Promise.all([readFile(file), readFile(file + '.sha256', 'utf8')]);
  const expected = manifest.trim();
  if (!/^[0-9a-f]{64}$/.test(expected)) throw new Error('Invalid SHA-256 manifest');
  const actual = digest(bytes);
  if (!timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(actual, 'hex'))) {
    throw new Error('Backup integrity mismatch');
  }
  const data = parseLibrary(bytes);
  return { file, bytes, sha256: actual, bookmarks: data.bookmarks.length,
    collections: data.collections.length, size: bytes.length };
}
/** Produce a private snapshot and paired checksum file. Does not alter the source. */
export async function backupLibrary(source, destination) {
  const bytes = await readFile(resolve(source));
  parseLibrary(bytes);
  const folder = resolve(destination);
  await mkdir(folder, { recursive: true, mode: 0o700 });
  const name = 'bookmarks-' + new Date().toISOString().replace(/[:.]/g, '-') + '-' + randomUUID().slice(0, 8) + '.json';
  const target = join(folder, name);
  const sha256 = digest(bytes);
  const manifest = target + '.sha256';
  // A verified backup is a pair: private data plus a private checksum manifest.
  // Flush both and remove only our newly created paths if either step fails.
  // Never touch the source database or other backups on a failed attempt.
  try {
    for (const [path, content] of [[target, bytes], [manifest, sha256 + '\n']]) {
      const handle = await open(path, 'wx', 0o600);
      try {
        await handle.writeFile(content);
        await handle.sync();
      } finally {
        await handle.close();
      }
    }
    await verifyBackup(target);
  } catch (err) {
    await unlink(manifest).catch(() => {});
    await unlink(target).catch(() => {});
    throw err;
  }
  return { target, sha256, size: bytes.length };
}
/** Verify integrity and shape without changing the backup or a live database. */
export async function verifyBackup(path) {
  const { file, bytes: unused, ...result } = await checkedSnapshot(path);
  return { target: file, ...result };
}
/** Restore only to a new, non-existing target. Never overwrite any existing file. */
export async function restoreBackup(backupPath, destination) {
  if (!destination || typeof destination !== 'string') throw new Error('A new destination file path is required');
  const verified = await checkedSnapshot(backupPath);
  const target = resolve(destination);
  if (target === verified.file || target === verified.file + '.sha256') {
    throw new Error('Cannot restore onto the backup or its manifest');
  }
  // The temporary file is on the target filesystem. Link creation is atomic and fails
  // with EEXIST if another process creates the target; unlike rename, it never clobbers.
  await mkdir(dirname(target), { recursive: true, mode: 0o700 });
  const temp = join(dirname(target), '.bookmarks-restore-' + randomUUID() + '.tmp');
  try {
    const handle = await open(temp, 'wx', 0o600);
    try {
      await handle.writeFile(verified.bytes);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await link(temp, target);
  } catch (err) {
    if (err.code === 'EEXIST') throw new Error('Restore destination already exists; existing data was not changed');
    throw err;
  } finally {
    await unlink(temp).catch(() => {});
  }
  return { target, sha256: verified.sha256, bookmarks: verified.bookmarks,
    collections: verified.collections, size: verified.size };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if (process.argv[2] === 'verify') {
      if (!process.argv[3] || process.argv[4]) throw new Error('Usage: verify BACKUP.json');
      const result = await verifyBackup(process.argv[3]);
      console.log('Backup verified:', result.target);
      console.log('SHA-256:', result.sha256);
      console.log('Bookmarks:', result.bookmarks, 'Collections:', result.collections);
    } else if (process.argv[2] === 'restore') {
      if (!process.argv[3] || !process.argv[4] || process.argv[5]) {
        throw new Error('Usage: restore BACKUP.json NEW_DATA_FILE.json');
      }
      const result = await restoreBackup(process.argv[3], process.argv[4]);
      console.log('Backup restored into new file:', result.target);
      console.log('SHA-256:', result.sha256);
      console.log('Bookmarks:', result.bookmarks, 'Collections:', result.collections);
    } else if (!process.argv[2]) {
      const result = await backupLibrary(process.env.GCB_DATA_FILE || './data/bookmarks.json', process.env.GCB_BACKUP_DIR || './backups');
      console.log('Backup created:', result.target);
      console.log('SHA-256:', result.sha256);
    } else {
      throw new Error('Usage: node src/backup.mjs [verify BACKUP.json | restore BACKUP.json NEW_DATA_FILE.json]');
    }
  } catch (err) {
    console.error('Backup operation failed:', err.message);
    process.exitCode = 1;
  }
}
