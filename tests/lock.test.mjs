import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, readFile, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { acquireSingleWriterLock } from '../src/lock.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const secret = 'lock-test-' + 't'.repeat(50);

function serverProcess(folder, file) {
  return spawn(process.execPath, [join(root, 'src/server.mjs')], {
    cwd: folder,
    env: { ...process.env, GCB_AUTH_TOKEN: secret, GCB_DATA_FILE: file, HOST: '127.0.0.1', PORT: '0' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
}
function waitExit(child) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve({ code: child.exitCode, signal: child.signalCode });
  }
  return new Promise((resolveExit, rejectExit) => {
    child.once('exit', (code, signal) => resolveExit({ code, signal }));
    child.once('error', rejectExit);
  });
}
function waitStarted(child) {
  return new Promise((resolveStart, rejectStart) => {
    let output = '';
    const timeout = setTimeout(() => rejectStart(new Error('Server startup timed out: ' + output)), 6000);
    child.stdout.on('data', bytes => {
      output += bytes.toString();
      const match = output.match(/http:\/\/127\.0\.0\.1:(\d+)/);
      if (match) { clearTimeout(timeout); resolveStart('http://127.0.0.1:' + match[1]); }
    });
    child.once('exit', (code, signal) => {
      clearTimeout(timeout);
      rejectStart(new Error(`Server exited before listening: ${code} / ${signal}`));
    });
    child.once('error', error => { clearTimeout(timeout); rejectStart(error); });
  });
}

test('exclusive sidecar lock is private, rejects competing writers, and releases only the owner', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'gcb-lock-unit-'));
  const data = join(dir, 'deep', 'library.json');
  try {
    const lock = await acquireSingleWriterLock(data);
    const info = JSON.parse(await readFile(lock.path, 'utf8'));
    assert.equal(info.pid, process.pid);
    assert.ok(typeof info.nonce === 'string' && info.nonce.length > 20);
    assert.equal((await stat(lock.path)).mode & 0o777, 0o600);
    await assert.rejects(() => acquireSingleWriterLock(data), /Library is locked/);
    await lock.release();
    await lock.release();
    await assert.rejects(() => stat(lock.path), { code: 'ENOENT' });
    const next = await acquireSingleWriterLock(data);
    await next.release();
  } finally { await rm(dir, { recursive: true, force: true }); }
});


test('existing-library symlink aliases cannot acquire separate writer locks', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'gcb-lock-alias-'));
  try {
    const data = join(dir, 'canonical.json');
    const alias = join(dir, 'shortcut.json');
    await writeFile(data, '{\"schema\":1,\"bookmarks\":[],\"collections\":[]}');
    await symlink(data, alias);
    const original = await acquireSingleWriterLock(data);
    try {
      await assert.rejects(() => acquireSingleWriterLock(alias), /Library is locked/);
      assert.equal(original.dataFile, data);
    } finally { await original.release(); }
    const throughAlias = await acquireSingleWriterLock(alias);
    assert.equal(throughAlias.dataFile, data);
    await throughAlias.release();
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('concurrent server is refused and a graceful shutdown releases the same-library lock', { timeout: 20000 }, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'gcb-lock-server-'));
  const data = join(dir, 'private.json');
  let first, second, third;
  try {
    first = serverProcess(dir, data);
    const firstUrl = await waitStarted(first);
    assert.equal((await (await fetch(firstUrl + '/health')).json()).status, 'ok');
    second = serverProcess(dir, data);
    let stderr = '';
    second.stderr.on('data', bytes => { stderr += bytes.toString(); });
    const conflict = await waitExit(second);
    assert.notEqual(conflict.code, 0);
    assert.match(stderr, /Library is locked/);
    // First writer has not been disrupted or replaced by second process.
    const response = await fetch(firstUrl + '/api/library', { headers: { Authorization: 'Bearer ' + secret } });
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).bookmarks, []);
    first.kill('SIGTERM');
    assert.equal((await waitExit(first)).code, 0);
    await assert.rejects(() => stat(data + '.lock'), { code: 'ENOENT' });
    third = serverProcess(dir, data);
    const thirdUrl = await waitStarted(third);
    assert.equal((await fetch(thirdUrl + '/health')).status, 200);
  } finally {
    for (const child of [first, second, third]) {
      if (child && child.exitCode === null && child.signalCode === null) {
        child.kill('SIGTERM');
        await waitExit(child);
      }
    }
    await rm(dir, { recursive: true, force: true });
  }
});

test('unclean termination leaves an explicit fail-closed lock until verified manual recovery', { timeout: 20000 }, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'gcb-lock-crash-'));
  const data = join(dir, 'collection.json');
  let first, restart, recovered;
  try {
    first = serverProcess(dir, data);
    const baseBeforeCrash = await waitStarted(first);
    const saved = await fetch(baseBeforeCrash + '/api/bookmarks', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + secret, 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'https://example.org/survives-crash', title: 'Preserved' })
    });
    assert.equal(saved.status, 201);
    const marker = JSON.parse(await readFile(data + '.lock', 'utf8'));
    assert.equal(marker.pid, first.pid);
    first.kill('SIGKILL');
    assert.equal((await waitExit(first)).signal, 'SIGKILL');
    assert.equal(JSON.parse(await readFile(data + '.lock', 'utf8')).pid, marker.pid);
    restart = serverProcess(dir, data);
    let stderr = '';
    restart.stderr.on('data', bytes => { stderr += bytes.toString(); });
    const refused = await waitExit(restart);
    assert.notEqual(refused.code, 0);
    assert.match(stderr, /Library is locked/);
    // In this isolated test both workers are confirmed stopped; the person who
    // administers a real instance must do equivalent checks before removing it.
    await rm(data + '.lock');
    recovered = serverProcess(dir, data);
    const base = await waitStarted(recovered);
    assert.equal((await fetch(base + '/health')).status, 200);
    const recoveredLibrary = await fetch(base + '/api/library', {
      headers: { Authorization: 'Bearer ' + secret }
    });
    assert.equal(recoveredLibrary.status, 200);
    assert.equal((await recoveredLibrary.json()).bookmarks[0].title, 'Preserved');
  } finally {
    for (const child of [first, restart, recovered]) {
      if (child && child.exitCode === null && child.signalCode === null) {
        child.kill('SIGTERM');
        await waitExit(child);
      }
    }
    await rm(dir, { recursive: true, force: true });
  }
});


test('invalid data fails startup and releases its newly acquired lock', { timeout: 12000 }, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'gcb-lock-invalid-'));
  const data = join(dir, 'invalid.json');
  let child;
  try {
    await writeFile(data, '{"schema":404,"bookmarks":[],"collections":[]}');
    child = serverProcess(dir, data);
    const result = await waitExit(child);
    assert.notEqual(result.code, 0);
    await assert.rejects(() => stat(data + '.lock'), { code: 'ENOENT' });
    assert.equal((await readFile(data, 'utf8')).includes('"schema":404'), true);
  } finally {
    if (child && child.exitCode === null && child.signalCode === null) {
      child.kill('SIGTERM');
      await waitExit(child);
    }
    await rm(dir, { recursive: true, force: true });
  }
});
