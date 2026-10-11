import { prisma } from "@linkwarden/prisma";
import { createFolder } from "@linkwarden/filesystem";

export type ArchiveRecoveryResult = {
  status: "complete" | "partial" | "invalid" | "not-owned";
  ensured: number;
  failedIds: number[];
};

// Internal-only. Caller must supply an authenticated user ID, never a
// client-controlled identity. No delete, move, or arbitrary file path.
export async function ensureOwnedArchiveFolders(
  userId: number,
  collectionIds: readonly number[]
): Promise<ArchiveRecoveryResult> {
  if (!Number.isSafeInteger(userId) || userId <= 0 ||
      !Array.isArray(collectionIds) || collectionIds.length > 10000 ||
      collectionIds.some((id) => !Number.isSafeInteger(id) || id <= 0)) {
    return { status: "invalid", ensured: 0, failedIds: [] };
  }
  const ids = Array.from(new Set(collectionIds)).sort((a, b) => a - b);
  if (!ids.length) return { status: "complete", ensured: 0, failedIds: [] };

  // Validate ALL ownership before creating ANY directories. Batching
  // avoids an unbounded SQL IN list while retaining all-or-nothing authz.
  const authorized = new Set<number>();
  for (let start = 0; start < ids.length; start += 100) {
    const batch = ids.slice(start, start + 100);
    const rows = await prisma.collection.findMany({
      where: { ownerId: userId, id: { in: batch } },
      select: { id: true },
    });
    for (const row of rows) authorized.add(row.id);
  }
  if (authorized.size !== ids.length || ids.some((id) => !authorized.has(id))) {
    return { status: "not-owned", ensured: 0, failedIds: [] };
  }

  const failedIds: number[] = [];
  let ensured = 0;
  for (const id of ids) {
    try {
      // Validated positive integer IDs make path segments non-traversable.
      // mkdir recursive is idempotent; object-storage folders are implicit.
      await createFolder({ filePath: `archives/${id}` });
      ensured++;
    } catch {
      failedIds.push(id);
    }
  }
  return {
    status: failedIds.length ? "partial" : "complete",
    ensured,
    failedIds,
  };
}
