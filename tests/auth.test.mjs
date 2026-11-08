import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createAuthGuard} from '../src/auth.mjs';

test('authentication guard requires a strong token and rejects malformed credentials', () => {
  assert.throws(() => createAuthGuard('short'));
  const guard = createAuthGuard('s'.repeat(32));
  assert.equal(guard.authenticate('', 'a').status, 401);
  assert.equal(guard.authenticate('Basic '+ 's'.repeat(32), 'a').status, 401);
  assert.equal(guard.authenticate('Bearer '+ 's'.repeat(32), 'a').ok, true);
});

test('failed attempts are throttled, source-scoped and recover after a time window', () => {
  let now = 100;
  const guard = createAuthGuard('s'.repeat(32), {maxFailures:2,windowMs:2000,clock:()=>now});
  assert.equal(guard.authenticate('Bearer wrong','a').status,401);
  assert.equal(guard.authenticate('Bearer wrong','a').status,401);
  assert.deepEqual(guard.authenticate('Bearer '+ 's'.repeat(32),'a'), {ok:false,status:429,retryAfter:2});
  assert.equal(guard.authenticate('Bearer '+ 's'.repeat(32),'b').ok,true);
  now += 2000;
  assert.equal(guard.authenticate('Bearer '+ 's'.repeat(32),'a').ok,true);
  assert.equal(guard.authenticate('Bearer wrong','a').status,401);
});
