/** Only persisted, unique IDs in the current view can be bulk-selected. */
export function selectableBookmarkIds(
  ids: Array<number | null | undefined>
): number[] {
  const seen = new Set<number>();
  const result: number[] = [];

  for (const id of ids) {
    if (typeof id !== "number" || !Number.isSafeInteger(id) || id <= 0) {
      continue;
    }
    if (!seen.has(id)) {
      seen.add(id);
      result.push(id);
    }
  }

  return result;
}

export function selectedVisibleBookmarkIds(
  visibleIds: Array<number | null | undefined>,
  selectedIds: Record<number, true>
): number[] {
  return selectableBookmarkIds(visibleIds).filter(
    (id) => selectedIds[id] === true
  );
}
