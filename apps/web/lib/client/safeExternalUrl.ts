/** Validate a saved external URL immediately before opening a new tab. */
export default function safeExternalUrl(
  raw: string | null | undefined
): string | null {
  if (!raw || raw.length > 8192) return null;
  const trimmed = raw.trim();
  if (!trimmed || /[\u0000-\u001f\u007f]/.test(trimmed)) return null;

  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (!url.hostname || url.username || url.password) return null;
    return url.href;
  } catch {
    return null;
  }
}
