# Disposable database migration checks

A development-only PostgreSQL integration test is available in `apps/web/lib/api/controllers/migration/restore.postgres.test.ts`. It validates restoration of synthetic bookmarks, tag and pin relations, local archive directory creation, idempotent repair and cross-account ownership rejection.

The suite requires an independently provisioned disposable PostgreSQL database named `bookmarks_test` and a separate disposable local archive directory. Never point it at production or reusable data. Configure the environment without exposing credentials in source, logs, tickets or PRs, migrate the empty test schema with `yarn workspace @linkwarden/prisma deploy`, and run only the named test using `yarn vitest run apps/web/lib/api/controllers/migration/restore.postgres.test.ts`.

No disposable PostgreSQL instance was available in this execution session. The source may be typechecked through the existing CI, but this does not count as a successful live-database integration run. Preserve the task until a trusted isolated test environment can execute it, verify cleanup and capture rollback evidence.
