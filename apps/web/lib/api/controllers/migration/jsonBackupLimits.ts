export const MAX_BACKUP_COLLECTIONS = 2_000;
export const MAX_BACKUP_LINKS = 30_000;
export const MAX_BACKUP_TAG_RELATIONS = 150_000;
export const MAX_BACKUP_PINS = 30_000;

const isRecord = (input: unknown): input is Record<string, unknown> =>
  !!input && typeof input === "object" && !Array.isArray(input);

/** Malformed structures are handled by the existing nested type validator. */
export function getBackupWorkloadError(input: unknown): string | null {
  if (!isRecord(input) || !Array.isArray(input.collections)) return null;
  if (input.collections.length > MAX_BACKUP_COLLECTIONS)
    return "Bookmark backup exceeds the collection count limit.";
  if (Array.isArray(input.pinnedLinks) && input.pinnedLinks.length > MAX_BACKUP_PINS)
    return "Bookmark backup exceeds the pinned-link count limit.";

  let links = 0;
  let tags = 0;
  for (const collection of input.collections) {
    if (!isRecord(collection) || !Array.isArray(collection.links)) continue;
    links += collection.links.length;
    if (links > MAX_BACKUP_LINKS)
      return "Bookmark backup exceeds the link count limit.";
    for (const link of collection.links) {
      if (!isRecord(link) || !Array.isArray(link.tags)) continue;
      tags += link.tags.length;
      if (tags > MAX_BACKUP_TAG_RELATIONS)
        return "Bookmark backup exceeds the tag count limit.";
    }
  }
  return null;
}
