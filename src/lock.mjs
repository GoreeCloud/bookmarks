import { mkdir, open, realpath, stat, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { basename, dirname, join, resolve } from 'node:path';

/**
 * Prevent independently launched GoreeCloud Bookmarks servers from modifying the
 * same JSON library. An exclusive sidecar file is kept for the whole server life.
 *
 * A crash may leave the lock in place. Deliberately do not auto-steal "stale"
 * locks: PID reuse and an unavailable process table make that unsafe. Recovery
 * requires a human to confirm every former writer is stopped before removing it.
 * This is a single-writer guard, not a multi-node transaction engine.
 */
async function canonicalDataPath(input) {
  const path = resolve(input);
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  try { return await realpath(path); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    // Normalize symlinked parent directories even before a library exists.
    return join(await realpath(dirname(path)), basename(path));
  }
}

export async function acquireSingleWriterLock(dataFile) {
  // Resolve aliases of an existing library so a symlink cannot bypass the lock.
  const canonicalFile = await canonicalDataPath(dataFile);
  const file = canonicalFile + '.lock';
  let handle;
  try {
    handle = await open(file, 'wx', 0o600);
  } catch (error) {
    if (error.code === 'EEXIST') {
      throw new Error('Library is locked by another writer (or a previous unclean shutdown): ' + file +
        '. Stop all writers and verify the lock is abandoned before manually removing it.');
    }
    throw error;
  }
  const marker = { pid: process.pid, createdAt: new Date().toISOString(), nonce: randomUUID() };
  try {
    await handle.writeFile(JSON.stringify(marker) + '\n');
    await handle.sync();
  } catch (error) {
    await handle.close().catch(() => {});
    await unlink(file).catch(() => {});
    throw error;
  }
  let released = false;
  return {
    path: file,
    dataFile: canonicalFile,
    async release() {
      if (released) return;
      released = true;
      try {
        // Do not delete another process's lock if the original was replaced.
        const [onDisk, held] = await Promise.all([stat(file), handle.stat()]);
        if (onDisk.dev !== held.dev || onDisk.ino !== held.ino) {
          throw new Error('Library lock was replaced; refusing to delete another writer\'s lock');
        }
        await unlink(file);
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      } finally {
        await handle.close();
      }
    }
  };
}
