import { describe, expect, it } from "vitest";
import {
  getBackupWorkloadError, MAX_BACKUP_COLLECTIONS,
  MAX_BACKUP_LINKS, MAX_BACKUP_TAG_RELATIONS, MAX_BACKUP_PINS,
} from "./jsonBackupLimits";

describe("JSON backup workload limits", () => {
  it("permits a small valid backup", () => {
    expect(getBackupWorkloadError({ collections: [{ links: [{ tags: [] }] }] })).toBeNull();
  });
  it("delegates malformed objects to the structure validator", () => {
    expect(getBackupWorkloadError(null)).toBeNull();
    expect(getBackupWorkloadError({ collections: false })).toBeNull();
  });
  it("rejects excessive collections", () => {
    expect(getBackupWorkloadError({ collections: new Array(MAX_BACKUP_COLLECTIONS + 1).fill(null) })).toContain("collection");
  });
  it("rejects excessive links before collecting a second array", () => {
    expect(getBackupWorkloadError({ collections: [{ links: new Array(MAX_BACKUP_LINKS + 1).fill(null) }] })).toContain("link");
  });
  it("rejects excessive tag relations", () => {
    expect(getBackupWorkloadError({ collections: [{ links: [{ tags: new Array(MAX_BACKUP_TAG_RELATIONS + 1).fill(null) }] }] })).toContain("tag");
  });
  it("enforces the aggregate link limit across collections", () => {
    const almostFull = { links: new Array(MAX_BACKUP_LINKS / 2).fill({ tags: [] }) };
    expect(getBackupWorkloadError({ collections: [almostFull, almostFull] })).toBeNull();
    expect(getBackupWorkloadError({ collections: [
      almostFull, almostFull, { links: [{ tags: [] }] },
    ] })).toContain("link");
  });
  it("enforces aggregate tag relationships across bookmarks", () => {
    const tagBlock = new Array(MAX_BACKUP_TAG_RELATIONS / 2).fill({ name: "tag" });
    expect(getBackupWorkloadError({ collections: [{ links: [
      { tags: tagBlock }, { tags: tagBlock },
    ] }] })).toBeNull();
    expect(getBackupWorkloadError({ collections: [{ links: [
      { tags: tagBlock }, { tags: tagBlock }, { tags: [{ name: "extra" }] },
    ] }] })).toContain("tag");
  });
  it("rejects excessive pins", () => {
    expect(getBackupWorkloadError({ collections: [], pinnedLinks: new Array(MAX_BACKUP_PINS + 1).fill(null) })).toContain("pinned");
  });
});
