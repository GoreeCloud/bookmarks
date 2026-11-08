import { AppError, makeBookmark, makeCollection, dedupeKey } from './core.mjs';

/** Apply one validated import batch to a draft library. The caller controls persistence. */
export function importBatch(library, input) {
  if (!input || !Array.isArray(input.bookmarks) || input.bookmarks.length > 500 ||
    (input.collections !== undefined && (!Array.isArray(input.collections) || input.collections.length > 200))) {
    throw new AppError(400, 'Import requires up to 500 bookmarks and 200 collections per batch');
  }

  let imported = 0, skipped = 0, collectionsCreated = 0;
  const mapping = new Map();
  const collectionInput = input.collections || [];
  for (const raw of collectionInput) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) ||
      typeof raw.id !== 'string' || !raw.id.trim() || raw.id.length > 128) {
      throw new AppError(400, 'Invalid imported collection');
    }
    // Duplicate external IDs are ambiguous and must not silently remap existing links.
    if (mapping.has(raw.id)) throw new AppError(400, 'Duplicate imported collection ID');
    const valid = makeCollection({ name: raw.name });
    const existing = library.collections.find(c => c.name.toLowerCase() === valid.name.toLowerCase());
    if (!existing) { library.collections.push(valid); collectionsCreated++; }
    mapping.set(raw.id, (existing || valid).id);
  }
  const seen = new Set(library.bookmarks.filter(b => !b.trashedAt).map(b => dedupeKey(b.url)));
  for (const raw of input.bookmarks) {
    try {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new AppError(400, 'Invalid bookmark');
      if (raw.collectionId && collectionInput.length && !mapping.has(raw.collectionId)) {
        skipped++; continue;
      }
      const item = makeBookmark({ ...raw, collectionId: mapping.get(raw.collectionId) || null }, null, library.collections);
      const key = dedupeKey(item.url);
      if (seen.has(key)) { skipped++; continue; }
      seen.add(key);
      library.bookmarks.unshift(item);
      imported++;
    } catch { skipped++; }
  }
  return input.collections === undefined ? { imported, skipped } : { imported, skipped, collectionsCreated };
}

/**
 * Import a bounded complete file into one draft. Call exactly once inside a
 * store.mutate transaction; callers may use a detached snapshot for preview.
 * Every 500-item chunk is evaluated against the progressively updated draft,
 * including cross-chunk URL duplicates and collection associations. A failure
 * propagates before the caller can persist any of the chunks.
 */
export function importWholeFile(library, input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      !Array.isArray(input.bookmarks) || input.bookmarks.length > 10000 ||
      (input.collections !== undefined &&
        (!Array.isArray(input.collections) || input.collections.length > 200))) {
    throw new AppError(400, 'Whole-file import requires up to 10,000 bookmarks and 200 collections');
  }
  const result = { imported: 0, skipped: 0, collectionsCreated: 0 };
  // Stage everything on a detached draft, including calls from direct API
  // consumers; no partial collection mutations escape when validation fails.
  const draft = structuredClone(library);
  const collections = input.collections;
  for (let i = 0; i < Math.max(1, input.bookmarks.length); i += 500) {
    const batch = importBatch(draft, {
      bookmarks: input.bookmarks.slice(i, i + 500),
      ...(collections === undefined ? {} : { collections })
    });
    result.imported += batch.imported;
    result.skipped += batch.skipped;
    result.collectionsCreated += batch.collectionsCreated || 0;
  }
  library.bookmarks = draft.bookmarks;
  library.collections = draft.collections;
  return result;
}
