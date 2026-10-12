import { describe, expect, it } from "vitest";
import resolveQuickSaveCollection from "./resolveQuickSaveCollection";

const collections = [
  { id: 12, name: "Reading", ownerId: 5 },
  { id: 29, name: "Shared", ownerId: null },
];

describe("initial Quick Save collection context", () => {
  it("defaults to Unorganized outside a collection route", () => {
    expect(resolveQuickSaveCollection("/links", "12", collections)).toEqual({ name: "Unorganized" });
  });

  it("resolves the current collection after data arrives", () => {
    expect(resolveQuickSaveCollection("/collections/[id]", "12", collections)).toEqual({
      id: 12,
      name: "Reading",
    });
  });

  it("does not select a missing or non-owned collection", () => {
    expect(resolveQuickSaveCollection("/collections/[id]", "12", [])).toEqual({ name: "Unorganized" });
    expect(resolveQuickSaveCollection("/collections/[id]", "29", collections)).toEqual({ name: "Unorganized" });
  });

  it("rejects invalid and ambiguous route IDs", () => {
    for (const id of ["", "-3", "0", "12.5", "NaN", "Infinity", "foo", ["12", "29"], undefined]) {
      expect(resolveQuickSaveCollection("/collections/[id]", id, collections)).toEqual({
        name: "Unorganized",
      });
    }
  });
});
