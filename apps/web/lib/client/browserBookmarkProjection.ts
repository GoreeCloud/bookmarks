// Minimal Bookmarks-owned read model for a future authenticated Browser adapter.
// This pure projection does not authorize access or perform network requests.
export type AuthorizedBrowserLink = {
  id: number;
  collectionId: number;
  name: string | null;
  url: string | null;
  tags?: ReadonlyArray<{ name: string }> | null;
};

export type BrowserBookmarkProjection = {
  id: string;
  kind: "page";
  parentId: string;
  title: string;
  url: string;
  tags: string[];
};

const MAX_BROWSER_BOOKMARK_URL_LENGTH = 8192;

export function projectAuthorizedLinkForBrowser(
  link: AuthorizedBrowserLink,
  accessibleCollectionIds: ReadonlySet<number>
): BrowserBookmarkProjection | null {
  if (
    !Number.isSafeInteger(link.id) ||
    link.id <= 0 ||
    !Number.isSafeInteger(link.collectionId) ||
    link.collectionId <= 0 ||
    !accessibleCollectionIds.has(link.collectionId) ||
    !link.url
  ) {
    return null;
  }
  const url = link.url.trim();
  if (!url || url.length > MAX_BROWSER_BOOKMARK_URL_LENGTH) return null;
  if (/[\u0000-\u001f\u007f]/.test(url)) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (
    !["http:", "https:"].includes(parsed.protocol) ||
    !parsed.hostname ||
    parsed.username ||
    parsed.password
  ) {
    return null;
  }

  const title = (link.name ?? "").trim().slice(0, 512) || parsed.hostname;
  const tags = Array.from(
    new Set(
      (link.tags ?? [])
        .map((tag) => tag.name.trim())
        .filter((name) => name.length > 0 && name.length <= 128)
    )
  ).slice(0, 32);

  return {
    id: `link:${link.id}`,
    kind: "page",
    parentId: `collection:${link.collectionId}`,
    title,
    url,
    tags,
  };
}
