import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSessionManager } from '../src/sessions.mjs';

const header = token => 'Bearer ' + token;
test('session credentials are opaque, revocable, independent and never persist across manager restart', () => {
  const manager = createSessionManager();
  const first = manager.issue();
  const second = manager.issue();
  assert.match(first.token, /^gcb1_[A-Za-z0-9_-]{43}$/);
  assert.notEqual(first.token, second.token);
  assert.equal(manager.activeCount(), 2);
  assert.equal(manager.verify(header(first.token)), true);
  assert.equal(manager.verify(header(second.token)), true);
  assert.equal(manager.verify(header(first.token + 'not-the-same')), false);
  assert.equal(manager.verify('Basic ' + first.token), false);
  assert.equal(manager.revoke(header(first.token)), true);
  assert.equal(manager.revoke(header(first.token)), false);
  assert.equal(manager.verify(header(first.token)), false);
  assert.equal(manager.verify(header(second.token)), true);
  assert.equal(createSessionManager().verify(header(second.token)), false);
  assert.equal(manager.revokeAll(), 1);
  assert.equal(manager.activeCount(), 0);
  assert.equal(manager.verify(header(second.token)), false);
});

test('session credentials expire, capacity is bounded and input policies fail closed', () => {
  let now = Date.parse('2026-11-06T12:00:00Z');
  const manager = createSessionManager({ ttlMs: 60_000, maxSessions: 2, clock: () => now });
  const oldest = manager.issue();
  now += 1000;
  const middle = manager.issue();
  now += 1000;
  const newest = manager.issue();
  assert.equal(manager.activeCount(), 2);
  assert.equal(manager.verify(header(oldest.token)), false, 'oldest session evicted');
  assert.equal(manager.verify(header(middle.token)), true);
  assert.equal(manager.verify(header(newest.token)), true);
  now += 60_001;
  assert.equal(manager.verify(header(middle.token)), false);
  assert.equal(manager.verify(header(newest.token)), false);
  assert.equal(manager.activeCount(), 0);
  assert.throws(() => createSessionManager({ ttlMs: 10 }), /Invalid session/);
  assert.throws(() => createSessionManager({ maxSessions: 0 }), /Invalid session/);
  assert.throws(() => createSessionManager({ maxSessions: 1025 }), /Invalid session/);
});
