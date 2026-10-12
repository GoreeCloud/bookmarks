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
  it("rejects excessive pins", () => {
    expect(getBackupWorkloadError({ collections: [], pinnedLinks: new Array(MAX_BACKUP_PINS + 1).fill(null) })).toContain("pinned");
  });
});
