import type { IncomingMessage } from "node:http";

export class MigrationPayloadError extends Error {
  constructor(public readonly code: "too-large" | "invalid") {
    super(code === "too-large" ? "Payload Too Large" : "Invalid JSON");
  }
}

export const DEFAULT_MIGRATION_LIMIT_MB = 10;
export const MAX_MIGRATION_LIMIT_MB = 100;

export function resolveMigrationLimitMb(configured?: string): number {
  if (configured === undefined) return DEFAULT_MIGRATION_LIMIT_MB;
  if (!/^\d{1,3}$/.test(configured)) return DEFAULT_MIGRATION_LIMIT_MB;
  const value = Number(configured);
  return Number.isSafeInteger(value) &&
    value >= 1 &&
    value <= MAX_MIGRATION_LIMIT_MB
    ? value
    : DEFAULT_MIGRATION_LIMIT_MB;
}

export async function readBoundedMigrationJson(
  req: IncomingMessage,
  maxBytes: number
): Promise<unknown> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) {
    throw new MigrationPayloadError("invalid");
  }
  const statedLength = req.headers["content-length"];
  if (
    statedLength !== undefined &&
    (!/^\d+$/.test(statedLength) || !Number.isSafeInteger(Number(statedLength)))
  ) {
    req.resume();
    throw new MigrationPayloadError("invalid");
  }
  if (statedLength !== undefined && Number(statedLength) > maxBytes) {
    req.resume();
    throw new MigrationPayloadError("too-large");
  }

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let length = 0;
    let finished = false;
    const cleanup = () => {
      req.removeListener("data", onData);
      req.removeListener("end", onEnd);
      req.removeListener("error", onError);
      req.removeListener("aborted", onAbort);
    };
    const finish = (error?: MigrationPayloadError, result?: unknown) => {
      if (finished) return;
      finished = true;
      cleanup();
      if (error) reject(error);
      else resolve(result);
    };
    const onData = (chunk: Buffer | string) => {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      length += bytes.byteLength;
      if (length > maxBytes) {
        finish(new MigrationPayloadError("too-large"));
        req.resume(); // Discard the remainder; never buffer an oversized body.
        return;
      }
      chunks.push(bytes);
    };
    const onEnd = () => {
      try {
        const body = Buffer.concat(
          chunks as unknown as Uint8Array[],
          length
        ).toString("utf8");
        finish(undefined, JSON.parse(body));
      } catch {
        finish(new MigrationPayloadError("invalid"));
      }
    };
    const onError = () => finish(new MigrationPayloadError("invalid"));
    const onAbort = () => finish(new MigrationPayloadError("invalid"));
    req.on("data", onData);
    req.once("end", onEnd);
    req.once("error", onError);
    req.once("aborted", onAbort);
  });
}
