'use strict';
const $ = id => document.getElementById(id);
const state = { bookmarks: [], collections: [], view: 'all', term: '', tag: null, sort: 'newest', layout: 'grid', editId: null, collectionEditId: null };
// Migrate away from the old build's tab-stored operator secret.
sessionStorage.removeItem('gcb-token');
let auth = sessionStorage.getItem('gcb-session') || '';
function revokeServerSession(credential) {
  if (!/^gcb1_[A-Za-z0-9_-]{43}$/.test(credential || '')) return;
  // Clear the tab first; revocation is best effort if the network has gone away.
  void fetch('/api/auth/revoke', { method: 'POST',
    headers: { Authorization: 'Bearer ' + credential }, cache: 'no-store', keepalive: true }).catch(() => {});
}
let sessionEpoch = 0;
let toastTimer;
/** Lock the current tab and remove cached private content, including in the DOM. */
function lockWorkspace() {
  const priorSession = auth;
  sessionEpoch++;
  sessionStorage.removeItem('gcb-session'); auth = '';
  revokeServerSession(priorSession);
  state.bookmarks = []; state.collections = []; state.view = 'all'; state.term = ''; state.tag = null;
  state.editId = null; state.collectionEditId = null;
  $('search').value = '';
  for (const id of ['bookmark-dialog', 'collection-dialog']) if ($(id).open) $(id).close();
  $('auth-token').value = ''; $('unlock-error').textContent = '';
  render();
  if (!$('unlock-dialog').open) $('unlock-dialog').showModal();
}
function notify(message) {
  const node = $('toast'); node.textContent = message; node.classList.add('visible');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => node.classList.remove('visible'), 3600);
}
function node(tag, cls, text) {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text !== undefined) el.textContent = text;
  return el;
}
function button(label, action, cls) {
  const b = node('button', cls, label);
  b.type = 'button'; b.addEventListener('click', action); return b;
}
// Bind every request to the exact tab session that initiated it. A stale 401 must
// never lock a later successful unlock; a stale payload must not reach callers.
function sessionIsCurrent(epoch, credential) {
  return epoch === sessionEpoch && credential === auth && Boolean(credential);
}
async function api(path, options = {}) {
  const epoch = sessionEpoch, credential = auth;
  const res = await fetch(path, {
    ...options, headers: { Authorization: 'Bearer ' + credential, ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) }, cache: 'no-store'
  });
  if (!sessionIsCurrent(epoch, credential)) throw Error('Workspace session changed');
  if (res.status === 401) {
    lockWorkspace();
    throw Error('Access token was rejected');
  }
  const body = await res.json();
  if (!sessionIsCurrent(epoch, credential)) throw Error('Workspace session changed');
  if (!res.ok) throw Error(body.error || 'Request failed');
  return body;
}
async function refresh() {
  const epoch = sessionEpoch;
  const data = await api('/api/library');
  // A response that arrives after the user locks the workspace must never rehydrate it.
  if (epoch !== sessionEpoch || !auth) return false;
  state.bookmarks = data.bookmarks;
  state.collections = data.collections;
  render();
  return true;
}
function host(url) { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return 'website'; } }
function setView(view) {
  state.view = view;
  document.querySelectorAll('[data-view]').forEach(b => {
    const selected = b.dataset.view === view;
    b.classList.toggle('active', selected);
    if (selected) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  });
  render();
}
function filtered() {
  return state.bookmarks.filter(b => {
    if (state.view === 'trash' ? !b.trashedAt : !!b.trashedAt) return false;
    if (state.view === 'favorites' && !b.favorite) return false;
    if (state.view === 'unread' && b.status === 'read') return false;
    if (state.view.startsWith('c:') && b.collectionId !== state.view.slice(2)) return false;
    if (state.tag && !b.tags.includes(state.tag)) return false;
    return !state.term || [b.title, b.url, b.description, b.notes, ...b.tags].join(' ').toLowerCase().includes(state.term.toLowerCase());
  }).sort((a, b) => state.sort === 'title' ? a.title.localeCompare(b.title) :
    state.sort === 'oldest' ? a.createdAt.localeCompare(b.createdAt) :
      Number(b.pinned) - Number(a.pinned) || b.createdAt.localeCompare(a.createdAt));
}
function renderCollections() {
  const el = $('collections'); el.replaceChildren();
  const picker = $('mobile-collections'); picker.replaceChildren(new Option('All collections', 'all'));
  state.collections.forEach(c => picker.append(new Option(c.name, 'c:' + c.id)));
  picker.value = state.view.startsWith('c:') ? state.view : 'all';
  for (const col of state.collections) {
    const row = node('div', 'collection-row');
    const choose = button('◫  ' + col.name, () => setView('c:' + col.id), 'nav-item');
    choose.title = col.name;
    if (state.view === 'c:' + col.id) { choose.classList.add('active'); choose.setAttribute('aria-current', 'page'); }
    const edit = button('···', () => openCollection(col), 'small-icon');
    edit.setAttribute('aria-label', 'Edit ' + col.name); row.append(choose, edit); el.append(row);
  }
}
function card(b) {
  const box = node('article', 'bookmark-card');
  const art = node('div', 'card-art'); art.append(node('span', 'art-letter', host(b.url).slice(0, 1))); box.append(art);
  const body = node('div', 'card-body');
  const domain = node('div', 'card-domain', host(b.url));
  const link = node('a', 'card-title', b.title);
  link.href = b.url; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.title = 'Open ' + b.title;
  const description = node('p', 'card-description', b.description || b.notes || 'A saved corner of the internet.');
  const tags = node('div', 'tags');
  b.tags.slice(0, 4).forEach(tag => {
    const chooseTag = button('#' + tag, () => { state.tag = state.tag === tag ? null : tag; render(); }, 'tag tag-button');
    chooseTag.setAttribute('aria-label', 'Filter by tag ' + tag);
    chooseTag.setAttribute('aria-pressed', String(state.tag === tag));
    tags.append(chooseTag);
  });
  if (b.status === 'read') tags.append(node('span', 'tag', '✓ read'));
  if (b.pinned) tags.append(node('span', 'tag', 'pinned'));
  body.append(domain, link, description, tags);
  const footer = node('div', 'card-footer');
  const favorite = button(b.favorite ? '★' : '☆', () => patch(b.id, { favorite: !b.favorite }), b.favorite ? 'favorite-on' : '');
  favorite.title = b.favorite ? 'Remove favorite' : 'Add favorite'; favorite.setAttribute('aria-label', favorite.title);
  const pin = button(b.pinned ? 'Unpin' : 'Pin', () => patch(b.id, { pinned: !b.pinned }));
  const edit = button('Edit', () => openBookmark(b));
  const status = button(b.status === 'read' ? 'Unread' : 'Mark read', () => patch(b.id, { status: b.status === 'read' ? 'unread' : 'read' }));
  footer.append(favorite);
  if (!b.trashedAt) footer.append(pin, edit, status);
  footer.append(node('span', 'spacer'), button(b.trashedAt ? 'Restore' : 'Delete',
    () => b.trashedAt ? patch(b.id, { trashedAt: null }) : remove(b.id)));
  box.append(body, footer); return box;
}
function render() {
  const active = state.bookmarks.filter(b => !b.trashedAt);
  $('count-all').textContent = active.length;
  $('stat-saved').textContent = active.length;
  $('stat-unread').textContent = active.filter(b => b.status !== 'read').length;
  $('stat-collections').textContent = state.collections.length;
  renderCollections();
  const col = state.collections.find(c => state.view === 'c:' + c.id);
  const heading = col?.name || ({ all: 'All bookmarks', favorites: 'Favorites', unread: 'Read later', trash: 'Recently deleted' }[state.view] || 'Your library');
  $('view-heading').textContent = heading; $('crumb').textContent = heading;
  $('active-tag-filter').hidden = !state.tag;
  $('active-tag-label').textContent = state.tag ? '#' + state.tag : '';
  const items = filtered();
  $('result-count').textContent = items.length + (items.length === 1 ? ' bookmark' : ' bookmarks');
  $('items').classList.toggle('list-layout', state.layout === 'list');
  $('items').replaceChildren(...items.map(card));
  $('empty').hidden = items.length > 0;
  $('empty-message').textContent = (state.term || state.tag) ? 'No saved links match those filters.' :
    state.view === 'trash' ? 'Your recently deleted folder is empty.' : 'Save a link to start building this collection.';
  $('empty-add').hidden = !!state.term || !!state.tag || state.view === 'trash';
}
async function patch(id, input) {
  try { await api('/api/bookmarks/' + encodeURIComponent(id), { method: 'PATCH', body: JSON.stringify(input) }); await refresh(); notify('Bookmark updated'); }
  catch (err) { notify(err.message); }
}
async function remove(id) {
  if (!confirm('Move this bookmark to Recently deleted?')) return;
  try { await api('/api/bookmarks/' + encodeURIComponent(id), { method: 'DELETE' }); await refresh(); notify('Moved to Recently deleted'); }
  catch (err) { notify(err.message); }
}
function fillCollections() {
  const select = $('form-collection'); select.replaceChildren(new Option('Inbox / no collection', ''));
  state.collections.forEach(c => select.append(new Option(c.name, c.id)));
}
function openBookmark(b = null) {
  state.editId = b?.id || null;
  const form = $('bookmark-form'); form.reset(); fillCollections();
  $('dialog-title').textContent = b ? 'Edit bookmark' : 'New bookmark';
  if (b) {
    for (const field of ['url', 'title', 'description', 'notes', 'collectionId', 'status']) {
      form.elements[field].value = b[field] || '';
    }
    form.elements.tags.value = b.tags.join(', ');
  }
  $('bookmark-dialog').showModal(); form.elements.url.focus();
}
function openCollection(c = null) {
  state.collectionEditId = c?.id || null;
  const form = $('collection-form'); form.reset();
  $('collection-title').textContent = c ? 'Edit collection' : 'New collection';
  $('delete-collection').hidden = !c;
  if (c) form.elements.name.value = c.name;
  $('collection-dialog').showModal();
}
async function download(path, name) {
  const epoch = sessionEpoch, credential = auth;
  try {
    const res = await fetch(path, { headers: { Authorization: 'Bearer ' + credential }, cache: 'no-store' });
    if (!sessionIsCurrent(epoch, credential)) return;
    if (res.status === 401) { lockWorkspace(); throw Error('Access token was rejected'); }
    if (!res.ok) throw Error('Export failed');
    const blob = await res.blob();
    // Never create/download a private export after the workspace is locked.
    if (!sessionIsCurrent(epoch, credential)) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = name;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000); notify('Export downloaded');
  } catch (err) {
    if (sessionIsCurrent(epoch, credential) || err.message === 'Access token was rejected') notify(err.message);
  }
}
async function importFile(file) {
  if (!file) return;
  const epoch = sessionEpoch, credential = auth;
  try {
    if (file.size > 8 * 1024 * 1024) throw Error('Import file must be smaller than 8 MiB');
    const source = await file.text(); let bookmarks; let sourceCollections = [];
    if (file.name.toLowerCase().endsWith('.html')) {
      const doc = new DOMParser().parseFromString(source, 'text/html');
      bookmarks = [...doc.querySelectorAll('a[href]')].map(a => ({ url: a.getAttribute('href'), title: a.textContent.trim() }));
    } else {
      const json = JSON.parse(source); bookmarks = Array.isArray(json) ? json : json.bookmarks;
      sourceCollections = Array.isArray(json) ? [] : (json.collections ?? []);
    }
    if (!Array.isArray(bookmarks) || bookmarks.length > 10000 || !Array.isArray(sourceCollections) || sourceCollections.length > 200) throw Error('Unsupported import (limit: 10,000 bookmarks and 200 collections)');
    const payload = { bookmarks, collections: sourceCollections };
    const preview = await api('/api/import/full/preview', { method: 'POST', body: JSON.stringify(payload) });
    if (!sessionIsCurrent(epoch, credential)) return;
    const summary = `Whole-file import preview (${bookmarks.length} links):\n${preview.imported} links to add, ${preview.skipped} skipped, ${preview.collectionsCreated || 0} collections to create.\n\nAll changes will be saved together. Continue?`;
    if (!confirm(summary) || !sessionIsCurrent(epoch, credential)) return;
    // The commit checks that the library has not changed since this exact preview.
    const result = await api('/api/import/full', { method: 'POST', body: JSON.stringify({ ...payload, baseRevision: preview.revision }) });
    if (!sessionIsCurrent(epoch, credential)) return;
    await refresh();
    if (sessionIsCurrent(epoch, credential)) notify('Imported ' + result.imported + ' links, ' + result.collectionsCreated + ' collections · skipped ' + result.skipped);
  } catch (err) { if (sessionIsCurrent(epoch, credential)) notify(err.message); }
  finally { $('file-import').value = ''; }
}
$('lock-workspace').addEventListener('click', lockWorkspace);
$('new-bookmark').addEventListener('click', () => openBookmark());
$('mobile-add').addEventListener('click', () => openBookmark());
$('empty-add').addEventListener('click', () => openBookmark());
$('new-collection').addEventListener('click', () => openCollection());
$('mobile-new-collection').addEventListener('click', () => openCollection());
document.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => setView(b.dataset.view)));
document.querySelectorAll('[data-mobile-view]').forEach(b => b.addEventListener('click', () => setView(b.dataset.mobileView)));
$('search').addEventListener('input', e => { state.term = e.target.value; render(); });
$('clear-tag-filter').addEventListener('click', () => { state.tag = null; render(); $('search').focus(); });
$('sort').addEventListener('change', e => { state.sort = e.target.value; render(); });
function setLayout(mode) {
  state.layout = mode;
  for (const [id, value] of [['grid-view', 'grid'], ['list-view', 'list']]) {
    $(id).classList.toggle('layout-active', value === mode);
    $(id).setAttribute('aria-pressed', String(value === mode));
  }
  render();
}
$('grid-view').addEventListener('click', () => setLayout('grid'));
$('list-view').addEventListener('click', () => setLayout('list'));
function toggleTheme() {
  const mode = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = mode; localStorage.setItem('gcb-theme', mode);
}
$('theme-switch').addEventListener('click', toggleTheme);
$('mobile-theme').addEventListener('click', toggleTheme);
const savedMode = localStorage.getItem('gcb-theme');
document.documentElement.dataset.theme = ['light', 'dark'].includes(savedMode) ? savedMode :
  (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => $(b.dataset.close).close()));
