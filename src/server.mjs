import http from 'node:http';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAuthGuard } from './auth.mjs';
import { createSessionManager } from './sessions.mjs';
import { trustedHostPolicy } from './host.mjs';
import { validateBindHost } from './bind.mjs';
import { openStore } from './store.mjs';
import { openSqliteStore, validateSqliteTarget } from './sqlite-store.mjs';
import { acquireSingleWriterLock } from './lock.mjs';
import { AppError, makeBookmark, makeCollection, dedupeKey, exportHtml, searchBookmarks } from './core.mjs';
import { importBatch, importWholeFile } from './import.mjs';
import { parseUtf8Json } from './json.mjs';

const token = process.env.GCB_AUTH_TOKEN || '';
if (token.length < 24) {
  console.error('Set GCB_AUTH_TOKEN to a random secret of at least 24 characters');
  process.exit(1);
}
const host = validateBindHost(process.env.HOST || '127.0.0.1', process.env.GCB_ALLOW_NON_LOOPBACK || '');
const port = Number(process.env.PORT ?? 4173);
if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid PORT');
const guard = createAuthGuard(token);
const sessions = createSessionManager();
const hostPolicy = trustedHostPolicy(process.env.GCB_TRUSTED_HOSTS || '');
const backend = process.env.GCB_STORAGE_BACKEND || 'json';
if (!['json', 'sqlite'].includes(backend)) throw new Error('Unsupported GCB_STORAGE_BACKEND');
if (backend === 'sqlite') validateSqliteTarget(process.env.GCB_DATA_FILE);
const dataFile = process.env.GCB_DATA_FILE || './data/bookmarks.json';
const writerLock = await acquireSingleWriterLock(dataFile);
let store;
try { store = backend === 'sqlite' ? await openSqliteStore(writerLock.dataFile) : await openStore(writerLock.dataFile); }
catch (error) { await writerLock.release(); throw error; }
const assetRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const staticFiles = new Map([
  ['/', 'public/index.html'], ['/app.js', 'public/app.js'], ['/styles.css', 'public/styles.css']
]);
const types = { html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', css: 'text/css; charset=utf-8' };
function headers(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy',
    "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");
  res.setHeader('Cache-Control', 'no-store');
}
function send(res, status, body, type = 'application/json; charset=utf-8', extra = {}) {
  res.writeHead(status, { 'Content-Type': type, ...extra });
  res.end(type.startsWith('application/json') ? JSON.stringify(body) : body);
}
async function readJson(req, maxBytes = 1024 * 1024) {
  if (typeof req.headers['content-type'] !== 'string' ||
      !/^\s*application\/json(?:\s*;\s*charset\s*=\s*(?:utf-8|"utf-8"))?\s*$/i.test(req.headers['content-type'])) {
    throw new AppError(415, 'Expected application/json');
  }
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) throw new AppError(413, 'Request exceeds permitted size');
    chunks.push(chunk);
  }
  try { return parseUtf8Json(Buffer.concat(chunks)); }
  catch { throw new AppError(400, 'Malformed JSON or invalid UTF-8'); }
}
// A revision detects changes since the user's preview, not a substitute for authorization.
function libraryRevision(library) {
  return createHash('sha256').update(JSON.stringify(library)).digest('hex');
}
// Bound slow/incomplete requests; local preview still requires reverse-proxy hardening for remote use.
const server = http.createServer({ requestTimeout: 30_000, headersTimeout: 15_000, keepAliveTimeout: 5_000 }, async (req, res) => {
  headers(res);
  try {
    // Reject arbitrary Host values before serving even public static assets or health.
    // Loopback-only default plus explicit exact opt-ins reduce DNS rebinding exposure.
    if (!hostPolicy.accepts(req.headers.host)) return send(res, 421, { error: 'Unrecognized Host header' });
    const url = new URL(req.url || '/', 'http://localhost');
    const path = url.pathname;
    if (path === '/health' && req.method === 'GET') return send(res, 200, { status: 'ok' });
    if (!path.startsWith('/api/')) {
      if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { error: 'Method not allowed' });
      if (!staticFiles.has(path)) return send(res, 404, { error: 'Not found' });
      const filename = staticFiles.get(path);
      const type = types[filename.split('.').pop()];
      const content = await readFile(join(assetRoot, filename));
      res.writeHead(200, { 'Content-Type': type });
      return res.end(req.method === 'HEAD' ? undefined : content);
    }
    const bearer = req.headers.authorization;
    const source = req.socket.remoteAddress;
    // Mint browser/extension session credentials from the bootstrap secret.
    // The long-lived operator secret is never returned or persisted by this API.
    if (path === '/api/auth/session' && req.method === 'POST') {
      const auth = guard.authenticate(bearer, source);
      if (!auth.ok) return send(res, auth.status, { error: auth.status === 429 ? 'Too many failed access attempts; retry later' : 'Invalid access token' },
        'application/json; charset=utf-8', auth.status === 429 ? { 'Retry-After': String(auth.retryAfter) } : { 'WWW-Authenticate': 'Bearer' });
      return send(res, 201, sessions.issue());
    }
    if (path === '/api/auth/revoke' && req.method === 'POST') {
      if (!sessions.revoke(bearer)) return send(res, 401, { error: 'Session is expired or was already revoked' });
      return send(res, 200, { revoked: true });
    }
    if (path === '/api/auth/revoke-all' && req.method === 'POST') {
      const auth = guard.authenticate(bearer, source);
      if (!auth.ok) return send(res, auth.status, { error: 'Operator access token required' }, 'application/json; charset=utf-8',
        auth.status === 429 ? { 'Retry-After': String(auth.retryAfter) } : { 'WWW-Authenticate': 'Bearer' });
      return send(res, 200, { revoked: sessions.revokeAll() });
    }
    const issuedSession = sessions.verify(bearer);
    const auth = issuedSession ? { ok: true } : guard.authenticate(bearer, source);
    if (!auth.ok) return send(res, auth.status, {
      error: auth.status === 429 ? 'Too many failed access attempts; retry later' : 'Unlock with the server access token'
    }, 'application/json; charset=utf-8', auth.status === 429 ? { 'Retry-After': String(auth.retryAfter) } : { 'WWW-Authenticate': 'Bearer' });
    // A request may outlive its authorization while Node reads a slow upload or
    // waits for the serialized writer. Recheck immediately before any mutation.
    // A write already committed before revocation cannot be rolled back here.
    const requireActiveSession = () => {
      if (issuedSession && !sessions.verify(bearer)) {
        throw new AppError(401, 'Session expired or was revoked; unlock again');
      }
    };
    const mutateAuthorized = fn => store.mutate(draft => {
      requireActiveSession();
      return fn(draft);
    });
    if (path === '/api/library' && req.method === 'GET') return send(res, 200, store.snapshot());
    if (path === '/api/bookmarks' && req.method === 'GET') return send(res, 200, searchBookmarks(store.snapshot(), url.searchParams));
    if (path === '/api/bookmarks' && req.method === 'POST') {
      const input = await readJson(req);
      const item = await mutateAuthorized(s => {
        const next = makeBookmark(input, null, s.collections);
        if (s.bookmarks.some(b => !b.trashedAt && dedupeKey(b.url) === dedupeKey(next.url))) {
          throw new AppError(409, 'Bookmark already exists');
        }
        s.bookmarks.unshift(next);
        return next;
      });
      return send(res, 201, item);
    }
    if (path.startsWith('/api/bookmarks/') && ['PATCH', 'DELETE'].includes(req.method)) {
      const id = path.slice('/api/bookmarks/'.length);
      if (!id || id.includes('/')) throw new AppError(404, 'Not found');
      const input = req.method === 'PATCH' ? await readJson(req) : null;
      const item = await mutateAuthorized(s => {
        const i = s.bookmarks.findIndex(b => b.id === id);
        if (i < 0) throw new AppError(404, 'Bookmark not found');
        const next = req.method === 'DELETE'
          ? { ...s.bookmarks[i], trashedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
          : makeBookmark(input, s.bookmarks[i], s.collections);
        if (!next.trashedAt && s.bookmarks.some(b => b.id !== id && !b.trashedAt && dedupeKey(b.url) === dedupeKey(next.url))) {
          throw new AppError(409, 'Bookmark already exists');
        }
        s.bookmarks[i] = next;
        return next;
      });
      return send(res, 200, item);
    }
    if (path === '/api/collections' && req.method === 'POST') {
      const input = await readJson(req);
      const item = await mutateAuthorized(s => {
        const next = makeCollection(input);
        if (s.collections.some(c => c.name.toLowerCase() === next.name.toLowerCase())) throw new AppError(409, 'Collection name already exists');
        s.collections.push(next);
        return next;
      });
      return send(res, 201, item);
    }
    if (path.startsWith('/api/collections/') && ['PATCH', 'DELETE'].includes(req.method)) {
      const id = path.slice('/api/collections/'.length);
      if (!id || id.includes('/')) throw new AppError(404, 'Not found');
      const input = req.method === 'PATCH' ? await readJson(req) : null;
      const item = await mutateAuthorized(s => {
        const i = s.collections.findIndex(c => c.id === id);
        if (i < 0) throw new AppError(404, 'Collection not found');
        if (req.method === 'DELETE') {
          s.bookmarks = s.bookmarks.map(b => b.collectionId === id ? { ...b, collectionId: null, updatedAt: new Date().toISOString() } : b);
          return s.collections.splice(i, 1)[0];
        }
        const next = makeCollection(input, s.collections[i]);
        if (s.collections.some(c => c.id !== id && c.name.toLowerCase() === next.name.toLowerCase())) {
          throw new AppError(409, 'Collection name already exists');
        }
        s.collections[i] = next;
        return next;
      });
      return send(res, 200, item);
    }
    if (path === '/api/import/full/preview' && req.method === 'POST') {
      const input = await readJson(req, 8 * 1024 * 1024);
      requireActiveSession();
      const snapshot = store.snapshot();
      const revision = libraryRevision(snapshot);
      const result = importWholeFile(snapshot, input);
      return send(res, 200, { ...result, revision, preview: true });
    }
    if (path === '/api/import/full' && req.method === 'POST') {
      const input = await readJson(req, 8 * 1024 * 1024);
      if (typeof input?.baseRevision !== 'string' || !/^[a-f0-9]{64}$/.test(input.baseRevision)) {
        throw new AppError(428, 'Whole-file import requires a current preview revision');
      }
      const result = await mutateAuthorized(draft => {
        if (libraryRevision(draft) !== input.baseRevision) {
          throw new AppError(409, 'Library changed since preview; review import again');
        }
        return importWholeFile(draft, input);
      });
      return send(res, 200, result);
    }
    if (path === '/api/import/preview' && req.method === 'POST') {
      const input = await readJson(req);
      // A revoked session must not receive private preview details after a slow upload.
      requireActiveSession();
      // Work only on a detached snapshot; this request must never write to disk.
      const result = importBatch(store.snapshot(), input);
      return send(res, 200, { ...result, preview: true });
    }
    if (path === '/api/import' && req.method === 'POST') {
      const input = await readJson(req);
      const result = await mutateAuthorized(draft => importBatch(draft, input));
      return send(res, 200, result);
    }
    if (path === '/api/export' && req.method === 'GET') {
      return send(res, 200, store.snapshot(), 'application/json; charset=utf-8', {
        'Content-Disposition': 'attachment; filename="goreecloud-bookmarks.json"'
      });
    }
    if (path === '/api/export/html' && req.method === 'GET') {
      return send(res, 200, exportHtml(store.snapshot().bookmarks), 'text/html; charset=utf-8', {
        'Content-Disposition': 'attachment; filename="goreecloud-bookmarks.html"'
      });
    }
    return send(res, 404, { error: 'Not found' });
  } catch (err) {
    const status = err instanceof AppError ? err.status : 500;
    if (status === 500) console.error('Request failed:', err?.message || 'unknown');
    if (!res.headersSent) return send(res, status, { error: status === 500 ? 'Internal server error' : err.message });
    res.end();
  }
});
// Stop accepting new traffic and finish in-flight requests before releasing the lock.
// A SIGKILL or power loss intentionally leaves a fail-closed sidecar lock behind.
let stopping = false;
function shutdown() {
  if (stopping) return;
  stopping = true;
  server.close(async error => {
    try { if (store?.close) await store.close(); await writerLock.release(); }
    catch (releaseError) { console.error('Library lock release failed:', releaseError.message); process.exitCode = 1; }
    if (error) { console.error('Server shutdown failed:', error.message); process.exitCode = 1; }
  });
}
process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);
server.once('error', async error => {
  console.error('Server could not listen:', error.message);
  process.exitCode = 1;
  try { if (store?.close) await store.close(); await writerLock.release(); }
  catch (releaseError) { console.error('Library lock release failed:', releaseError.message); }
});
server.listen(port, host, () => console.log('GoreeCloud Bookmarks listening at http://' + host + ':' + server.address().port));
