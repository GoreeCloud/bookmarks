import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { request as httpRequest } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));

test('a session revoked during a slow upload cannot mutate data or return a private import preview',
  { timeout: 15000 }, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'gcb-revoke-race-'));
  const secret = 'test-operator-' + 'q'.repeat(48);
  const child = spawn(process.execPath, [join(root, 'src/server.mjs')], {
    cwd: dir, env: { ...process.env, GCB_AUTH_TOKEN: secret, HOST: '127.0.0.1',
      PORT: '0', GCB_DATA_FILE: join(dir, 'bookmarks.json') }, stdio: ['ignore', 'pipe', 'pipe']
  });
  let stderr = '';
  child.stderr.on('data', data => { stderr += String(data); });
  let base;
  try {
    base = await new Promise((ok, fail) => {
      const timer = setTimeout(() => fail(new Error('Startup timeout: ' + stderr)), 6000);
      child.once('error', fail);
      child.once('exit', code => fail(new Error('Startup failed: ' + code + ' ' + stderr)));
      child.stdout.on('data', data => {
        const port = String(data).match(/http:\/\/127\.0\.0\.1:(\d+)/)?.[1];
        if (port) { clearTimeout(timer); ok('http://127.0.0.1:' + port); }
      });
    });
    const call = async (path, method, token, body) => {
      const resp = await fetch(base + path, { method, headers: {
        Authorization: 'Bearer ' + token,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' })
      }, ...(body === undefined ? {} : {body: JSON.stringify(body)}) });
      return {status: resp.status, body: await resp.json()};
    };
    // Hold a chunked POST open after valid headers and an incomplete JSON fragment.
    // Revocation happens while the server's readJson() is awaiting the remainder.
    const delayed = async (path, fragment, suffix, session) => {
      const target = new URL(base);
      let req;
      const answer = new Promise((ok, fail) => {
        req = httpRequest({ hostname: target.hostname, port: target.port, path, method: 'POST',
          headers: { Authorization: 'Bearer ' + session, 'Content-Type': 'application/json' }
        }, res => {
          const chunks = [];
          res.on('data', chunk => chunks.push(chunk));
          res.on('end', () => ok({status: res.statusCode, body: JSON.parse(Buffer.concat(chunks).toString())}));
        });
        req.on('error', fail);
        req.write(fragment);
      });
      try {
        await new Promise(resolveDelay => setTimeout(resolveDelay, 35));
        assert.equal((await call('/api/auth/revoke', 'POST', session)).status, 200);
        req.end(suffix);
        return await answer;
      } catch (error) { req.destroy(); throw error; }
    };
    const session = (await call('/api/auth/session', 'POST', secret)).body.token;
    const create = await delayed('/api/collections', '{"name":"Slow', ' collection"}', session);
    assert.equal(create.status, 401, 'A revoked session must not commit a slow request');
    assert.deepEqual((await call('/api/library', 'GET', secret)).body.collections, []);

    const previewSession = (await call('/api/auth/session', 'POST', secret)).body.token;
    const preview = await delayed('/api/import/full/preview', '{"bookmarks":[{"url":"https://',
      'example.org/late-preview"}]}', previewSession);
    assert.equal(preview.status, 401, 'A revoked session must not receive a private preview');
    assert.equal((await call('/api/library', 'GET', secret)).body.bookmarks.length, 0);

    const legacySession = (await call('/api/auth/session', 'POST', secret)).body.token;
    const legacyPreview = await delayed('/api/import/preview', '{"bookmarks":[{"url":"https://',
      'example.org/late-legacy-preview"}]}', legacySession);
    assert.equal(legacyPreview.status, 401,
      'Revoked session must not receive a slow legacy import preview');
    assert.equal((await call('/api/library', 'GET', secret)).body.bookmarks.length, 0);

    const fullSession = (await call('/api/auth/session', 'POST', secret)).body.token;
    const fullPreview = await call('/api/import/full/preview', 'POST', fullSession,
      {bookmarks: [{url: 'https://example.org/should-not-save'}]});
    assert.equal(fullPreview.status, 200);
    const fullJson = JSON.stringify({baseRevision: fullPreview.body.revision,
      bookmarks: [{url: 'https://example.org/should-not-save'}]});
    const split = Math.floor(fullJson.length / 2);
    const fullResult = await delayed('/api/import/full', fullJson.slice(0, split),
      fullJson.slice(split), fullSession);
    assert.equal(fullResult.status, 401, 'Revocation prevents slow whole-file import commit');
    assert.equal((await call('/api/library', 'GET', secret)).body.bookmarks.length, 0);
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
    await new Promise(resolveDone => { if (child.exitCode !== null || child.signalCode !== null) resolveDone();
      else child.once('exit', resolveDone); });
    await rm(dir, { recursive: true, force: true });
  }
});
