import { prisma } from "@linkwarden/prisma";
import { normalizeImportedBookmarkUrl } from "./importSafety";

/**
 * Portable bookmark backup: no account profile, tokens, subscriptions,
 * collaboration membership, archive paths, notes, or authentication fields.
 * This is accepted by our Linkwarden-compatible collection importer.
 */
export default async function exportData(userId: number) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      collections: {
        orderBy: { id: "asc" },
        select: {
          name: true,
          description: true,
          color: true,
          links: {
            orderBy: { id: "asc" },
            select: {
              name: true,
              description: true,
              url: true,
              createdAt: true,
              importDate: true,
              tags: { select: { name: true } },
            },
          },
        },
      },
      pinnedLinks: { select: { url: true } },
    },
  });

  if (!user) return { response: "User not found.", status: 404 };

  const ownedWebUrls = new Set<string>();
  const collections = user.collections.map((collection) => ({
    name: collection.name,
    description: collection.description,
    color: collection.color,
    links: collection.links.flatMap((link) => {
      const url = link.url === null
        ? null
        : normalizeImportedBookmarkUrl(link.url);
      if (link.url !== null && url === null) return [];
      if (url) ownedWebUrls.add(url);
      return [{
        name: link.name,
        description: link.description,
        url,
        createdAt: link.createdAt,
        importDate: link.importDate,
        tags: link.tags.map((tag) => ({ name: tag.name })),
      }];
    }),
  }));

  // A user can pin a shared collection's link. Do not leak that other
  // collection's content into a backup of collections this user owns.
  const pinnedLinks = Array.from(
    new Set(
      user.pinnedLinks
        .map((link) => link.url === null
          ? null
          : normalizeImportedBookmarkUrl(link.url))
        .filter((url): url is string => url !== null && ownedWebUrls.has(url))
    )
  ).map((url) => ({ url }));

  return {
    response: { formatVersion: 1, collections, pinnedLinks },
    status: 200,
  };
}
