import { beforeEach, describe, expect, it, vi } from "vitest";

const stubs = vi.hoisted(() => ({
  createLink: vi.fn(async (_input: unknown) => ({})),
  findCollection: vi.fn(async () => ({ id: 71 })),
  createCollection: vi.fn(async () => ({ id: 71 })),
  quota: vi.fn(async (_user: number, _count: number) => false),
}));
vi.mock("@linkwarden/prisma", () => ({
  prisma: {
    link: { create: stubs.createLink },
    collection: {
      findFirst: stubs.findCollection,
      create: stubs.createCollection,
    },
  },
}));
vi.mock("@linkwarden/filesystem", () => ({ createFolder: vi.fn() }));
vi.mock("@linkwarden/lib/verifyCapacity", () => ({
  hasPassedLimit: stubs.quota,
}));

import importFromHTMLFile from "./importFromHTMLFile";
import { renderNetscapeBookmarks } from "./renderNetscapeBookmarks";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("HTML import rejects unsafe links before storage", () => {
  it("only stores safe web links and excludes unsafe links from capacity checks", async () => {
    const html = `<DL><DT><A HREF="javascript:alert(1)">Bad</A>
<DT><A HREF="file:///etc/passwd">Local</A>
<DT><A HREF="https://reader:secret@example.org">Credentials</A>
<DT><A HREF="https://example.org/good">Good</A></DL>`;
    expect(await importFromHTMLFile(17, html)).toEqual({
      response: "Success.",
      status: 200,
    });
    expect(stubs.quota).toHaveBeenCalledWith(17, 1);
    expect(stubs.createLink).toHaveBeenCalledTimes(1);
    expect(stubs.createLink.mock.calls[0][0]).toMatchObject({
      data: { url: "https://example.org/good", createdById: 17 },
    });
  });

  it("ignores impossible timestamps without aborting valid bookmarks", async () => {
    const html = `<DL><DT><A HREF="https://example.org/a" ADD_DATE="999999999999">One</A>
<DT><A HREF="https://example.org/b" ADD_DATE="1700000000">Two</A></DL>`;
    expect((await importFromHTMLFile(17, html)).status).toBe(200);
    expect(stubs.createLink).toHaveBeenCalledTimes(2);
    const first = stubs.createLink.mock.calls[0][0] as {
      data: { importDate?: Date };
    };
    const second = stubs.createLink.mock.calls[1][0] as {
      data: { importDate?: Date };
    };
    expect(first.data.importDate).toBeUndefined();
    expect(second.data.importDate?.toISOString()).toBe(
      "2023-11-14T22:13:20.000Z"
    );
  });

  it("rejects non-string and empty payloads without creating collections", async () => {
    expect((await importFromHTMLFile(17, "")).status).toBe(400);
    expect((await importFromHTMLFile(17, {} as string)).status).toBe(400);
    expect(stubs.createCollection).not.toHaveBeenCalled();
    expect(stubs.createLink).not.toHaveBeenCalled();
  });
  it("imports HTML rendered from an owned bookmark backup with folder, tag and date", async () => {
    const html = renderNetscapeBookmarks({
      collections: [{
        name: "Research & Design",
        links: [{
          name: "Design < Patterns",
          url: "https://example.org/read?a=1&b=2",
          description: "Useful & private",
          createdAt: "2023-11-14T22:13:20Z",
          tags: [{ name: "design" }, { name: "reference" }],
        }],
      }],
    });
    expect(await importFromHTMLFile(17, html)).toEqual({
      response: "Success.",
      status: 200,
    });
    expect(stubs.quota).toHaveBeenCalledWith(17, 1);
    expect(stubs.findCollection).toHaveBeenCalledWith({
      where: { parentId: undefined, name: "Research & Design", ownerId: 17 },
    });
    expect(stubs.createLink).toHaveBeenCalledTimes(1);
    expect(stubs.createLink.mock.calls[0][0]).toMatchObject({
      data: {
        createdById: 17,
        collectionId: 71,
        url: "https://example.org/read?a=1&b=2",
        name: "Design < Patterns",
        description: "Useful & private",
        importDate: new Date("2023-11-14T22:13:20Z"),
      },
    });
  });

});
