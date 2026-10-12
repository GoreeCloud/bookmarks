import { beforeEach, describe, expect, it, vi } from "vitest";

const stubs = vi.hoisted(() => {
  const collectionCreate = vi.fn(async () => ({ id: 71 }));
  const linkCreate = vi.fn(async (_input: unknown) => ({ id: 82 }));
  const quota = vi.fn(async () => false);
  const repairFolders = vi.fn(async (_owner: number, _ids: number[]) => ({ status: "complete", ensured: 1, failedIds: [] as number[] }));
  const transaction = vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
    fn({
      collection: { create: collectionCreate },
      link: { create: linkCreate },
    })
  );
  return { collectionCreate, linkCreate, transaction, quota, repairFolders };
});
vi.mock("@linkwarden/prisma", () => ({
  prisma: { $transaction: stubs.transaction },
}));
vi.mock("./ensureOwnedArchiveFolders", () => ({
  ensureOwnedArchiveFolders: stubs.repairFolders,
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
    expect(stubs.repairFolders).toHaveBeenCalledWith(17, [71]);
  });

  it("rejects malformed backups without database or filesystem changes", async () => {
    for (const input of ["{", "null", "{}", '{"collections":[{"name":4}]}']) {
      expect((await importFromLinkwarden(17, input)).status).toBe(400);
    }
    expect(stubs.transaction).not.toHaveBeenCalled();
    expect(stubs.repairFolders).not.toHaveBeenCalled();
  });

  it("rejects incompatible legacy backup field types before quota or writes", async () => {
    const invalid = [
      { collections: [{ name: "A", description: 123, links: [] }] },
      { collections: [{ name: "A", color: {}, links: [] }] },
      { collections: [{ name: "A", links: [{ name: 42, tags: [] }] }] },
      { collections: [{ name: "A", links: [{ url: "https://example.org", description: 22, tags: [] }] }] },
      { collections: [{ name: "A", links: [{ url: {}, tags: [] }] }] },
      { collections: [{ name: "A", links: [{ url: null, tags: [{ name: false }] }] }] },
      { collections: [], pinnedLinks: [null] },
      { collections: [], pinnedLinks: [{ url: {} }] },
      { collections: [], pinnedLinks: ["not-a-pin"] },
    ];
    for (const backup of invalid) {
      expect(await importFromLinkwarden(17, JSON.stringify(backup))).toEqual({
        response: "Invalid bookmark backup structure.",
        status: 400,
      });
    }
    expect(stubs.quota).not.toHaveBeenCalled();
    expect(stubs.transaction).not.toHaveBeenCalled();
    expect(stubs.repairFolders).not.toHaveBeenCalled();
  });

  it("rejects oversized backup fan-out before quota checks or writes", async () => {
    for (const backup of [
      { collections: Array.from({ length: 2001 }, () => ({ name: "A", links: [] })) },
      { collections: [{ name: "A", links: Array.from({ length: 30001 }, () => ({
        name: "B", url: "https://example.org/", tags: [],
      })) }] },
      { collections: [], pinnedLinks: Array.from({ length: 30001 }, () => ({
        url: "https://example.org/",
      })) },
    ]) {
      expect((await importFromLinkwarden(17, JSON.stringify(backup))).status).toBe(413);
    }
    expect(stubs.quota).not.toHaveBeenCalled();
    expect(stubs.transaction).not.toHaveBeenCalled();
    expect(stubs.repairFolders).not.toHaveBeenCalled();
  });

  it("reports a failed transaction without claiming success or creating folders", async () => {
    stubs.transaction.mockRejectedValueOnce(new Error("constraint rejected"));
    expect(await importFromLinkwarden(17, JSON.stringify(validBackup))).toEqual(
      {
        response: "Bookmark backup import failed; no changes were saved.",
        status: 500,
      }
    );
    expect(stubs.repairFolders).not.toHaveBeenCalled();
  });

  it("rejects quota violations before any transaction", async () => {
    stubs.quota.mockResolvedValueOnce(true);
    expect(
      (await importFromLinkwarden(17, JSON.stringify(validBackup))).status
    ).toBe(400);
    expect(stubs.transaction).not.toHaveBeenCalled();
  });

  it("reports archive setup failures separately from already committed links", async () => {
    stubs.repairFolders.mockResolvedValueOnce({ status: "partial", ensured: 0, failedIds: [71] });
    expect(await importFromLinkwarden(17, JSON.stringify(validBackup))).toEqual(
      {
        response: "Bookmarks saved, but archive directories need repair.",
        status: 500,
      }
    );
    expect(stubs.transaction).toHaveBeenCalledTimes(1);
  });
});
