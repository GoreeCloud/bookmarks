import { describe, expect, it } from "vitest";
import { isDisposableBookmarkTestTarget } from "./disposableTestTarget";

const valid = {
  DATABASE_URL: "postgresql://testuser@127.0.0.1:5432/bookmarks_test",
  STORAGE_FOLDER: "data-test",
  GOREECLOUD_DISPOSABLE_DB_TEST: "true",
};

describe("disposable migration test target", () => {
  it("accepts only explicit local PostgreSQL test configuration", () => {
    expect(isDisposableBookmarkTestTarget(valid)).toBe(true);
    expect(isDisposableBookmarkTestTarget({
      ...valid, DATABASE_URL: "postgres://testuser@localhost/bookmarks_test",
    })).toBe(true);
    expect(isDisposableBookmarkTestTarget({
      ...valid, DATABASE_URL: "postgresql://localhost/bookmarks_test?schema=public",
    })).toBe(true);
  });

  it("rejects production-like and misleading database URLs", () => {
    for (const url of [
      "postgresql://db.example.com:5432/bookmarks_test",
      "postgresql://127.0.0.1/bookmarks_test_prod",
      "postgresql://127.0.0.1/production?name=/bookmarks_test",
      "postgresql://127.0.0.1/bookmarks_test_backup",
      "postgresql://127.0.0.1:5433/bookmarks_test",
      "mysql://localhost/bookmarks_test",
      "postgresql://localhost/bookmarks_test?host=outside.example",
      "postgresql://localhost/bookmarks_test?schema=elsewhere",
      "postgresql://localhost/bookmarks_test#extra",
      "not-a-url",
    ]) {
      expect(isDisposableBookmarkTestTarget({ ...valid, DATABASE_URL: url })).toBe(false);
    }
  });

  it("requires explicit opt-in and dedicated local storage", () => {
    expect(isDisposableBookmarkTestTarget({ ...valid, GOREECLOUD_DISPOSABLE_DB_TEST: "" })).toBe(false);
    expect(isDisposableBookmarkTestTarget({ ...valid, STORAGE_FOLDER: "data" })).toBe(false);
    expect(isDisposableBookmarkTestTarget({ ...valid, SPACES_ENDPOINT: "http://localhost" })).toBe(false);
    expect(isDisposableBookmarkTestTarget({ ...valid, SPACES_SECRET: "configured" })).toBe(false);
  });
});
