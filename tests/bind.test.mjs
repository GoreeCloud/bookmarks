import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateBindHost } from '../src/bind.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));

test('bind policy defaults to literal loopback addresses and fails closed on DNS/wildcard hosts', () => {
  for (const host of ['127.0.0.1', '::1']) {
    assert.equal(validateBindHost(host), host);
    assert.equal(validateBindHost(host, '0'), host);
  }
  for (const host of ['localhost', '0.0.0.0', '::', '127.0.0.2', '192.0.2.33',
    'fe80::1', '::ffff:127.0.0.1', 'bookmarks.example.org', '127.0.0.1:4173', '', ' 127.0.0.1 ']) {
    assert.throws(() => validateBindHost(host), /HOST/);
  }
  for (const setting of ['true', 'yes', 'false', '01', '*']) {
    assert.throws(() => validateBindHost('127.0.0.1', setting), /GCB_ALLOW_NON_LOOPBACK/);
  }
  assert.equal(validateBindHost('0.0.0.0', '1'), '0.0.0.0');
  assert.equal(validateBindHost('::', '1'), '::');
  assert.equal(validateBindHost('192.0.2.33', '1'), '192.0.2.33');
  assert.throws(() => validateBindHost('bookmarks.example.org', '1'), /literal/);
});

test('server refuses unreviewed wildcard binding before opening a library or lock', { timeout: 10000 }, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'gcb-bind-'));
  const file = join(dir, 'library.json');
  const child = spawn(process.execPath, [join(root, 'src/server.mjs')], {
    cwd: dir,
    env: {
      ...process.env, HOST: '0.0.0.0', GCB_ALLOW_NON_LOOPBACK: '0',
      GCB_AUTH_TOKEN: 'test-bind-' + 'x'.repeat(48), GCB_DATA_FILE: file, PORT: '0'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let stderr = '';
  child.stderr.on('data', data => { stderr += data.toString(); });
  try {
    const { code, signal } = await new Promise((resolveExit, rejectExit) => {
      child.once('exit', (code, signal) => resolveExit({ code, signal }));
      child.once('error', rejectExit);
    });
    assert.equal(signal, null);
    assert.notEqual(code, 0);
    assert.match(stderr, /Non-loopback HOST is disabled/);
    await assert.rejects(() => stat(file), { code: 'ENOENT' });
    await assert.rejects(() => stat(file + '.lock'), { code: 'ENOENT' });
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    await rm(dir, { recursive: true, force: true });
  }
});
