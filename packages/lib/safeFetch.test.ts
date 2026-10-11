import { describe, expect, it, vi, afterEach } from "vitest";
import { safeFetch } from "./safeFetch";

afterEach(() => vi.unstubAllEnvs());

describe("safe fetch input limits", () => {
  it("rejects unqualified proxy routing", async () => {
    vi.stubEnv("PROXY", "http://proxy.test:8080");
    await expect(safeFetch("https://example.com")).rejects.toThrow(
      "separately qualified transport"
    );
  });

  it("rejects environment-based protection overrides", async () => {
    for (const key of [
      "ALLOW_PRIVATE_NETWORK_ACCESS",
      "ALLOW_INSECURE_TLS",
      "IGNORE_UNAUTHORIZED_CA",
    ]) {
      vi.stubEnv(key, "true");
      await expect(safeFetch("https://example.com")).rejects.toThrow(
        "cannot disable"
      );
      vi.stubEnv(key, "false");
    }
  });

  it("rejects invalid redirect budgets", async () => {
    for (const maxRedirects of [-1, 11, 0.25, Number.NaN]) {
      await expect(
        safeFetch("https://example.com", { maxRedirects })
      ).rejects.toBeInstanceOf(TypeError);
    }
  });
});