$('bookmark-form').addEventListener('submit', async e => {
  e.preventDefault(); const form = e.currentTarget;
  const input = { url: form.elements.url.value, title: form.elements.title.value,
    description: form.elements.description.value, notes: form.elements.notes.value,
    tags: form.elements.tags.value.split(',').map(t => t.trim()).filter(Boolean),
    collectionId: form.elements.collectionId.value || null, status: form.elements.status.value };
  try {
    await api('/api/bookmarks' + (state.editId ? '/' + encodeURIComponent(state.editId) : ''), {
      method: state.editId ? 'PATCH' : 'POST', body: JSON.stringify(input)
    });
    $('bookmark-dialog').close(); await refresh(); notify(state.editId ? 'Bookmark updated' : 'Bookmark saved');
  } catch (err) { notify(err.message); }
});
$('collection-form').addEventListener('submit', async e => {
  e.preventDefault();
  try {
    await api('/api/collections' + (state.collectionEditId ? '/' + encodeURIComponent(state.collectionEditId) : ''), {
      method: state.collectionEditId ? 'PATCH' : 'POST', body: JSON.stringify({ name: e.currentTarget.elements.name.value })
    });
    $('collection-dialog').close(); await refresh(); notify('Collection saved');
  } catch (err) { notify(err.message); }
});
$('delete-collection').addEventListener('click', async () => {
  const id = state.collectionEditId;
  if (!id || !confirm('Delete this collection? Its bookmarks will move to the inbox.')) return;
  try {
    await api('/api/collections/' + encodeURIComponent(id), { method: 'DELETE' });
    if (state.view === 'c:' + id) state.view = 'all';
    $('collection-dialog').close(); await refresh(); notify('Collection deleted; bookmarks preserved');
  } catch (err) { notify(err.message); }
});
$('import-button').addEventListener('click', () => $('file-import').click());
$('file-import').addEventListener('change', e => importFile(e.target.files?.[0]));
$('export-json').addEventListener('click', () => { download('/api/export', 'goreecloud-bookmarks.json'); document.querySelector('.export-dropdown').open = false; });
$('export-html').addEventListener('click', () => { download('/api/export/html', 'goreecloud-bookmarks.html'); document.querySelector('.export-dropdown').open = false; });
$('mobile-collections').addEventListener('change', e => setView(e.target.value));
$('unlock-form').addEventListener('submit', async e => {
  e.preventDefault();
  const master = $('auth-token').value.trim();
  // Operator credential is used once to obtain a revocable, time-limited session.
  // Do not save the operator secret in sessionStorage, localStorage or a cookie.
  const priorSession = auth;
  sessionEpoch++; auth = '';
  sessionStorage.removeItem('gcb-session');
  revokeServerSession(priorSession);
  const epoch = sessionEpoch;
  let issuedToken = '';
  try {
    const res = await fetch('/api/auth/session', {
      method: 'POST', headers: { Authorization: 'Bearer ' + master }, cache: 'no-store'
    });
    const response = await res.json();
    if (res.ok && /^gcb1_[A-Za-z0-9_-]{43}$/.test(response.token || '')) issuedToken = response.token;
    // If locked during issuance, revoke any session that arrived too late.
    if (epoch !== sessionEpoch) { revokeServerSession(issuedToken); return; }
    if (!res.ok) throw Error(response.error || 'Could not unlock workspace');
    if (!issuedToken) throw Error('Invalid server session response');
    auth = issuedToken;
    const loaded = await refresh();
    if (!loaded || !sessionIsCurrent(epoch, issuedToken)) {
      revokeServerSession(issuedToken);
      return;
    }
    sessionStorage.setItem('gcb-session', issuedToken);
    $('unlock-error').textContent = ''; $('auth-token').value = ''; $('unlock-dialog').close();
  } catch (err) {
    revokeServerSession(issuedToken);
    if (epoch === sessionEpoch) {
      auth = ''; sessionStorage.removeItem('gcb-session');
      $('unlock-error').textContent = err.message;
    } else if (err.message === 'Access token was rejected') {
      $('unlock-error').textContent = err.message;
    }
  }
});
if (auth) refresh().catch(err => notify(err.message)); else $('unlock-dialog').showModal();
