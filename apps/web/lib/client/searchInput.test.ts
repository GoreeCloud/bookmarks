import { describe, expect, it } from "vitest";
import {
  appendSearchOperator,
  readRouteSearchQuery,
  removeUnsupportedSearchSymbols,
} from "./searchInput";

describe("search bar input helpers", () => {
  it("keeps already-decoded router values intact", () => {
    expect(readRouteSearchQuery("100% coverage")).toBe("100% coverage");
    expect(readRouteSearchQuery("%20")).toBe("%20");
    expect(readRouteSearchQuery(["first", "second"])).toBe("first");
    expect(readRouteSearchQuery(undefined)).toBe("");
  });

  it("inserts operators without unnecessary spaces", () => {
    expect(appendSearchOperator("", "tag:")).toBe("tag:");
    expect(appendSearchOperator("research", "tag:")).toBe("research tag:");
    expect(appendSearchOperator("research ", "tag:")).toBe("research tag:");
  });

  it("removes every unsupported percent symbol, not only the first", () => {
    expect(removeUnsupportedSearchSymbols("research%20%foo")).toBe("research20foo");
    expect(removeUnsupportedSearchSymbols("plain query")).toBe("plain query");
  });
});
