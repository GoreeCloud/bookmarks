import { describe, expect, it } from "vitest";
import safeExternalUrl from "./safeExternalUrl";

describe("safeExternalUrl", () => {
  it("permits ordinary HTTP(S) destinations", () => {
    expect(safeExternalUrl(" https://example.org/a?q=1 ")).toBe(
      "https://example.org/a?q=1"
    );
    expect(safeExternalUrl("http://example.org/")).toBe("http://example.org/");
  });

  it.each([
    null,
    undefined,
    "",
    " ",
    "javascript:alert(1)",
    "data:text/html,unsafe",
    "file:/private/example",
    "mailto:person@example.org",
    "https://person:secret@example.org/",
    "https://example.org/\nnext",
    "https://example.org/\u0000danger",
    "not a URL",
    "https://example.org/" + "a".repeat(8193),
  ])("blocks an unsafe or malformed destination: %s", (candidate) => {
    expect(safeExternalUrl(candidate)).toBeNull();
  });
});
