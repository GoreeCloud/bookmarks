import { describe, expect, it } from "vitest";
import {
  MAX_IMPORTED_URL_LENGTH,
  normalizeImportedBookmarkUrl,
  parseImportedBookmarkDate,
} from "./importSafety";

describe("HTML bookmark import safety", () => {
  it("retains legitimate HTTP(S) bookmarks without rewriting paths or queries", () => {
    expect(normalizeImportedBookmarkUrl(" https://example.org/a?q=1&b=2 ")).toBe(
      "https://example.org/a?q=1&b=2"
    );
    expect(normalizeImportedBookmarkUrl("http://example.org/")).toBe("http://example.org/");
  });

  it("rejects scripts, local files, embedded credentials, malformed values and controls", () => {
    for (const url of [
      "javascript:alert(1)",
      "data:text/html,hi",
      "file:///etc/passwd",
      "about:blank",
      "ftp://example.org/x",
      "https://u:p@example.org/private",
      "https://",
      "relative/path",
      "https://example.org/\nnext",
      "https://example.org/\tpath",
      "https://example.org/" + "x".repeat(MAX_IMPORTED_URL_LENGTH),
    ]) {
      expect(normalizeImportedBookmarkUrl(url)).toBeNull();
    }
    expect(normalizeImportedBookmarkUrl(null)).toBeNull();
    expect(normalizeImportedBookmarkUrl(undefined)).toBeNull();
  });

  it("parses valid Netscape seconds timestamps and ignores bad dates", () => {
    expect(parseImportedBookmarkDate("1700000000")?.toISOString()).toBe(
      "2023-11-14T22:13:20.000Z"
    );
    expect(parseImportedBookmarkDate("0")?.getTime()).toBe(0);
    for (const input of ["-1", "1e9", "1700000000.5", "abc", "", "999999999999",
      "253402300800", "1234567890123"]) {
      expect(parseImportedBookmarkDate(input)).toBeUndefined();
    }
    expect(parseImportedBookmarkDate(null)).toBeUndefined();
    expect(parseImportedBookmarkDate(undefined)).toBeUndefined();
  });
});
