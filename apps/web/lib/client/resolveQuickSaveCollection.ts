type Collection = { id: number; name: string; ownerId?: number | null };

export default function resolveQuickSaveCollection(
  pathname: string,
  rawId: string | string[] | undefined,
  collections: readonly Collection[]
): { id?: number; name: string } {
  const fallback = { name: "Unorganized" };
  if (!pathname.startsWith("/collections/") || typeof rawId !== "string") return fallback;

  const id = Number(rawId);
  if (!Number.isSafeInteger(id) || id <= 0) return fallback;

  const collection = collections.find(
    (entry) => entry.id === id && entry.ownerId != null
  );
  return collection ? { id: collection.id, name: collection.name } : fallback;
}
