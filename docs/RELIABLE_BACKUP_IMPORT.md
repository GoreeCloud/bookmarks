# Reliable JSON backup imports

**Development-only.** GoreeCloud Bookmarks' inherited Linkwarden-compatible JSON backup importer now checks the backup envelope, collection/link/tag arrays, and URL safety before writes. Malformed input returns HTTP 400; capacity checks count only importable saved links.

All new collection/link/tag/pin database operations run through one Prisma transaction. A rejected transaction returns an error, not a false success, and archive directory creation is deferred until after a successful commit. A post-commit directory failure reports that bookmarks were saved but storage needs repair; users must not blindly retry and duplicate saved links. An explicit reconciliation workflow is still required.

This is a partial import reliability improvement, not production/native migration qualification. Mocked unit tests do not prove real PostgreSQL rollback, concurrency behavior, archive durability or accepted capacity/billing policy. End-to-end tests must use a disposable authorized database and archive volume. The existing import source and upstream legal obligations remain governed by the Fork-to-Native plan.
