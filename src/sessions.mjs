import { createHash, randomBytes } from 'node:crypto';

/**
 * Revocable, memory-only, individually scoped bearer sessions for one local owner.
 * The operator's GCB_AUTH_TOKEN is only the bootstrap credential; it remains
 * accepted for existing API integrations and must be rotated out of band if lost.
 * All sessions are invalidated on process restart.
 */
export function createSessionManager({ ttlMs = 8 * 60 * 60 * 1000, maxSessions = 32, clock = Date.now } = {}) {
  if (!Number.isSafeInteger(ttlMs) || ttlMs < 60_000 ||
      !Number.isSafeInteger(maxSessions) || maxSessions < 1 || maxSessions > 1024 ||
      typeof clock !== 'function') throw new Error('Invalid session policy');
  const sessions = new Map();
  const prefix = 'gcb1_';
  const hash = value => createHash('sha256').update(value).digest('hex');
  function purge(now = clock()) {
    for (const [digest, expiry] of sessions) if (expiry <= now) sessions.delete(digest);
  }
  function tokenFrom(header) {
    if (typeof header !== 'string' || header.length > 256 ||
        !header.startsWith('Bearer ')) return null;
    const candidate = header.slice(7);
    return /^gcb1_[A-Za-z0-9_-]{43}$/.test(candidate) ? candidate : null;
  }
  function issue() {
    const now = clock();
    purge(now);
    while (sessions.size >= maxSessions) sessions.delete(sessions.keys().next().value);
    const token = prefix + randomBytes(32).toString('base64url');
    const expiresAt = now + ttlMs;
    sessions.set(hash(token), expiresAt);
    return { token, expiresAt: new Date(expiresAt).toISOString() };
  }
  function verify(header) {
    const token = tokenFrom(header);
    if (!token) return false;
    const digest = hash(token);
    const expiresAt = sessions.get(digest);
    if (expiresAt === undefined) return false;
    if (expiresAt <= clock()) { sessions.delete(digest); return false; }
    return true;
  }
  function revoke(header) {
    const token = tokenFrom(header);
    return token ? sessions.delete(hash(token)) : false;
  }
  function revokeAll() {
    const count = sessions.size;
    sessions.clear();
    return count;
  }
  return { issue, verify, revoke, revokeAll, activeCount: () => { purge(); return sessions.size; } };
}
