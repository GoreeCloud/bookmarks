# Archive directory recovery

Development-only, internal operation. The owner-scoped helper checks every requested collection ID for the current owner before creating any local archive directories. It deduplicates positive integer IDs, uses bounded database batches, makes no deletion or move operations, and reports partial failures for safe retry. Object storage uses implicit directory prefixes.

The importer calls this helper after a successful database commit. Database and filesystem are not jointly transactional: a folder failure must not be represented as a rolled-back import. Recovery is idempotent for existing directories and must use a trusted authenticated owner ID. There is deliberately no public repair endpoint until GoreeCloud Identity and Privacy Shield authorization are accepted.

Unit tests cover invalid IDs, ownership, batching, repeat-safe paths, partial failures and database failure. Production acceptance additionally needs a disposable PostgreSQL database, representative local filesystem and object storage environments, concurrency tests, monitoring and recovery UX.
