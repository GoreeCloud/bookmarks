import { existsSync, readFileSync } from "fs";

const isInline = (value: string) =>
  value.startsWith("{") || value.includes("-----BEGIN");

// Single-line PEMs carry literal \n sequences that must become real newlines;
// JSON must keep its escape sequences intact for JSON.parse.
const normalize = (value: string) =>
  value.startsWith("{") ? value : value.replace(/\\n/g, "\n");

// Reads a secret (PEM key or JSON blob) from an env value that may be:
//  - the inline value itself,
//  - a base64 encoding of it, or
//  - a path to a file containing it.
export default function readSecret(value?: string | null): string | null {
  if (!value?.trim()) return null;

  const raw = value.trim();

  if (isInline(raw)) return normalize(raw);

  if (existsSync(raw)) return readFileSync(raw, "utf8");

  const decoded = Buffer.from(raw, "base64").toString("utf8");
  if (isInline(decoded)) return normalize(decoded);

  // Unrecognized — hand it back so the consumer fails with its own clear error
  return raw;
}
