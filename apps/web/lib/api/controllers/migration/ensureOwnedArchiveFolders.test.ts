import { beforeEach, describe, expect, it, vi } from "vitest";

const stubs = vi.hoisted(() => ({
  findMany: vi.fn(async (query: { where: { id: { in: number[] } } }) =>
    query.where.id.in.map((id) => ({ id }))),
  createFolder: vi.fn(async (_options: { filePath: string }) => undefined),
}));
vi.mock("@linkwarden/prisma", () => ({
  prisma: { collection: { findMany: stubs.findMany } },
}));
vi.mock("@linkwarden/filesystem", () => ({
  createFolder: stubs.createFolder,
}));

import { ensureOwnedArchiveFolders } from "./ensureOwnedArchiveFolders";

beforeEach(() => {
  vi.clearAllMocks();
  stubs.findMany.mockImplementation(async (query) =>
    query.where.id.in.map((id) => ({ id })));
});

describe("owner-scoped archive directory recovery", () => {
  it("treats an empty verified-owner batch as successful no-op", async () => {
    await expect(ensureOwnedArchiveFolders(17, [])).resolves.toEqual({
      status: "complete", ensured: 0, failedIds: [],
    });
    expect(stubs.findMany).not.toHaveBeenCalled();
    expect(stubs.createFolder).not.toHaveBeenCalled();
  });

  it("rejects invalid owner and collection identifiers without side effects", async () => {
    for (const [owner, ids] of [
      [0, [12]], [17, [-1]], [17, [1.2]],
      [17, [Number.MAX_SAFE_INTEGER + 1]], [17, new Array(10001).fill(1)],
    ] as const) {
      expect((await ensureOwnedArchiveFolders(owner, ids)).status).toBe("invalid");
    }
    expect(stubs.findMany).not.toHaveBeenCalled();
    expect(stubs.createFolder).not.toHaveBeenCalled();
  });

  it("deduplicates and sorts IDs with one scoped owner lookup", async () => {
    expect(await ensureOwnedArchiveFolders(17, [9, 2, 9, 4])).toEqual({
      status: "complete", ensured: 3, failedIds: [],
    });
    expect(stubs.findMany).toHaveBeenCalledWith({
      where: { ownerId: 17, id: { in: [2, 4, 9] } },
      select: { id: true },
    });
    expect(stubs.createFolder.mock.calls.map(([input]) => input.filePath))
      .toEqual(["archives/2", "archives/4", "archives/9"]);
  });

  it("checks every owner-scoped batch before any directory is created", async () => {
    const ids = Array.from({ length: 102 }, (_, i) => i + 1);
    stubs.findMany.mockImplementation(async (query) =>
      query.where.id.in.filter((id) => id !== 102).map((id) => ({ id })));
    expect((await ensureOwnedArchiveFolders(17, ids)).status).toBe("not-owned");
    expect(stubs.findMany).toHaveBeenCalledTimes(2);
    expect(stubs.createFolder).not.toHaveBeenCalled();
  });

  it("continues other owned directories and reports only failed ids", async () => {
    stubs.createFolder.mockImplementation(async ({ filePath }) => {
      if (filePath === "archives/3") throw new Error("disk unavailable");
    });
    await expect(ensureOwnedArchiveFolders(17, [2, 3, 4])).resolves.toEqual({
      status: "partial", ensured: 2, failedIds: [3],
    });
    expect(stubs.createFolder).toHaveBeenCalledTimes(3);
  });

  it("fails closed on a database error without filesystem mutations", async () => {
    stubs.findMany.mockRejectedValueOnce(new Error("database unavailable"));
    await expect(ensureOwnedArchiveFolders(17, [3])).rejects.toThrow();
    expect(stubs.createFolder).not.toHaveBeenCalled();
  });
});
