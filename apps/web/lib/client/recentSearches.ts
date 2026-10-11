/**
 * Local, device-only search history. Invalid or legacy entries are discarded
 * rather than rendering arbitrary data or breaking the search experience.
 */
export const RECENT_SEARCHES_KEY = "recentSearches";
export const MAX_RECENT_SEARCHES = 5;
const MAX_STORED_QUERY_LENGTH = 512;

export type RecentSearch = {
  query: string;
  searchedAt: string;
};

type SearchHistoryStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function sanitizeRecentSearches(value: unknown): RecentSearch[] {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();
  const results: RecentSearch[] = [];

  for (const item of value) {
    if (typeof item?.query !== "string") continue;

    const query = item.query.trim();
    if (!query || query.length > MAX_STORED_QUERY_LENGTH || seen.has(query)) {
      continue;
    }

    seen.add(query);
    results.push({
      query,
      searchedAt:
        typeof item.searchedAt === "string" &&
        Number.isFinite(Date.parse(item.searchedAt))
          ? item.searchedAt
          : "",
    });

    if (results.length === MAX_RECENT_SEARCHES) break;
  }

  return results;
}

export function loadRecentSearches(storage: SearchHistoryStorage): RecentSearch[] {
  try {
    const serialized = storage.getItem(RECENT_SEARCHES_KEY);
    return serialized ? sanitizeRecentSearches(JSON.parse(serialized)) : [];
  } catch {
    // Local storage can be unavailable in privacy modes or blocked by policy.
    return [];
  }
}

export function addRecentSearch(
  existing: RecentSearch[],
  rawQuery: string,
  searchedAt = new Date().toISOString()
): RecentSearch[] {
  const query = rawQuery.trim();
  if (!query || query.length > MAX_STORED_QUERY_LENGTH) return existing;

  return sanitizeRecentSearches([
    { query, searchedAt },
    ...existing.filter((entry) => entry.query !== query),
  ]);
}

export function saveRecentSearches(
  storage: SearchHistoryStorage,
  searches: RecentSearch[]
): void {
  try {
    storage.setItem(
      RECENT_SEARCHES_KEY,
      JSON.stringify(sanitizeRecentSearches(searches))
    );
  } catch {
    // Never prevent a search just because the history cannot be persisted.
  }
}

export function clearRecentSearches(storage: SearchHistoryStorage): void {
  try {
    storage.removeItem(RECENT_SEARCHES_KEY);
  } catch {
    // Clearing the visible history still works when storage is unavailable.
  }
}
