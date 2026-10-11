import { prisma } from "@linkwarden/prisma";
import type { Backup } from "@linkwarden/types/global";
import { createFolder } from "@linkwarden/filesystem";
import { hasPassedLimit } from "@linkwarden/lib/verifyCapacity";
import { normalizeImportedBookmarkUrl } from "./importSafety";

function validBackupShape(input: unknown): input is Backup {
  if (!input || typeof input !== "object") return false;
  const backup = input as Partial<Backup>;
  return (
    Array.isArray(backup.collections) &&
    (backup.pinnedLinks === undefined || Array.isArray(backup.pinnedLinks)) &&
    backup.collections.every(
      (c) =>
        c &&
        typeof c.name === "string" &&
        Array.isArray(c.links) &&
        c.links.every(
          (link) =>
            link &&
            Array.isArray(link.tags) &&
            link.tags.every((tag) => tag && typeof tag.name === "string")
        )
    )
  );
}

function validImportDate(input: unknown): Date | undefined {
  if (
    typeof input !== "string" &&
    typeof input !== "number" &&
    !(input instanceof Date)
  )
    return undefined;
  const date = new Date(input);
  return Number.isFinite(date.getTime()) ? date : undefined;
}

export default async function importFromLinkwarden(
  userId: number,
  rawData: string
) {
  let input: unknown;
  try {
    input = JSON.parse(rawData);
  } catch {
    return { response: "Invalid bookmark backup JSON.", status: 400 };
  }
  if (!validBackupShape(input)) {
    return { response: "Invalid bookmark backup structure.", status: 400 };
  }
  const backup = input as Backup;
  const imported = backup.collections.flatMap((c) =>
    c.links.filter(
      (link) =>
        link.url === null ||
        link.url === undefined ||
        normalizeImportedBookmarkUrl(link.url) !== null
    )
  );
  const hasTooManyLinks = await hasPassedLimit(userId, imported.length);
  if (hasTooManyLinks) {
    return {
      response:
        "Your subscription has reached the maximum number of links allowed.",
      status: 400,
    };
  }

  const pinnedUrls = new Set(
    (backup.pinnedLinks ?? [])
      .map((link) => normalizeImportedBookmarkUrl(link.url))
      .filter((url): url is string => url !== null)
  );
  let collectionIds: number[];
  try {
    collectionIds = await prisma.$transaction(
      async (tx) => {
        const ids: number[] = [];
        for (const collection of backup.collections) {
          const created = await tx.collection.create({
            data: {
              owner: { connect: { id: userId } },
              createdBy: { connect: { id: userId } },
              name:
                collection.name.trim().slice(0, 254) || "Untitled Collection",
              description: collection.description?.trim().slice(0, 254) || "",
              color: collection.color?.trim().slice(0, 50) || undefined,
            },
          });
          ids.push(created.id);
          for (const link of collection.links) {
            const url = link.url
              ? normalizeImportedBookmarkUrl(link.url)
              : null;
            if (link.url && !url) continue;
            const tagNames = Array.from(
              new Set(
                link.tags
                  .map((tag) => tag.name.trim().slice(0, 49))
                  .filter(Boolean)
              )
            );
            const importedAt =
              validImportDate(link.importDate) ??
              validImportDate(link.createdAt);
            await tx.link.create({
              data: {
                url,
                name: link.name?.trim().slice(0, 254) || "",
                description: link.description?.trim().slice(0, 254) || "",
                importDate: importedAt,
                collection: { connect: { id: created.id } },
                createdBy: { connect: { id: userId } },
                pinnedBy:
                  url && pinnedUrls.has(url)
                    ? { connect: { id: userId } }
                    : undefined,
                tags: tagNames.length
                  ? {
                      connectOrCreate: tagNames.map((name) => ({
                        where: { name_ownerId: { name, ownerId: userId } },
                        create: { name, owner: { connect: { id: userId } } },
                      })),
                    }
                  : undefined,
              },
            });
          }
        }
        return ids;
      },
      { timeout: 30000 }
    );
  } catch {
    // The database transaction was rejected and rolled back.
    return {
      response: "Bookmark backup import failed; no changes were saved.",
      status: 500,
    };
  }
  try {
    // Filesystem changes happen only after a successful database commit.
    for (const id of collectionIds) {
      await createFolder({ filePath: `archives/${id}` });
    }
  } catch {
    return {
      response: "Bookmarks saved, but archive directories need repair.",
      status: 500,
    };
  }
  return { response: "Success.", status: 200 };
}
