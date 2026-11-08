/** Decode JSON as strict UTF-8, never silently replacing invalid input bytes.
 * The BOM is preserved for JSON.parse to reject rather than accepted implicitly.
 * Apply the same decoder to HTTP uploads, persisted libraries and backups.
 */
export function parseUtf8Json(bytes) {
  const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  return JSON.parse(text);
}
