import { describe, expect, it } from "vitest";
import { projectAuthorizedLinkForBrowser } from "./browserBookmarkProjection";

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
