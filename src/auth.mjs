import {createHash, timingSafeEqual} from 'node:crypto';

/** Fixed-window, bounded-memory protection for a single-user bearer-token service. */
export function createAuthGuard(secret, {maxFailures = 10, windowMs = 60_000, maxSources = 256, clock = Date.now} = {}) {
  if (typeof secret !== 'string' || secret.length < 24) throw new Error('A strong access token is required');
  if (!Number.isInteger(maxFailures) || maxFailures < 1 || !Number.isInteger(windowMs) || windowMs < 1000 ||
    !Number.isInteger(maxSources) || maxSources < 1) throw new Error('Invalid authentication policy');
  const digest = createHash('sha256').update(secret).digest();
  const attempts = new Map();
  function authenticate(header, source = 'unknown') {
    const now = clock();
    const key = String(source).slice(0, 128);
    let record = attempts.get(key);
    if (record && record.expires <= now) {
      attempts.delete(key);
      record = undefined;
    }
    if (record && record.failures >= maxFailures) {
      return {ok: false, status: 429, retryAfter: Math.max(1, Math.ceil((record.expires - now) / 1000))};
    }
    let ok = false;
    if (typeof header === 'string' && header.startsWith('Bearer ') && header.length < 8192) {
      const test = createHash('sha256').update(header.slice(7)).digest();
      ok = timingSafeEqual(test, digest);
    }
    if (ok) {
      attempts.delete(key);
      return {ok: true, status: 200};
    }
    if (!record) {
      if (attempts.size >= maxSources) attempts.delete(attempts.keys().next().value);
      record = {failures: 0, expires: now + windowMs};
      attempts.set(key, record);
    }
    record.failures++;
    return {ok: false, status: 401};
  }
  return {authenticate};
}
