import { describe, expect, it } from "vitest";
import { PassThrough } from "node:stream";
import type { IncomingMessage } from "node:http";
import {
  MigrationPayloadError,
  readBoundedMigrationJson,
  resolveMigrationLimitMb,
} from "./readBoundedMigrationJson";

function testRequest(headers: Record<string, string> = {}) {
  const stream = Object.assign(new PassThrough(), { headers });
  return {
    stream,
    parse: (bytes: number) =>
      readBoundedMigrationJson(stream as unknown as IncomingMessage, bytes),
  };
}

describe("bounded JSON migration payloads", () => {
  it("parses valid chunked JSON within a strict byte limit", async () => {
    const { stream, parse } = testRequest();
    const result = parse(200);
    stream.write('{"format":1,');
    stream.end('"data":"<DL></DL>"}');
    await expect(result).resolves.toEqual({ format: 1, data: "<DL></DL>" });
  });

  it("rejects oversized bodies even without Content-Length", async () => {
    const { stream, parse } = testRequest();
    const result = parse(10);
    stream.write('{"a":"hello world"}');
    stream.end();
    await expect(result).rejects.toMatchObject({ code: "too-large" });
  });

  it("rejects excessive or malformed declared Content-Length", async () => {
    const excess = testRequest({ "content-length": "900" });
    await expect(excess.parse(32)).rejects.toMatchObject({ code: "too-large" });
    const malformed = testRequest({ "content-length": "infinite" });
    await expect(malformed.parse(32)).rejects.toMatchObject({
      code: "invalid",
    });
  });

  it("rejects invalid JSON, stream errors, and aborted streams", async () => {
    const invalid = testRequest();
    const parsing = invalid.parse(40);
    invalid.stream.end("{nope");
    await expect(parsing).rejects.toMatchObject({ code: "invalid" });

    const aborted = testRequest();
    const request = aborted.parse(40);
    aborted.stream.emit("aborted");
    await expect(request).rejects.toBeInstanceOf(MigrationPayloadError);
    aborted.stream.end();
  });

  it("bounds malformed environment limits instead of disabling protection", () => {
    expect(resolveMigrationLimitMb(undefined)).toBe(10);
    expect(resolveMigrationLimitMb("8")).toBe(8);
    for (const input of [
      "0",
      "-1",
      "NaN",
      "Infinity",
      "150",
      "2e3",
      "1000",
      "",
    ]) {
      expect(resolveMigrationLimitMb(input)).toBe(10);
    }
  });
});
