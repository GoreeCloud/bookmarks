import { describe, expect, it } from "vitest";
import { projectAuthorizedLinkForBrowser, projectAuthorizedBrowserPage } from "./browserBookmarkProjection";

const access = new Set([7]);
const link = {
  id: 42,
  collectionId: 7,
  name: "  Reference page  ",
  url: "https://example.org/article?q=one",
  tags: [{ name: "Research" }, { name: "Research" }, { name: "Read later" }],
};

describe("Browser bookmark read projection", () => {
  it("projects bounded fields for a confirmed accessible collection", () => {
    expect(projectAuthorizedLinkForBrowser(link, access)).toEqual({
      id: "link:42",
      kind: "page",
      parentId: "collection:7",
      title: "Reference page",
      url: "https://example.org/article?q=one",
      tags: ["Research", "Read later"],
    });
  });

  it("rejects links outside the caller-authorized collection scope", () => {
    expect(projectAuthorizedLinkForBrowser(link, new Set())).toBeNull();
    expect(projectAuthorizedLinkForBrowser({ ...link, collectionId: -1 }, access)).toBeNull();
    expect(projectAuthorizedLinkForBrowser({ ...link, id: 0 }, access)).toBeNull();
    expect(projectAuthorizedLinkForBrowser({ ...link, id: 1.5 }, access)).toBeNull();
  });

  it("rejects unsafe, malformed, and credential-bearing URLs", () => {
    for (const url of [
      "javascript:alert(1)",
      "file:///etc/passwd",
      "data:text/plain,hello",
      "https://user:secret@example.org/",
      "https://",
      "https://example.org/\nnext",
      "https://example.org/" + "a".repeat(8200),
    ]) {
      expect(projectAuthorizedLinkForBrowser({ ...link, url }, access)).toBeNull();
    }
  });

  it("bounds metadata without projecting unrelated account data", () => {
    const extra = { ...link, name: "N".repeat(700), privateNote: "do not project",
      tags: Array.from({ length: 60 }, (_, i) => ({ name: `tag-${i}` })) };
    const projection = projectAuthorizedLinkForBrowser(extra, access);
    expect(projection?.title.length).toBe(512);
    expect(projection?.tags).toHaveLength(32);
    expect(projection).not.toHaveProperty("privateNote");
  });
});

describe("Browser bookmark cursor projection", () => {
  const rows = [42, 43, 44].map((id) => ({ ...link, id }));

  it("returns bounded ordered results with an exclusive continuation cursor", () => {
    const first = projectAuthorizedBrowserPage(rows, access, 0, 2);
    expect(first?.links.map((item) => item.id)).toEqual(["link:42", "link:43"]);
    expect(first?.nextAfter).toBe(43);
    const last = projectAuthorizedBrowserPage(rows.slice(2), access, 43, 2);
    expect(last?.links.map((item) => item.id)).toEqual(["link:44"]);
    expect(last?.nextAfter).toBeNull();
  });

  it("accepts empty pages and rejects invalid cursor or limit", () => {
    expect(projectAuthorizedBrowserPage([], access, 0, 50)).toEqual({
      links: [], nextAfter: null,
    });
    expect(projectAuthorizedBrowserPage(rows, access, -1, 2)).toBeNull();
    expect(projectAuthorizedBrowserPage(rows, access, 0.3, 2)).toBeNull();
    expect(projectAuthorizedBrowserPage(rows, access, 0, 0)).toBeNull();
    expect(projectAuthorizedBrowserPage(rows, access, 0, 101)).toBeNull();
  });

  it("fails closed on duplicates, unordered IDs, and cursor replay", () => {
    expect(projectAuthorizedBrowserPage([rows[0], rows[0]], access, 0, 2)).toBeNull();
    expect(projectAuthorizedBrowserPage([rows[2], rows[1]], access, 0, 2)).toBeNull();
    expect(projectAuthorizedBrowserPage(rows.slice(0, 2), access, 42, 2)).toBeNull();
  });

  it("rejects unauthorized rows, unsafe URLs and oversized batches", () => {
    expect(projectAuthorizedBrowserPage(rows, new Set([9]), 0, 2)).toBeNull();
    expect(projectAuthorizedBrowserPage([{ ...rows[0], url: "javascript:alert(1)" }],
      access, 0, 2)).toBeNull();
    expect(projectAuthorizedBrowserPage(rows, access, 0, 1)).toBeNull();
    expect(projectAuthorizedBrowserPage([{ ...rows[0], id: 0 }], access, 0, 2)).toBeNull();
  });
});
