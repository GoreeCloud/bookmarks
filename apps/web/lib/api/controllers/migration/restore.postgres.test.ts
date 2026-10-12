import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@linkwarden/prisma";
import { fileExists, removeFolder } from "@linkwarden/filesystem";
import importFromLinkwarden from "./importFromLinkwarden";
import { ensureOwnedArchiveFolders } from "./ensureOwnedArchiveFolders";
import { isDisposableBookmarkTestTarget } from "./disposableTestTarget";

const users: number[] = [];
const folders: number[] = [];

async function newTestUser() {
  const slug = `gcb_restore_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const user = await prisma.user.create({
    data: { username: slug, email: `${slug}@example.invalid` },
  });
  users.push(user.id);
  return user;
}

beforeAll(async () => {
  // Do not connect to any database until every isolation boundary is verified.
  if (!isDisposableBookmarkTestTarget({
    DATABASE_URL: process.env.DATABASE_URL,
    STORAGE_FOLDER: process.env.STORAGE_FOLDER,
    GOREECLOUD_DISPOSABLE_DB_TEST: process.env.GOREECLOUD_DISPOSABLE_DB_TEST,
    SPACES_ENDPOINT: process.env.SPACES_ENDPOINT,
    SPACES_KEY: process.env.SPACES_KEY,
    SPACES_SECRET: process.env.SPACES_SECRET,
  })) {
    throw new Error("Isolated local test database and explicit opt-in required.");
  }
  await prisma.$connect();
});

afterEach(async () => {
  for (const userId of users.splice(0)) {
    const owned = await prisma.collection.findMany({
      where: { ownerId: userId }, select: { id: true },
    });
    folders.push(...owned.map(({ id }) => id));
    await prisma.user.delete({ where: { id: userId } });
  }
  for (const id of folders.splice(0)) {
    await removeFolder({ filePath: `archives/${id}` });
  }
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe.sequential("disposable PostgreSQL bookmark restore", () => {
  it("commits a safe backup with tags and pins, then creates archives", async () => {
    const user = await newTestUser();
    const backup = {
      collections: [{
        name: "Research", description: "Saved reading", color: "#123abc",
        links: [{
          name: "Paper", url: "https://example.org/paper",
          description: "Reference", tags: [{ name: "study" }],
          createdAt: "2025-01-02T00:00:00.000Z",
        }],
      }],
      pinnedLinks: [{ url: "https://example.org/paper" }],
    };
    expect(await importFromLinkwarden(user.id, JSON.stringify(backup)))
      .toEqual({ response: "Success.", status: 200 });
    const collections = await prisma.collection.findMany({
      where: { ownerId: user.id },
      include: { links: { include: { tags: true, pinnedBy: true } } },
    });
    expect(collections).toHaveLength(1);
    const saved = collections[0].links[0];
    expect(saved.url).toBe("https://example.org/paper");
    expect(saved.tags.map((tag) => tag.name)).toEqual(["study"]);
    expect(saved.pinnedBy.map((person) => person.id)).toContain(user.id);
    expect(await fileExists(`archives/${collections[0].id}`)).toBe(true);
    expect((await ensureOwnedArchiveFolders(user.id, [collections[0].id])).status)
      .toBe("complete");
  });

  it("refuses other users' collections before writing directories", async () => {
    const owner = await newTestUser();
    const other = await newTestUser();
    const collection = await prisma.collection.create({
      data: { name: "Not Yours", ownerId: other.id, createdById: other.id },
    });
    expect(await fileExists(`archives/${collection.id}`)).toBe(false);
    expect(await ensureOwnedArchiveFolders(owner.id, [collection.id]))
      .toEqual({ status: "not-owned", ensured: 0, failedIds: [] });
    expect(await fileExists(`archives/${collection.id}`)).toBe(false);
  });
});
