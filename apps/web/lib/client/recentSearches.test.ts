import { describe, expect, it } from "vitest";
import {
  RECENT_SEARCHES_KEY,
  addRecentSearch,
  clearRecentSearches,
  loadRecentSearches,
  sanitizeRecentSearches,
  saveRecentSearches,
} from "./recentSearches";

function makeStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
}

describe("private recent searches", () => {
  it("loads legacy entries, trims, deduplicates, and bounds history", () => {
    const values = Array.from({ length: 8 }, (_, i) => ({
      query: ` query-${i} `,
      searchedAt: "2026-10-11T00:00:00.000Z",
    }));
    expect(
      sanitizeRecentSearches([null, {}, values[0], values[0], ...values])
        .map((entry) => entry.query)
    ).toEqual(["query-0", "query-1", "query-2", "query-3", "query-4"]);
  });

  it("ignores corrupted and oversized storage values", () => {
    const storage = makeStorage();
    storage.setItem(RECENT_SEARCHES_KEY, "{corrupt");
    expect(loadRecentSearches(storage)).toEqual([]);
    storage.setItem(RECENT_SEARCHES_KEY, JSON.stringify([
      { query: "x".repeat(513) }, { query: "   " },
      { query: " kept " }, { query: 42 },
    ]));
    expect(loadRecentSearches(storage).map((entry) => entry.query)).toEqual(["kept"]);
  });

  it("puts newest searches first and does not create duplicate entries", () => {
    const first = addRecentSearch([], "  alpha  ", "2026-10-11T00:00:00Z");
    const second = addRecentSearch(first, "beta", "2026-10-11T01:00:00Z");
    const third = addRecentSearch(second, "alpha", "2026-10-11T02:00:00Z");
    expect(third.map((entry) => entry.query)).toEqual(["alpha", "beta"]);
    expect(third[0].searchedAt).toBe("2026-10-11T02:00:00Z");
  });

  it("persists and clears without affecting unrelated storage keys", () => {
    const storage = makeStorage();
    storage.setItem("unrelated", "unchanged");
    saveRecentSearches(storage, addRecentSearch([], "privacy"));
    expect(loadRecentSearches(storage)[0].query).toBe("privacy");
    clearRecentSearches(storage);
    expect(loadRecentSearches(storage)).toEqual([]);
    expect(storage.getItem("unrelated")).toBe("unchanged");
  });

  it("does not fail if browser storage is disabled", () => {
    const blocked = {
      getItem: (): string | null => { throw new Error("blocked"); },
      setItem: (): void => { throw new Error("blocked"); },
      removeItem: (): void => { throw new Error("blocked"); },
    };
    expect(loadRecentSearches(blocked)).toEqual([]);
    expect(() => saveRecentSearches(blocked, [])).not.toThrow();
    expect(() => clearRecentSearches(blocked)).not.toThrow();
  });
});
