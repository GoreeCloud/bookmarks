import { test } from 'node:test';
import assert from 'node:assert/strict';
import { trustedHostPolicy } from '../src/host.mjs';

test('default host policy allows loopback and rejects rebinding and malformed authorities', () => {
  const policy = trustedHostPolicy();
  for (const h of ['127.0.0.1', '127.0.0.1:4173', 'localhost', 'LOCALHOST:8888', '[::1]', '[::1]:12345']) {
    assert.equal(policy.accepts(h), true, h);
  }
  for (const h of ['evil.example', 'evil.example:80', 'localhost.evil.example', '127.0.0.1.evil.example',
    'evil.example@localhost', 'localhost/evil', 'localhost?x=y', 'localhost#fragment', 'localhost:0',
    'localhost:99999', 'localhost:', 'http://localhost', 'localhost,evil.example', '0x7f000001', '2130706433', '0177.0.0.1', '[0:0::1]', '', null, '::1']) {
    assert.equal(policy.accepts(h), false, String(h));
  }
});

test('operator can opt into exact external hostname, not wildcard or suffix', () => {
  const policy = trustedHostPolicy('Bookmarks.Example.ORG, 192.0.2.33');
  assert.ok(policy.accepts('bookmarks.example.org:443'));
  assert.ok(policy.accepts('192.0.2.33'));
  assert.equal(policy.accepts('fakebookmarks.example.org'), false);
  assert.equal(policy.accepts('bookmarks.example.org.evil'), false);
  for (const value of ['*', '*.example.org', 'https://example.org', 'example.org:443', 'a,,b', '[::1]:1234']) {
    assert.throws(() => trustedHostPolicy(value), /Invalid GCB_TRUSTED_HOSTS/);
  }
});
