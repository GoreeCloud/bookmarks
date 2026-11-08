import { cleanUrl } from './core.mjs';

function invalid(reason) { throw new Error('Invalid library data: ' + reason); }
function isDate(value) { return typeof value === 'string' && !Number.isNaN(Date.parse(value)); }
function validText(value, limit) { return typeof value === 'string' && value.length <= limit; }
function validId(value) { return typeof value === 'string' && value.length > 0 && value.length <= 128; }

/** Validate stored v1 data without rewriting user content or inventing migrations. */
export function assertLibrary(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data) || data.schema !== 1 ||
      !Array.isArray(data.bookmarks) || !Array.isArray(data.collections)) invalid('unsupported schema');
  const collectionIds = new Set();
  const collectionNames = new Set();
  for (const c of data.collections) {
    if (!c || typeof c !== 'object' || Array.isArray(c) || !validId(c.id) ||
      !validText(c.name, 80) || !c.name.trim() || !isDate(c.createdAt)) invalid('malformed collection');
    const name = c.name.toLocaleLowerCase();
    if (collectionIds.has(c.id) || collectionNames.has(name)) invalid('duplicate collection');
    collectionIds.add(c.id);
    collectionNames.add(name);
  }
  const bookmarkIds = new Set();
  for (const b of data.bookmarks) {
    if (!b || typeof b !== 'object' || Array.isArray(b) || !validId(b.id) ||
      !validText(b.url, 4096) || !validText(b.title, 200) || !validText(b.description, 1200) ||
      !validText(b.notes, 8000) || !Array.isArray(b.tags) || b.tags.length > 16 ||
      b.tags.some(t => !validText(t, 32) || !t.trim()) ||
      !['unread', 'reading', 'read'].includes(b.status) ||
      typeof b.favorite !== 'boolean' || typeof b.pinned !== 'boolean' ||
      (b.trashedAt !== null && !isDate(b.trashedAt)) ||
      !isDate(b.createdAt) || !isDate(b.updatedAt)) invalid('malformed bookmark');
    try { cleanUrl(b.url); } catch { invalid('unsafe bookmark URL'); }
    if (b.collectionId !== null && !collectionIds.has(b.collectionId)) invalid('unknown collection reference');
    if (bookmarkIds.has(b.id)) invalid('duplicate bookmark ID');
    bookmarkIds.add(b.id);
  }
  return data;
}
