import { beforeEach, describe, expect, it, vi } from "vitest";

const stubs = vi.hoisted(() => ({
  findUnique: vi.fn(),
}));
vi.mock("@linkwarden/prisma", () => ({
  prisma: { user: { findUnique: stubs.findUnique } },
}));
import exportData from "./exportData";

const sample = {
  name: "Private account holder",
  password: "never-export-password",
  accessTokens: [{ token: "never-export-token" }],
  subscriptions: [{ provider: "private" }],
  collections: [{
    name: "Reading",
    description: "Research",
    color: "#1357ac",
    members: [{ userId: 999 }],
    links: [
      {
        name: "Saved page",
        url: "https://example.org/article",
        description: "A bookmark",
        createdAt: new Date("2025-04-01T00:00:00Z"),
        importDate: null,
        tags: [{ name: "research", ownerId: 99 }],
        textContent: "unexported archive text",
      },
      {
        name: "Not a web link",
        url: "javascript:alert(1)",
        description: "unsafe",
        createdAt: new Date("2025-04-01T00:00:00Z"),
        importDate: null,
        tags: [],
      },
      {
        name: "Text entry",
        url: null,
        description: "no URL",
        createdAt: new Date("2025-04-01T00:00:00Z"),
        importDate: null,
        tags: [],
      },
    ],
  }],
  pinnedLinks: [
    { url: "https://example.org/article" },
    { url: "https://example.org/article" },
    { url: "https://shared.example.org/team-only" },
  ],
};

beforeEach(() => vi.clearAllMocks());

describe("portable, user-scoped bookmark exports", () => {
  it("exports only the import-compatible collection/link/tag fields", async () => {
    stubs.findUnique.mockResolvedValue(sample);
    const result = await exportData(17);
    expect(result.status).toBe(200);
    const output = result.response as any;
    expect(output.formatVersion).toBe(1);
    expect(output.collections).toHaveLength(1);
    expect(output.collections[0].links.map((link: any) => link.name))
      .toEqual(["Saved page", "Text entry"]);
    expect(output.collections[0].links[0].tags).toEqual([{ name: "research" }]);
    expect(output.pinnedLinks).toEqual([{ url: "https://example.org/article" }]);
    expect(Object.keys(output).sort())
      .toEqual(["collections", "formatVersion", "pinnedLinks"]);
    const serialized = JSON.stringify(output);
    for (const secret of ["never-export-password", "never-export-token",
      "private account holder", "unexported archive text", "team-only",
      "members", "ownerId", "subscriptions"]) {
      expect(serialized).not.toContain(secret);
    }
  });

  it("requests a strict Prisma selection from the caller's user record", async () => {
    stubs.findUnique.mockResolvedValue(sample);
    await exportData(17);
    const query = stubs.findUnique.mock.calls[0][0];
    expect(query.where).toEqual({ id: 17 });
    expect(query.select.collections.select.links.select.tags.select)
      .toEqual({ name: true });
    expect(query.select.pinnedLinks).toEqual({ select: { url: true } });
    for (const sensitive of ["password", "accessTokens", "accounts",
      "subscription", "members", "textContent", "pdf", "image"]) {
      expect(JSON.stringify(query)).not.toContain('"' + sensitive + '"');
    }
  });

  it("fails closed for an account without a matching user", async () => {
    stubs.findUnique.mockResolvedValue(null);
    await expect(exportData(17)).resolves.toEqual({
      response: "User not found.", status: 404,
    });
  });
});
