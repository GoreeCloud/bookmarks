import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

test('tab locking and rejected tokens wipe private client data', async () => {
  const source = await readFile(fileURLToPath(new URL('../public/app.js', import.meta.url)), 'utf8');
  const html = await readFile(fileURLToPath(new URL('../public/index.html', import.meta.url)), 'utf8');
  assert.match(html, /id="lock-workspace"[^>]+aria-label="Lock this tab"/);
  assert.match(source, /sessionStorage\.removeItem\('gcb-token'\)/);
  assert.match(source, /sessionStorage\.removeItem\('gcb-session'\)/);
  assert.match(source, /revokeServerSession\(priorSession\)/);
  assert.match(source, /state\.bookmarks = \[\]; state\.collections = \[\]/);
  assert.match(source, /if \(res\.status === 401\) \{\s*lockWorkspace\(\)/);
  assert.match(source, /if \(epoch !== sessionEpoch \|\| !auth\) return/);
});

test('tag chips provide a keyboard-operable filter with a visible reset', async () => {
  const source = await readFile(fileURLToPath(new URL('../public/app.js', import.meta.url)), 'utf8');
  const html = await readFile(fileURLToPath(new URL('../public/index.html', import.meta.url)), 'utf8');
  assert.match(html, /id="clear-tag-filter"[^>]+aria-label="Clear tag filter"/);
  assert.match(source, /state\.tag && !b\.tags\.includes\(state\.tag\)/);
  assert.match(source, /chooseTag\.setAttribute\('aria-pressed'/);
  assert.match(source, /state\.tag = null; render\(\)/);
});

test('each asynchronous API response is bound to the session that initiated it', async () => {
  const source = await readFile(fileURLToPath(new URL('../public/app.js', import.meta.url)), 'utf8');
  assert.match(source, /const epoch = sessionEpoch, credential = auth;\s*const res = await fetch\(path/);
  assert.match(source, /if \(!sessionIsCurrent\(epoch, credential\)\) throw Error\('Workspace session changed'\);\s*if \(res\.status === 401\)/);
  assert.match(source, /const body = await res\.json\(\);\s*if \(!sessionIsCurrent\(epoch, credential\)\)/);
  assert.match(source, /sessionEpoch\+\+; auth = '';[\s\S]*?const epoch = sessionEpoch/);
  assert.match(source, /if \(!loaded \|\| !sessionIsCurrent\(epoch, issuedToken\)\)/);
  assert.match(source, /fetch\('\/api\/auth\/session'/);
  assert.match(source, /sessionStorage\.setItem\('gcb-session', issuedToken\)/);
});

test('late private exports and import previews stop after locking', async () => {
  const source = await readFile(fileURLToPath(new URL('../public/app.js', import.meta.url)), 'utf8');
  assert.match(source, /const blob = await res\.blob\(\);\s*\/\/ Never create\/download a private export after the workspace is locked\.\s*if \(!sessionIsCurrent\(epoch, credential\)\) return;/);
  assert.match(source, /const preview = await api\('\/api\/import\/full\/preview',[\s\S]*?if \(!sessionIsCurrent\(epoch, credential\)\) return;\s*const summary/);
  assert.match(source, /if \(!confirm\(summary\) \|\| !sessionIsCurrent\(epoch, credential\)\) return;/);
});
