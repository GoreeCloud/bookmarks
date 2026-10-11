import { beforeEach, describe, expect, it, vi } from "vitest";

const stubs = vi.hoisted(() => {
  const collectionCreate = vi.fn(async () => ({ id: 71 }));
  const linkCreate = vi.fn(async (_input: unknown) => ({ id: 82 }));
  const quota = vi.fn(async () => false);
  const createFolder = vi.fn(async () => undefined);
  const transaction = vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
    fn({
      collection: { create: collectionCreate },
      link: { create: linkCreate },
    })
  );
  return { collectionCreate, linkCreate, transaction, quota, createFolder };
});
vi.mock("@linkwarden/prisma", () => ({
  prisma: { $transaction: stubs.transaction },
}));
vi.mock("@linkwarden/filesystem", () => ({
  createFolder: stubs.createFolder,
}));
vi.mock("@linkwarden/lib/verifyCapacity", () => ({
  hasPassedLimit: stubs.quota,
}));

import importFromLinkwarden from "./importFromLinkwarden";

const validBackup = {
  collections: [
    {
      name: "Reading",
      description: "Saved articles",
      color: "#111111",
      links: [
        {
          name: "A",
          url: "https://example.org/a",
          description: "",
          createdAt: "2025-01-01T00:00:00.000Z",
          tags: [{ name: "reading" }],
        },
        { name: "Script", url: "javascript:alert(1)", tags: [] },
      ],
    },
  ],
  pinnedLinks: [{ url: "https://example.org/a" }],
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Linkwarden-compatible JSON backup import", () => {
  it("persists only safe links and pins inside the same database transaction", async () => {
    await expect(
      importFromLinkwarden(17, JSON.stringify(validBackup))
    ).resolves.toEqual({ response: "Success.", status: 200 });
    expect(stubs.quota).toHaveBeenCalledWith(17, 1);
    expect(stubs.transaction).toHaveBeenCalledTimes(1);
    expect(stubs.collectionCreate).toHaveBeenCalledTimes(1);
    expect(stubs.linkCreate).toHaveBeenCalledTimes(1);
    expect(stubs.linkCreate.mock.calls[0][0]).toMatchObject({
      data: {
        url: "https://example.org/a",
        createdBy: { connect: { id: 17 } },
        pinnedBy: { connect: { id: 17 } },
      },
    });
    expect(stubs.createFolder).toHaveBeenCalledWith({
      filePath: "archives/71",
    });
  });

  it("rejects malformed backups without database or filesystem changes", async () => {
    for (const input of ["{", "null", "{}", '{"collections":[{"name":4}]}']) {
      expect((await importFromLinkwarden(17, input)).status).toBe(400);
    }
    expect(stubs.transaction).not.toHaveBeenCalled();
    expect(stubs.createFolder).not.toHaveBeenCalled();
  });

  it("reports a failed transaction without claiming success or creating folders", async () => {
    stubs.transaction.mockRejectedValueOnce(new Error("constraint rejected"));
    expect(await importFromLinkwarden(17, JSON.stringify(validBackup))).toEqual(
      {
        response: "Bookmark backup import failed; no changes were saved.",
        status: 500,
      }
    );
    expect(stubs.createFolder).not.toHaveBeenCalled();
  });

  it("rejects quota violations before any transaction", async () => {
    stubs.quota.mockResolvedValueOnce(true);
    expect(
      (await importFromLinkwarden(17, JSON.stringify(validBackup))).status
    ).toBe(400);
    expect(stubs.transaction).not.toHaveBeenCalled();
  });

  it("reports archive setup failures separately from already committed links", async () => {
    stubs.createFolder.mockRejectedValueOnce(new Error("storage unavailable"));
    expect(await importFromLinkwarden(17, JSON.stringify(validBackup))).toEqual(
      {
        response: "Bookmarks saved, but archive directories need repair.",
        status: 500,
      }
    );
    expect(stubs.transaction).toHaveBeenCalledTimes(1);
  });
});
