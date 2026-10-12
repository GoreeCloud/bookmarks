import { normalizeImportedBookmarkUrl } from "./importSafety";

type Bookmark = {
  name?: string | null;
  url: string | null;
  description?: string | null;
  importDate?: Date | string | null;
  createdAt?: Date | string | null;
  tags?: readonly { name: string }[];
};
type Collection = { name: string; links: readonly Bookmark[] };

const escapeMarkup = (text: string): string => text
  .replace(/&/g, "&amp;").replace(/</g, "&lt;")
  .replace(/>/g, "&gt;").replace(/"/g, "&quot;")
  .replace(/'/g, "&#39;")
  .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "");

function addDateAttribute(link: Bookmark): string {
  const value = link.importDate ?? link.createdAt;
  if (!value) return "";
  const ms = new Date(value).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "";
  const seconds = Math.floor(ms / 1000);
  return Number.isSafeInteger(seconds) ? ` ADD_DATE="${seconds}"` : "";
}

/** Netscape HTML rendition of the authenticated owned-collection projection. */
export function renderNetscapeBookmarks(backup: {
  collections: readonly Collection[];
}): string {
  const lines = [
    "<!DOCTYPE NETSCAPE-Bookmark-file-1>",
    '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">',
    "<TITLE>GoreeCloud Bookmarks</TITLE>",
    "<H1>GoreeCloud Bookmarks</H1>",
    "<DL><p>",
  ];
  for (const collection of backup.collections) {
    lines.push(`<DT><H3>${escapeMarkup(collection.name)}</H3>`, "<DL><p>");
    for (const link of collection.links) {
      const url = normalizeImportedBookmarkUrl(link.url);
      if (!url) continue;
      const tagNames = (link.tags ?? [])
        .map(({ name }) => name.trim().replace(/,/g, " "))
        .filter(Boolean);
      const tagAttribute = tagNames.length
        ? ` TAGS="${escapeMarkup(tagNames.join(","))}"` : "";
      lines.push(`<DT><A HREF="${escapeMarkup(url)}"${addDateAttribute(link)}${tagAttribute}>${escapeMarkup(link.name || url)}</A>`);
      if (link.description) lines.push(`<DD>${escapeMarkup(link.description)}`);
    }
    lines.push("</DL><p>");
  }
  lines.push("</DL><p>", "");
  return lines.join("\n");
}
