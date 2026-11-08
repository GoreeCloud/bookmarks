import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { request as httpRequest } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
test('API: authentication, create, deduplicate, update, import, trash, restore, export', { timeout: 15000 }, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'gcb-http-test-'));
  const secret = 'unit-test-' + 'x'.repeat(48);
  const child = spawn(process.execPath, [join(root, 'src/server.mjs')], {
    cwd: dir,
    env: { ...process.env, GCB_AUTH_TOKEN: secret, HOST: '127.0.0.1', PORT: '0', GCB_DATA_FILE: join(dir, 'db.json') },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let stderr = '';
  child.stderr.on('data', chunk => { stderr += chunk.toString(); });
  const base = await new Promise((resolveAddress, reject) => {
    const timeout = setTimeout(() => reject(new Error('Server startup timeout: ' + stderr)), 6000);
    child.on('error', reject);
    child.on('exit', code => reject(new Error('Server exited before startup: ' + code + ' ' + stderr)));
    child.stdout.on('data', chunk => {
      const match = chunk.toString().match(/http:\/\/127\.0\.0\.1:(\d+)/);
      if (match) { clearTimeout(timeout); resolveAddress('http://127.0.0.1:' + match[1]); }
    });
  });
  const request = async (path, method = 'GET', body, auth = secret) => {
    const res = await fetch(base + path, {
      method,
      headers: { ...(auth ? { Authorization: 'Bearer ' + auth } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
    return { status: res.status, headers: res.headers, body: await res.json().catch(() => null) };
  };
  try {
    // Deliberate raw HTTP Host headers, including an authenticated request, are
    // rejected before the application or its data can be served.
    const probeHost = (host, path = '/', authorization = null) => new Promise((resolveProbe, rejectProbe) => {
      const target = new URL(base);
      const req = httpRequest({hostname: '127.0.0.1', port: target.port, path,
        headers: {Host: host, ...(authorization ? {Authorization: 'Bearer ' + authorization} : {})}}, res => {
        res.resume(); res.on('end', () => resolveProbe(res.statusCode));
      });
      req.on('error', rejectProbe); req.end();
    });
    assert.equal(await probeHost('evil.example'), 421);
    assert.equal(await probeHost('localhost.evil.example', '/health'), 421);
    assert.equal(await probeHost('evil.example', '/api/library', secret), 421);
    assert.equal(await probeHost('localhost', '/health'), 200);
    // Only JSON media types, optionally with UTF-8 charset, may carry private API input.
    // Prefix tricks (application/jsonp) and ambiguous charsets must not be parsed.
    for (const [contentType, status] of [
      ['application/jsonp', 415],
      ['application/json; charset=latin1', 415],
      ['application/json; charset=utf-8; extra=yes', 415],
      ['application/json; charset=\"utf-8\"', 400],
      ['Application/JSON; Charset=UTF-8', 400]
    ]) {
      const media = await fetch(base + '/api/bookmarks', { method: 'POST',
        headers: { Authorization: 'Bearer ' + secret, 'Content-Type': contentType },
        body: '{}' });
      assert.equal(media.status, status, 'Unexpected handling of Content-Type ' + contentType);
    }
    const unauth = await request('/api/library', 'GET', undefined, null);
    assert.equal(unauth.status, 401);
    assert.equal((await request('/api/library')).body.bookmarks.length, 0);
    const noSearchAuth = await request('/api/bookmarks?q=hello', 'GET', undefined, null);
    assert.equal(noSearchAuth.status, 401);
    const firstSearch = await request('/api/bookmarks?limit=10');
    assert.deepEqual(firstSearch.body, { items: [], total: 0, limit: 10, offset: 0 });
    // The operator secret mints independent, revocable browser/extension sessions.
    const absentSession = await request('/api/auth/session', 'POST', undefined, null);
    assert.equal(absentSession.status, 401);
    const issued = await request('/api/auth/session', 'POST');
    assert.equal(issued.status, 201);
    assert.match(issued.body.token, /^gcb1_[A-Za-z0-9_-]{43}$/);
    assert.match(issued.body.expiresAt, /^\d{4}-\d{2}-\d{2}T/);
    assert.notEqual(issued.body.token, secret, 'Operator token must never be the issued session');
    const browserSession = issued.body.token;
    assert.equal((await request('/api/library', 'GET', undefined, browserSession)).status, 200);
    assert.equal((await request('/api/auth/revoke', 'POST', undefined, secret)).status, 401,
      'Master operator credential is not itself a revocable session');
    assert.deepEqual((await request('/api/auth/revoke', 'POST', undefined, browserSession)).body, {revoked: true});
    assert.equal((await request('/api/library', 'GET', undefined, browserSession)).status, 401);
    assert.equal((await request('/api/auth/revoke', 'POST', undefined, browserSession)).status, 401);
    const extSession = (await request('/api/auth/session', 'POST')).body.token;
    const anotherSession = (await request('/api/auth/session', 'POST')).body.token;
    assert.equal((await request('/api/library', 'GET', undefined, extSession)).status, 200);
    assert.equal((await request('/api/auth/revoke-all', 'POST', undefined, extSession)).status, 401);
    const revoked = await request('/api/auth/revoke-all', 'POST');
    assert.equal(revoked.status, 200);
    assert.equal(revoked.body.revoked, 2);
    assert.equal((await request('/api/library', 'GET', undefined, extSession)).status, 401);
    assert.equal((await request('/api/library', 'GET', undefined, anotherSession)).status, 401);
    assert.equal((await request('/api/library')).status, 200, 'Operator token remains valid');
    const scopedSession = (await request('/api/auth/session', 'POST')).body.token;
    const collection = await request('/api/collections', 'POST', { name: 'Research' }, scopedSession);
    assert.equal(collection.status, 201, 'Issued session may perform authorized mutations');
    assert.equal((await request('/api/auth/revoke', 'POST', undefined, scopedSession)).status, 200);
    assert.equal((await request('/api/collections', 'POST', { name: 'Forbidden' }, scopedSession)).status, 401,
      'Revocation must also block future writes');
    const id = collection.body.id;
    const saved = await request('/api/bookmarks', 'POST', {
      url: 'https://example.org/hello?utm_source=tracking&id=2', title: 'Interesting read',
      tags: ['AI', 'Design'], collectionId: id, notes: 'Keep this'
    });
    assert.equal(saved.status, 201);
    assert.equal(saved.body.url, 'https://example.org/hello?id=2');
    const searched = await request('/api/bookmarks?q=interesting&tag=ai&limit=2');
    assert.equal(searched.status, 200);
    assert.equal(searched.body.total, 1);
    assert.equal(searched.body.items[0].title, 'Interesting read');
    assert.equal((await request('/api/bookmarks?limit=1001')).status, 400);
    assert.equal((await request('/api/bookmarks?q=x&q=y')).status, 400);
    const duplicate = await request('/api/bookmarks', 'POST', { url: 'https://example.org/hello?id=2#different' });
    assert.equal(duplicate.status, 409);
    const bad = await request('/api/bookmarks', 'POST', { url: 'javascript:alert(1)' });
    assert.equal(bad.status, 400);
    const updated = await request('/api/bookmarks/' + saved.body.id, 'PATCH', { favorite: true, status: 'read' });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.favorite, true);
    assert.equal(updated.body.status, 'read');
    const importCandidate = { bookmarks: [
      { url: 'https://example.org/new', title: '<Unsafe>' },
      { url: 'javascript:void(0)' }, { url: 'https://example.org/new' }
    ] };
    const beforePreview = (await request('/api/library')).body;
    assert.equal((await request('/api/import/preview', 'POST', importCandidate, null)).status, 401);
    const preview = await request('/api/import/preview', 'POST', importCandidate);
    assert.equal(preview.status, 200);
    assert.deepEqual(preview.body, { imported: 1, skipped: 2, preview: true });
    assert.deepEqual((await request('/api/library')).body, beforePreview, 'Preview must not persist anything');
    const invalidPreview = await request('/api/import/preview', 'POST', {
      collections: [{ id: 'ambiguous', name: 'First' }, { id: 'ambiguous', name: 'Second' }],
      bookmarks: []
    });
    assert.equal(invalidPreview.status, 400);
    assert.deepEqual((await request('/api/library')).body, beforePreview);
    const imported = await request('/api/import', 'POST', importCandidate);

    assert.deepEqual(imported.body, { imported: 1, skipped: 2 });
    const exportJson = await request('/api/export');
    assert.equal(exportJson.body.bookmarks.length, 2);
    const html = await fetch(base + '/api/export/html', { headers: { Authorization: 'Bearer ' + secret } });
    assert.match(await html.text(), /&lt;Unsafe&gt;/);
    assert.equal((await request('/api/bookmarks/' + saved.body.id, 'DELETE')).body.trashedAt !== null, true);
    assert.equal((await request('/api/bookmarks/' + saved.body.id, 'PATCH', { trashedAt: null })).body.trashedAt, null);
    assert.equal((await request('/api/collections/' + id, 'DELETE')).status, 200);
    assert.equal((await request('/api/library')).body.bookmarks.find(b => b.id === saved.body.id).collectionId, null);
    const fromExport = exportJson.body;
    const roundtrip = await request('/api/import', 'POST', { collections: [
      { id: 'external-c', name: 'Reading Vault' }, { id: 'external-existing', name: 'Research' }
    ], bookmarks: [
      { url: 'https://example.org/collections', title: 'Collected', collectionId: 'external-c', tags: ['knowledge'] },
      { url: 'https://example.org/elsewhere', title: 'Existing collection', collectionId: 'external-existing' },
      { url: 'https://example.org/invalid', collectionId: 'unknown-id' }
    ] });
    assert.equal(roundtrip.status, 200);
    assert.deepEqual(roundtrip.body, { imported: 2, skipped: 1, collectionsCreated: 2 });
    const afterImport = (await request('/api/library')).body;
    const vault = afterImport.collections.find(c => c.name === 'Reading Vault');
    assert.ok(vault);
    assert.equal(afterImport.bookmarks.find(b => b.url.includes('/collections')).collectionId, vault.id);
    assert.equal(afterImport.bookmarks.find(b => b.url.includes('/elsewhere')).collectionId,
      afterImport.collections.find(c => c.name === 'Research').id);
    const beforeInvalid = afterImport.bookmarks.length;
    const invalidImport = await request('/api/import', 'POST', {
      collections: [{ id: 'invalid', name: '' }],
      bookmarks: [{ url: 'https://example.org/should-not-import' }]
    });
    assert.equal(invalidImport.status, 400);
    assert.equal((await request('/api/library')).body.bookmarks.length, beforeInvalid);
    const beforeAmbiguous = (await request('/api/library')).body;
    const ambiguousImport = await request('/api/import', 'POST', {
      collections: [{ id: 'same-id', name: 'First' }, { id: 'same-id', name: 'Second' }],
      bookmarks: [{ url: 'https://example.org/ambiguous', collectionId: 'same-id' }]
    });
    assert.equal(ambiguousImport.status, 400);
    assert.match(ambiguousImport.body.error, /Duplicate imported collection ID/);
    assert.deepEqual((await request('/api/library')).body, beforeAmbiguous);
    const blankIdImport = await request('/api/import', 'POST', {
      collections: [{ id: ' ', name: 'Invalid' }], bookmarks: []
    });
    assert.equal(blankIdImport.status, 400);
    assert.deepEqual((await request('/api/library')).body, beforeAmbiguous);
    // Entire file is previewed, then committed by one store mutation with
    // optimistic revision protection. Conflicts leave every imported URL absent.
    const bulk = { collections: [{ id: 'large-external', name: 'Bulk Reading' }],
      bookmarks: Array.from({ length: 1001 }, (_, i) => ({
        url: `https://example.net/bulk/${i}`, title: `Bulk ${i}`, collectionId: 'large-external'
      })) };
    assert.equal((await request('/api/import/full/preview', 'POST', bulk, null)).status, 401);
    assert.equal((await request('/api/import/full', 'POST', bulk)).status, 428);
    const beforeBulk = (await request('/api/library')).body;
    const bulkPreview = await request('/api/import/full/preview', 'POST', bulk);
    assert.equal(bulkPreview.status, 200);
    assert.equal(bulkPreview.body.imported, 1001);
    assert.equal(bulkPreview.body.collectionsCreated, 1);
    assert.match(bulkPreview.body.revision, /^[a-f0-9]{64}$/);
    assert.deepEqual((await request('/api/library')).body, beforeBulk, 'Whole preview cannot write records');
    const intervening = await request('/api/bookmarks', 'POST', { url: 'https://example.net/intervening' });
    assert.equal(intervening.status, 201);
    const stale = await request('/api/import/full', 'POST', { ...bulk, baseRevision: bulkPreview.body.revision });
    assert.equal(stale.status, 409);
    assert.match(stale.body.error, /changed since preview/);
    const afterStale = (await request('/api/library')).body;
    assert.equal(afterStale.bookmarks.length, beforeBulk.bookmarks.length + 1);
    assert.ok(!afterStale.collections.find(c => c.name === 'Bulk Reading'));
    assert.equal((await request('/api/import/full/preview', 'POST', {
      ...bulk, collections: [ { id: 'duplicate', name: 'First' }, { id: 'duplicate', name: 'Second' } ]
    })).status, 400);
    assert.deepEqual((await request('/api/library')).body, afterStale, 'Invalid whole-file preview is non-mutating');
    const currentPreview = await request('/api/import/full/preview', 'POST', bulk);
    assert.equal(currentPreview.status, 200);
    const bulkResult = await request('/api/import/full', 'POST', {
      ...bulk, baseRevision: currentPreview.body.revision
    });
    assert.equal(bulkResult.status, 200);
    assert.deepEqual(bulkResult.body, { imported: 1001, skipped: 0, collectionsCreated: 1 });
    const importedBulk = (await request('/api/library')).body;
    const bulkCollection = importedBulk.collections.find(c => c.name === 'Bulk Reading');
    assert.ok(bulkCollection);
    assert.equal(importedBulk.bookmarks.filter(b => b.url.startsWith('https://example.net/bulk/')).length, 1001);
    assert.equal(importedBulk.bookmarks.find(b => b.url === 'https://example.net/bulk/1000').collectionId,
      bulkCollection.id);
    const repeatPreview = await request('/api/import/full/preview', 'POST', bulk);
    assert.equal(repeatPreview.body.skipped, 1001);
    assert.equal(repeatPreview.body.imported, 0);
    assert.equal((await request('/health', 'GET', undefined, null)).body.status, 'ok');
    // HTTP-level throttle remains active even if a correct token follows too many failures.
    let tooMany;
    for (let i = 0; i < 12; i++) {
      const attempt = await request('/api/library', 'GET', undefined, 'invalid-token');
      if (attempt.status === 429) { tooMany = attempt; break; }
    }
    assert.equal(tooMany?.status, 429);
    assert.ok(Number(tooMany.headers.get('retry-after')) >= 1);
    assert.equal((await request('/api/library')).status, 429);
    // Public health and static application stay available while a source is throttled.
    assert.equal((await request('/health', 'GET', undefined, null)).status, 200);
    const headers = (await fetch(base + '/')).headers;
    assert.match(headers.get('content-security-policy'), /frame-ancestors 'none'/);
  } finally {
    child.kill('SIGTERM');
    await new Promise(resolveDone => child.once('exit', resolveDone));
    await rm(dir, { recursive: true, force: true });
  }
});
