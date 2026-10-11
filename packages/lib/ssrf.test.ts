import { describe, expect, it } from "vitest";
import {
  assertUrlIsSafeForServerSideFetch,
  isHostnameBlockedForServerSideFetch,
  isIpAddressBlockedForServerSideFetch,
  UnsafeUrlError,
} from "./ssrf";

describe("ssrf guard", () => {
  it("blocks localhost hostnames", () => {
    expect(isHostnameBlockedForServerSideFetch("localhost")).toBe(true);
    expect(isHostnameBlockedForServerSideFetch("subdomain.localhost")).toBe(
      true
    );
  });

  it("blocks single-label internal hostnames", () => {
    expect(isHostnameBlockedForServerSideFetch("meilisearch")).toBe(true);
    expect(isHostnameBlockedForServerSideFetch("postgres")).toBe(true);
  });

  it("blocks private and loopback IP literals", () => {
    expect(isIpAddressBlockedForServerSideFetch("127.0.0.1")).toBe(true);
    expect(isIpAddressBlockedForServerSideFetch("169.254.169.254")).toBe(true);
    expect(isIpAddressBlockedForServerSideFetch("::1")).toBe(true);
    expect(isIpAddressBlockedForServerSideFetch("fc00::1")).toBe(true);
  });

  it("blocks encoded local endpoints in IPv6 addresses", () => {
    for (const address of [
      "::ffff:7f00:1",
      "::7f00:1",
      "2002:c0a8:101::1",
      "2001:0:7f00::1",
    ]) {
      expect(isIpAddressBlockedForServerSideFetch(address)).toBe(true);
    }
  });

  it("handles public and restricted IPv6 literal URLs", async () => {
    await expect(
      assertUrlIsSafeForServerSideFetch("https://[2606:4700:4700::1111]/")
    ).resolves.toBeInstanceOf(URL);
    await expect(
      assertUrlIsSafeForServerSideFetch("https://[::ffff:7f00:1]/")
    ).rejects.toBeInstanceOf(UnsafeUrlError);
  });

  it("rejects embedded credentials before any DNS request", async () => {
    await expect(
      assertUrlIsSafeForServerSideFetch("https://reader:password@example.com/")
    ).rejects.toBeInstanceOf(UnsafeUrlError);
  });

  it("does not trust legacy process-wide access configuration", async () => {
    const before = process.env.ALLOW_PRIVATE_NETWORK_ACCESS;
    process.env.ALLOW_PRIVATE_NETWORK_ACCESS = "true";
    try {
      await expect(
        assertUrlIsSafeForServerSideFetch("http://127.0.0.1/")
      ).rejects.toBeInstanceOf(UnsafeUrlError);
    } finally {
      if (before === undefined) delete process.env.ALLOW_PRIVATE_NETWORK_ACCESS;
      else process.env.ALLOW_PRIVATE_NETWORK_ACCESS = before;
    }
  });

  it("allows public hostnames that resolve to public IPs", async () => {
    await expect(
      assertUrlIsSafeForServerSideFetch("https://example.com", {
        lookup: async () => [{ address: "93.184.216.34", family: 4 }],
      })
    ).resolves.toBeInstanceOf(URL);
  });

  it("blocks hostnames that resolve to private IPs", async () => {
    await expect(
      assertUrlIsSafeForServerSideFetch("https://example.com", {
        lookup: async () => [{ address: "10.0.0.8", family: 4 }],
      })
    ).rejects.toBeInstanceOf(UnsafeUrlError);
  });

  it("blocks IPv6 loopback literals", async () => {
    await expect(
      assertUrlIsSafeForServerSideFetch("http://[::1]/")
    ).rejects.toBeInstanceOf(UnsafeUrlError);
  });
});
