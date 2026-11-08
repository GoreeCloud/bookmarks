import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseUtf8Json } from '../src/json.mjs';
import { openStore } from '../src/store.mjs';
import { verifyBackup, restoreBackup } from '../src/backup.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const invalidTitleBytes = Buffer.concat([
  Buffer.from('{"name":"Example '), Buffer.from([0xc3, 0x28]), Buffer.from('"}')
]);

test('strict JSON decoding preserves Unicode and rejects invalid UTF-8 and BOM', () => {
  const good = Buffer.from('{"name":"Café 📚 日本語"}', 'utf8');
  assert.equal(parseUtf8Json(good).name, 'Café 📚 日本語');
  assert.throws(() => parseUtf8Json(invalidTitleBytes), /encoded data|UTF-8|valid/i);
  assert.throws(() => parseUtf8Json(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), good])), SyntaxError);
});

test('startup and matching-checksum backups reject malformed UTF-8 without replacing library', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'gcb-utf8-data-'));
  try {
    const library = join(dir, 'live.json');
    const state = await openStore(library);
    await state.mutate(draft => { draft.collections = []; });
    const before = await readFile(library);
    const poisoned = Buffer.concat([
      Buffer.from('{"schema":1,"bookmarks":[],"collections":[],"description":"'),
      Buffer.from([0xc3, 0x28]), Buffer.from('"}')
    ]);
    const corrupt = join(dir, 'invalid.json');
    await writeFile(corrupt, poisoned);
    await assert.rejects(() => openStore(corrupt), /encoded data|UTF-8|valid/i);
    const backup = join(dir, 'bad-backup.json');
    await writeFile(backup, poisoned);
    await writeFile(backup + '.sha256', createHash('sha256').update(poisoned).digest('hex') + '\n');
    await assert.rejects(() => verifyBackup(backup), /encoded data|UTF-8|valid/i);
    const dest = join(dir, 'restored.json');
    await assert.rejects(() => restoreBackup(backup, dest), /encoded data|UTF-8|valid/i);
    await assert.rejects(() => readFile(dest), { code: 'ENOENT' });
    assert.deepEqual(await readFile(library), before);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('authenticated HTTP JSON rejects malformed UTF-8 with no collection or import mutation', { timeout: 15000 }, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'gcb-utf8-http-'));
  const token = 'utf8-test-' + 'z'.repeat(40);
  const child = spawn(process.execPath, [join(root, 'src/server.mjs')], {
    cwd: dir, env: { ...process.env, GCB_AUTH_TOKEN: token, GCB_DATA_FILE: join(dir, 'data.json'), HOST: '127.0.0.1', PORT: '0' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let stderr = '';
  child.stderr.on('data', b => { stderr += b.toString(); });
  try {
    const base = await new Promise((resolveAddress, reject) => {
      const timeout = setTimeout(() => reject(new Error('Server startup timeout: ' + stderr)), 5000);
      child.once('error', error => { clearTimeout(timeout); reject(error); });
      child.once('exit', code => { clearTimeout(timeout); reject(new Error('Server exited: ' + code + ' ' + stderr)); });
      child.stdout.on('data', b => {
        const match = String(b).match(/http:\/\/127\.0\.0\.1:(\d+)/);
        if (match) { clearTimeout(timeout); resolveAddress('http://127.0.0.1:' + match[1]); }
      });
    });
    for (const route of ['/api/collections', '/api/import', '/api/import/full']) {
      const response = await fetch(base + route, {
        method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json; charset=utf-8' },
        body: invalidTitleBytes
      });
      assert.equal(response.status, 400, 'Route ' + route + ' must reject invalid UTF-8');
      assert.match((await response.json()).error, /invalid UTF-8/i);
    }
    const lib = await fetch(base + '/api/library', { headers: { Authorization: 'Bearer ' + token } });
    assert.equal(lib.status, 200);
    assert.deepEqual(await lib.json(), { schema: 1, bookmarks: [], collections: [] });
    const valid = await fetch(base + '/api/collections', {
      method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ name: 'Café 📚' })
    });
    assert.equal(valid.status, 201);
    assert.equal((await valid.json()).name, 'Café 📚');
  } finally {
    child.kill('SIGTERM');
    if (child.exitCode === null && child.signalCode === null) await new Promise(done => child.once('exit', done));
    await rm(dir, { recursive: true, force: true });
  }
});
