import { randomUUID } from 'node:crypto';

export class AppError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const text = (value, max, field) => {
  if (typeof value !== 'string' || value.length > max) throw new AppError(400, `Invalid ${field}`);
  return value.trim();
};
export function cleanUrl(value) {
  if (typeof value !== 'string' || value.length > 4096) throw new AppError(400, 'Invalid URL');
  let url;
  try { url = new URL(value.trim()); } catch { throw new AppError(400, 'Enter a valid HTTP or HTTPS URL'); }
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.hostname.length > 253) {
    throw new AppError(400, 'Only HTTP and HTTPS links are allowed');
  }
  url.username = '';
  url.password = '';
  for (const key of [...url.searchParams.keys()]) {
    if (/^utm_/i.test(key) || ['fbclid', 'gclid', 'dclid', 'msclkid', 'igshid', 'mc_cid', 'mc_eid'].includes(key.toLowerCase())) {
      url.searchParams.delete(key);
    }
  }
  return url.toString();
}
export const dedupeKey = url => cleanUrl(url).replace(/#.*$/, '');
export function makeCollection(input, current) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new AppError(400, 'Invalid collection');
  const name = text(input.name ?? current?.name, 80, 'collection name');
  if (!name) throw new AppError(400, 'Collection name is required');
  return { id: current?.id || randomUUID(), name, createdAt: current?.createdAt || new Date().toISOString() };
}
export function makeBookmark(input, current, collections = []) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new AppError(400, 'Invalid bookmark');
  const url = cleanUrl(input.url ?? current?.url);
  const title = text(input.title ?? current?.title ?? '', 200, 'title') || new URL(url).hostname;
  const description = text(input.description ?? current?.description ?? '', 1200, 'description');
  const notes = text(input.notes ?? current?.notes ?? '', 8000, 'notes');
  const rawTags = input.tags ?? current?.tags ?? [];
  if (!Array.isArray(rawTags) || rawTags.length > 16) throw new AppError(400, 'Invalid tags');
  const tags = [...new Set(rawTags.map(t => text(t, 32, 'tag').toLowerCase()).filter(Boolean))];
  const collectionId = input.collectionId === undefined ? (current?.collectionId ?? null) : (input.collectionId || null);
  if (collectionId !== null && !collections.some(c => c.id === collectionId)) throw new AppError(400, 'Collection not found');
  const status = input.status ?? current?.status ?? 'unread';
  if (!['unread', 'reading', 'read'].includes(status)) throw new AppError(400, 'Invalid reading status');
  const favorite = input.favorite ?? current?.favorite ?? false;
  if (typeof favorite !== 'boolean') throw new AppError(400, 'Invalid favorite');
  const pinned = input.pinned ?? current?.pinned ?? false;
  if (typeof pinned !== 'boolean') throw new AppError(400, 'Invalid pinned');
  const trashedAt = input.trashedAt === undefined ? (current?.trashedAt ?? null) : input.trashedAt;
  if (trashedAt !== null && (typeof trashedAt !== 'string' || Number.isNaN(Date.parse(trashedAt)))) {
    throw new AppError(400, 'Invalid trash date');
  }
  const now = new Date().toISOString();
  return { id: current?.id || randomUUID(), url, title, description, notes, tags, collectionId,
    status, favorite, pinned, trashedAt, createdAt: current?.createdAt || now, updatedAt: now };
}
/** Bounded, permission-scoped metadata search for API clients. Does not fetch remote URLs. */
export function searchBookmarks(library, params = new URLSearchParams()) {
  const allowed = new Set(['q', 'collectionId', 'tag', 'status', 'favorite', 'pinned', 'trash', 'sort', 'limit', 'offset']);
  for (const key of params.keys()) if (!allowed.has(key)) throw new AppError(400, 'Unknown search filter: ' + key);
  for (const key of allowed) if (params.getAll(key).length > 1) throw new AppError(400, 'Duplicate search filter: ' + key);
  const q = params.get('q') ?? '';
  const tag = params.get('tag') ?? '';
  const collectionId = params.get('collectionId') ?? '';
  const status = params.get('status') ?? '';
  const sort = params.get('sort') ?? 'newest';
  if (q.length > 200 || tag.length > 32 || collectionId.length > 128) throw new AppError(400, 'Search filter is too long');
  if (status && !['unread', 'reading', 'read'].includes(status)) throw new AppError(400, 'Invalid status filter');
  if (!['newest', 'oldest', 'title'].includes(sort)) throw new AppError(400, 'Invalid sort');
  const booleanFilter = key => {
    const value = params.get(key);
    if (value === null) return null;
    if (!['true', 'false'].includes(value)) throw new AppError(400, 'Invalid ' + key + ' filter');
    return value === 'true';
  };
  const favorite = booleanFilter('favorite');
  const pinned = booleanFilter('pinned');
  const trash = booleanFilter('trash') ?? false;
  const numberFilter = (key, fallback, maximum, zeroAllowed = false) => {
    const value = params.get(key);
    if (value === null) return fallback;
    if (!/^(0|[1-9][0-9]*)$/.test(value)) throw new AppError(400, 'Invalid ' + key);
    const number = Number(value);
    if (!Number.isSafeInteger(number) || number > maximum || (!zeroAllowed && number === 0)) throw new AppError(400, 'Invalid ' + key);
    return number;
  };
  const limit = numberFilter('limit', 30, 100);
  const offset = numberFilter('offset', 0, 1_000_000, true);
  const needle = q.trim().toLocaleLowerCase();
  const exactTag = tag.trim().toLocaleLowerCase();
  const found = library.bookmarks.filter(bookmark => {
    if (Boolean(bookmark.trashedAt) !== trash) return false;
    if (collectionId && (collectionId === 'none' ? bookmark.collectionId !== null : bookmark.collectionId !== collectionId)) return false;
    if (exactTag && !bookmark.tags.includes(exactTag)) return false;
    if (status && bookmark.status !== status) return false;
    if (favorite !== null && bookmark.favorite !== favorite) return false;
    if (pinned !== null && bookmark.pinned !== pinned) return false;
    if (!needle) return true;
    return [bookmark.title, bookmark.url, bookmark.description, bookmark.notes, ...bookmark.tags]
      .join(' ').toLocaleLowerCase().includes(needle);
  });
  found.sort((a, b) => sort === 'title' ? a.title.localeCompare(b.title) || a.id.localeCompare(b.id) :
    sort === 'oldest' ? a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id) :
      Number(b.pinned) - Number(a.pinned) || b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id));
  return { items: found.slice(offset, offset + limit), total: found.length, limit, offset };
}

export function exportHtml(items) {
  const esc = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;').replaceAll('"', '&quot;');
  const entries = items.filter(x => !x.trashedAt)
    .map(x => `    <DT><A HREF="${esc(x.url)}">${esc(x.title)}</A>`).join('\n');
  return '<!DOCTYPE NETSCAPE-Bookmark-file-1>\n<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">\n' +
    '<TITLE>GoreeCloud Bookmarks</TITLE>\n<H1>GoreeCloud Bookmarks</H1>\n<DL><p>\n' + entries + '\n</DL><p>\n';
}
