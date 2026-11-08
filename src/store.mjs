import { mkdir, readFile, open, rename, unlink } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { assertLibrary } from './schema.mjs';
import { parseUtf8Json } from './json.mjs';

export async function openStore(location) {
  const file = resolve(location);
  await mkdir(dirname(file), { recursive: true, mode: 0o700 });
  let state;
  try { state = parseUtf8Json(await readFile(file)); }
  catch (err) {
    if (err.code !== 'ENOENT') throw err;
    state = { schema: 1, bookmarks: [], collections: [] };
  }
  assertLibrary(state);
  let pending = Promise.resolve();
  return {
    snapshot: () => structuredClone(state),
    mutate(fn) {
      const result = pending.then(async () => {
        const draft = structuredClone(state);
        const output = fn(draft);
        assertLibrary(draft);
        const temp = file + '.' + randomUUID() + '.tmp';
        try {
          // Make the replacement's contents durable before switching the visible data file.
          // The existing file remains untouched if serialization or writing fails.
          const handle = await open(temp, 'wx', 0o600);
          try {
            await handle.writeFile(JSON.stringify(draft, null, 2) + '\n');
            await handle.sync();
          } finally {
            await handle.close();
          }
          await rename(temp, file);
        } catch (err) {
          await unlink(temp).catch(() => {});
          throw err;
        }
        state = draft;
        return output;
      });
      pending = result.catch(() => {});
      return result;
    }
  };
}
