# GoreeCloud Bookmarks — Offline SQLite migration preview

**Status:** Development-only and opt-in. The Bookmarks HTTP server uses JSON-v1 by default. v0.1.19 introduced a separate SQLite runtime (v0.1.20 hardens its offline backup lock and unchanged-order updates) for **explicit disposable-test opt-in**; the offline converter remains non-mutating toward its JSON source, and no production migration or disaster-recovery certification exists. See [SQLite Runtime](SQLITE_RUNTIME.md).

## Why and support boundary

The built-in `node:sqlite` module provides SQLite without adding npm runtime dependencies. It is **experimental in Node.js 22**; use a tested current Node 22.16+ runtime and expect the experimental warning. The supported source is a regular, UTF-8 JSON-v1 file **at most 64 MiB**. No original library or SQLite destination is ever overwritten by the migration or export commands.

A successful dry-run summary does not lock the library or stop an active server. For a coherent migration sample, **stop the single-writer JSON server first**, verify the data and its backup, then run the commands against a private source file (preferably a verified snapshot or restored copy). Never point these tools at production data during testing.

## Commands

```bash
# Read-only check, record count, source-byte SHA-256 and estimated data size.
npm run sqlite-migrate -- plan /path/to/bookmarks.json

# Create a NEW SQLite file. Refuses to replace any existing destination.
npm run sqlite-migrate -- migrate /path/to/bookmarks.json /path/to/NEW-library.sqlite

# Read SQLite integrity, foreign keys, payload consistency and counts.
npm run sqlite-migrate -- inspect /path/to/NEW-library.sqlite

# Export the snapshot back to a NEW JSON file, never an existing one.
npm run sqlite-migrate -- export /path/to/NEW-library.sqlite /path/to/NEW-export.json
```

Review the count, IDs, collection associations, text, tags and timestamps before considering any cutover. Run the normal JSON server only with the verified JSON output on a **separate, disposable port and data file** for an independent read-only application-level check. The existing production or personal library remains untouched.

## Explicit offline header transition for legacy SQLite files

Older v0.1.18–v0.1.20 SQLite files use `(application_id=0, user_version=0)` and are still readable by the opt-in runtime without automatic mutation. To create a **new, explicitly marked** file from an independently verified legacy SQLite snapshot, use:

```bash
# Stop all writers; verify the original and backup first.
npm run sqlite-migrate -- inspect /private/old.sqlite
npm run sqlite-header-mark -- /private/old.sqlite /private/new-v1-marked.sqlite
npm run sqlite-migrate -- inspect /private/new-v1-marked.sqlite
```

This tool accepts only the legacy header pair and validated Bookmarks-v1 schema, holds the source canonical exclusive writer lock, uses Node's SQLite backup API, checks complete record equality and unchanged source SHA-256/inode, syncs the new candidate, and publishes only to a nonexisting destination. It never changes the old database and creates no implicit service cutover. An existing locked writer, invalid/mixed header, corrupt data, or preexisting destination fails closed. This is a **file-header transition**, *not* a table-schema migration, rollback of schema changes, or approved production migration. See [Header Transition](SQLITE_HEADER_MARK.md).

## SQLite schema and integrity checks

New files created by the v0.1.21 tools carry application ID `0x4743424d` (`GCBM`) and `PRAGMA user_version=1`, in addition to the metadata `schema_version=1`. Earlier v0.1.20 databases with both header values at zero remain compatible and are not silently modified. Unknown or inconsistent header values fail closed; there is **no automatic schema upgrade**.

The SQLite file contains `metadata`, `collections`, `bookmarks`, and `tags` tables, with version metadata, primary keys, foreign-key constraints, ordered row positions, validated status/boolean fields, and indexes on collection, read status, trash timestamp, creation time, and tag. Each record also retains a full JSON payload so future migration steps can recover unknown noncritical fields instead of silently erasing them. Readback compares every payload with the indexed columns and original JSON object, rejecting mismatches. This is a snapshot representation; indexed and payload values are **not a write-through runtime contract**.

Migration stages rows in a private 0600 file on the destination filesystem in a single SQLite transaction (`foreign_keys=ON`, `journal_mode=DELETE`, `synchronous=FULL`). The candidate is reopened for `integrity_check`, `foreign_key_check`, schema/data validation, counts, and exact JSON model comparison. The source SHA-256 is checked again before the candidate is atomically published via no-overwrite hard-link creation. Temporary artifacts are cleaned on failure. JSON export uses the same private-temp plus no-overwrite publication pattern.

## Rollback and limitations

Rollback during **offline migration** means keep the original JSON source and use the unchanged default server configuration. v0.1.19 and later allow an explicitly configured SQLite development server reading a separate file, but the migration command never switches the server automatically. No automatic deletion, schema evolution, WAL runtime coordination, encrypted backup, retention schedule, or automatic restore is included. Sensitive bookmark URLs and notes are **not encrypted at rest** in either the JSON or SQLite file; protect backup copies and filesystem permissions appropriately.

The no-overwrite hard-link strategy requires a filesystem supporting hard links to the intended destination. Data durability after unexpected power loss may depend on the filesystem and directory metadata persistence; this is not power-loss certification. Do not attempt unsupported network filesystems or concurrently migrate changing libraries. Do not remove a writer lock automatically. A checksum protects against accidental damage, not an attacker controlling the library and its checksum. The `node:sqlite` API and generated SQLite file must undergo more cross-platform, failure-injection, long-run, multi-writer, backup, and independent-restoration verification before a future database-backed service can be considered for release.

For the full migration gate, see [GitHub issue #3](https://github.com/GoreeCloud/bookmarks/issues/3).
