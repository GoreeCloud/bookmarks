/**
 * Validate URLs from untrusted Netscape-style bookmark exports before writing
 * them to the library. A valid URL alone does not authorize server-side fetch.
 */
export const MAX_IMPORTED_URL_LENGTH = 2047;

export function normalizeImportedBookmarkUrl(
  input: string | null | undefined
): string | null {
  if (typeof input !== "string") return null;
  const url = input.trim();
  if (!url || url.length > MAX_IMPORTED_URL_LENGTH ||
      /[\u0000-\u001f\u007f]/.test(url)) {
    return null;
  }
  try {
    const parsed = new URL(url);
    if ((parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
        !parsed.hostname || parsed.username || parsed.password) {
      return null;
    }
    return url;
  } catch {
    return null;
  }
}

/**
 * Netscape bookmark ADD_DATE is seconds since epoch. Ignore invalid or
 * out-of-range input rather than failing an entire multi-bookmark import.
 */
export function parseImportedBookmarkDate(
  input: string | null | undefined
): Date | undefined {
  if (!input || !/^\d{1,12}$/.test(input)) return undefined;
  const seconds = Number(input);
  if (!Number.isSafeInteger(seconds) || seconds > 253402300799)
    return undefined;
  const parsed = new Date(seconds * 1000);
  return Number.isFinite(parsed.getTime()) ? parsed : undefined;
}
