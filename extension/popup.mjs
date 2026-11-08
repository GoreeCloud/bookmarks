import {capturePayload} from './helpers.mjs';
const $ = id => document.getElementById(id);
const base = 'http://127.0.0.1:4173';
let secret = '';
let activeTab = null;
function status(message, state = 'info') { $('status').textContent = message; $('status').dataset.state = state; }
async function request(path, options = {}, credential = secret) {
  if (!credential) throw new Error('Enter your access token in Connection settings first.');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(base + path, {
      ...options, headers: {Authorization: 'Bearer ' + credential, ...(options.body ? {'Content-Type': 'application/json'} : {})},
      credentials: 'omit', redirect: 'error', signal: controller.signal
    });
    let body;
    try {body = await res.json();} catch {throw new Error('Unexpected server response');}
    if (!res.ok) throw new Error(body.error || 'Request failed (' + res.status + ')');
    return body;
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('Local server did not respond');
    throw err;
  } finally {clearTimeout(timeout);}
}
async function loadCollections() {
  const select = $('collection');
  select.replaceChildren(new Option('Inbox / no collection', ''));
  if (!secret) return;
  const data = await request('/api/library');
  for (const col of data.collections) select.append(new Option(col.name, col.id));
}
async function init() {
  try {
    // Never carry forward an operator secret stored by an earlier preview.
    await chrome.storage.session.remove('gcbToken');
    const stored = await chrome.storage.session.get('gcbSession');
    secret = typeof stored.gcbSession === 'string' && /^gcb1_[A-Za-z0-9_-]{43}$/.test(stored.gcbSession) ? stored.gcbSession : '';
    const [tab] = await chrome.tabs.query({active:true,currentWindow:true});
    activeTab = tab;
    const payload = capturePayload(tab);
    $('url').value = payload.url;
    $('title').value = payload.title || new URL(payload.url).hostname;
  } catch (err) {status(err.message, 'error');$('save').disabled = true;}
  if (secret) {
    try {await loadCollections();status('Connected to your local library.', 'success');}
    catch (err) {await forgetSession(); $('settings').open = true; status(err.message, 'error');}
  } else $('settings').open = true;
}
async function forgetSession() {
  const old = secret;
  secret = '';
  await chrome.storage.session.remove('gcbSession');
  if (!old) return true;
  try { await request('/api/auth/revoke', { method: 'POST' }, old); return true; }
  catch { return false; } // Server may be offline; expiry remains bounded.
}
$('connect').addEventListener('click', async () => {
  const value = $('token').value.trim();
  if (value.length < 24) return status('Token must contain at least 24 characters.', 'error');
  let issued = '';
  try {
    const response = await request('/api/auth/session', { method: 'POST' }, value);
    if (!/^gcb1_[A-Za-z0-9_-]{43}$/.test(response.token || '')) throw new Error('Invalid session response');
    issued = response.token;
    secret = issued;
    await loadCollections();
    await chrome.storage.session.set({gcbSession:issued});
    $('token').value = ''; $('settings').open = false;
    status('Connected to local library.', 'success');
  } catch (err) {
    if (issued) await forgetSession();
    status(err.message, 'error');
  }
});
$('disconnect').addEventListener('click', async () => {
  // Remove the credential immediately before attempting a best-effort revoke.
  const revoked = await forgetSession();
  $('settings').open = true;
  $('collection').replaceChildren(new Option('Inbox / no collection', ''));
  status(revoked ? 'Session revoked and forgotten.' : 'Session forgotten locally; server revocation unconfirmed.',
    revoked ? 'success' : 'info');
});
$('save-form').addEventListener('submit', async e => {
  e.preventDefault();
  const save = $('save');save.disabled = true;
  try {
    const payload = capturePayload({...activeTab, title:$('title').value},$('tags').value,$('collection').value);
    await request('/api/bookmarks',{method:'POST',body:JSON.stringify(payload)});
    status('Saved to GoreeCloud Bookmarks.', 'success');
  } catch(err) {status(err.message, 'error');}
  finally {save.disabled = false;}
});
init();
