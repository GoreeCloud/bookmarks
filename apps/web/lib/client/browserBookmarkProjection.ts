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

export type BrowserBookmarkReadPage = {
  links: BrowserBookmarkProjection[];
  nextAfter: number | null;
};

// Projection after an authenticated query has already scoped rows to the
// caller's permitted collections. Never treat a client-supplied collection
// set as authorization; this helper intentionally performs no I/O.
export function projectAuthorizedBrowserPage(
  fetched: ReadonlyArray<AuthorizedBrowserLink>,
  accessibleCollectionIds: ReadonlySet<number>,
  after: number,
  limit: number
): BrowserBookmarkReadPage | null {
  if (!Number.isSafeInteger(after) || after < 0 ||
      !Number.isSafeInteger(limit) || limit < 1 || limit > 100 ||
      fetched.length > limit + 1) return null;
  let previousId = after;
  for (const link of fetched) {
    if (!Number.isSafeInteger(link.id) || link.id <= previousId ||
        !accessibleCollectionIds.has(link.collectionId)) return null;
    previousId = link.id;
  }
  const links: BrowserBookmarkProjection[] = [];
  for (const link of fetched.slice(0, limit)) {
    const projected = projectAuthorizedLinkForBrowser(link, accessibleCollectionIds);
    if (!projected) return null;
    links.push(projected);
  }
  return {
    links,
    nextAfter: fetched.length > limit ? fetched[limit - 1].id : null,
  };
}
