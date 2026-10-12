type DisposableTestEnvironment = {
  DATABASE_URL?: string;
  STORAGE_FOLDER?: string;
  GOREECLOUD_DISPOSABLE_DB_TEST?: string;
  SPACES_ENDPOINT?: string;
  SPACES_KEY?: string;
  SPACES_SECRET?: string;
};

export function isDisposableBookmarkTestTarget(
  environment: DisposableTestEnvironment
): boolean {
  if (environment.GOREECLOUD_DISPOSABLE_DB_TEST !== "true" ||
      environment.STORAGE_FOLDER !== "data-test" ||
      environment.SPACES_ENDPOINT ||
      environment.SPACES_KEY ||
      environment.SPACES_SECRET) {
    return false;
  }

  try {
    const target = new URL(environment.DATABASE_URL || "");
    let allowedParameters = true;
    target.searchParams.forEach((value, key) => {
      if (key !== "schema" || value !== "public") allowedParameters = false;
    });
    return !target.hash && allowedParameters &&
      (target.protocol === "postgresql:" || target.protocol === "postgres:") &&
      target.pathname === "/bookmarks_test" &&
      ["localhost", "127.0.0.1", "[::1]"].includes(target.hostname) &&
      (target.port === "" || target.port === "5432");
  } catch {
    return false;
  }
}
