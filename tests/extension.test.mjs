import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {capturePayload} from '../extension/helpers.mjs';
test('browser capture rejects internal and script URLs',()=>{
 for(const url of ['chrome://extensions','about:blank','javascript:alert(1)','file:///etc/passwd'])
  assert.throws(()=>capturePayload({url}),TypeError);
});
test('browser capture applies a tag limit and normalizes duplicates',()=>{
 const x=capturePayload({url:'https://example.com/a?x=1',title:'   Read this  '},'Research, research, AI','collection-id');
 assert.equal(x.url,'https://example.com/a?x=1');assert.equal(x.title,'Read this');
 assert.deepEqual(x.tags,['research','ai']);assert.equal(x.collectionId,'collection-id');
 assert.throws(()=>capturePayload({url:'https://example.com'},'x'.repeat(33)),TypeError);
});
test('extension only requests local server origins and limited permissions',async()=>{
 const manifest=JSON.parse(await readFile(new URL('../extension/manifest.json',import.meta.url),'utf8'));
 assert.deepEqual(manifest.permissions,['activeTab','storage']);
 assert.ok(manifest.host_permissions.every(p=>p.startsWith('http://127.0.0.1:4173/')||p.startsWith('http://localhost:4173/')));
 assert.equal(manifest.manifest_version,3);
});

test('experimental extension persists only issued sessions, never the operator bootstrap token', async () => {
  const popup = await readFile(new URL('../extension/popup.mjs', import.meta.url), 'utf8');
  assert.match(popup, /chrome\.storage\.session\.remove\('gcbToken'\)/);
  assert.match(popup, /chrome\.storage\.session\.get\('gcbSession'\)/);
  assert.match(popup, /request\('\/api\/auth\/session'/);
  assert.match(popup, /chrome\.storage\.session\.set\(\{gcbSession:issued\}\)/);
  assert.match(popup, /request\('\/api\/auth\/revoke'/);
  assert.doesNotMatch(popup, /chrome\.storage\.session\.set\(\{gcbToken:/);
});
