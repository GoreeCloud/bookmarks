import { prisma } from "@linkwarden/prisma";
import type { Backup } from "@linkwarden/types/global";
import { ensureOwnedArchiveFolders } from "./ensureOwnedArchiveFolders";
import { hasPassedLimit } from "@linkwarden/lib/verifyCapacity";
import { normalizeImportedBookmarkUrl } from "./importSafety";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const optionalText = (value: unknown): boolean =>
  value === null || value === undefined || typeof value === "string";

function validBackupShape(input: unknown): input is Backup {
  if (!isRecord(input) || !Array.isArray(input.collections) ||
      (input.pinnedLinks !== undefined && !Array.isArray(input.pinnedLinks))) {
    return false;
  }
  if (Array.isArray(input.pinnedLinks) && input.pinnedLinks.some((pin: unknown) =>
    !isRecord(pin) || !optionalText(pin.url))) {
    return false;
  }
  return input.collections.every((collection: unknown) =>
    isRecord(collection) &&
    typeof collection.name === "string" &&
    optionalText(collection.description) &&
    optionalText(collection.color) &&
    Array.isArray(collection.links) &&
    collection.links.every((link: unknown) =>
      isRecord(link) &&
      optionalText(link.url) &&
      optionalText(link.name) &&
      optionalText(link.description) &&
      Array.isArray(link.tags) &&
      link.tags.every((tag: unknown) =>
        isRecord(tag) && typeof tag.name === "string")
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
    // Database changes are already committed. Verify ownership before
    // creating any archive directories; repeated repair is idempotent.
    const repair = await ensureOwnedArchiveFolders(userId, collectionIds);
    if (repair.status !== "complete") {
      return {
        response: "Bookmarks saved, but archive directories need repair.",
        status: 500,
      };
    }
  } catch {
    return {
      response: "Bookmarks saved, but archive directories need repair.",
      status: 500,
    };
  }
  return { response: "Success.", status: 200 };
}
