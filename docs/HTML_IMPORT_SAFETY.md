# HTML bookmark import safety

**Status:** Fork-to-Native Development. This change hardens the inherited Netscape/HTML bookmark import, not the overall production security acceptance.

Import preserves HTTP and HTTPS saved-link URLs up to 2,047 characters. It ignores malformed URLs, bookmarklets (`javascript:`), local files (`file:`), embedded credentials, control characters, and other non-web schemes. Rejected links do not create new `Imports` collections and are not counted against inherited per-user link limits.

`ADD_DATE` values are parsed only as integral Unix seconds within the supported calendar range. Invalid dates do not abort an otherwise valid import; the imported saved link simply has no explicit import timestamp. Empty/non-string HTML payloads receive a 400 response.

The import does not fetch linked content. Subsequent preservation/network-fetch paths require their separate server-side SSRF and Privacy Shield safeguards. The import still relies on the inherited application, database, HTML parser, capacity policy, and authentication endpoints; this change does **not** qualify those surfaces for deployment.

Tests: `importSafety.test.ts` (pure validation) and `importFromHTMLFile.unit.test.ts` (mocked imported-link persistence and quota behavior), plus existing URL safety regression checks in CI. The database-backed `importFromHTMLFile.test.ts` requires a disposable configured PostgreSQL environment and is not claimed by these unit tests.
