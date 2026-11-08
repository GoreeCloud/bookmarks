# GoreeCloud Bookmarks — Opt-in SQLite runtime and offline recovery

**Version:** v0.1.19 development preview, November 8, 2026. **Not** a production migration, deployment, default storage switch, encrypted vault, or Stable release. Node 22's built-in `node:sqlite` API remains experimental; Node 24 is tested by CI.

## Safe use with a disposable library

The existing JSON-backed HTTP server remains the default. To deliberately create a **new, empty** SQLite library on loopback with throwaway credentials:

```bash
GCB_STORAGE_BACKEND=sqlite \
GCB_DATA_FILE=/path/to/PRIVATE-test-library.sqlite \
GCB_AUTH_TOKEN='use-a-fresh-random-32-byte-secret' \
HOST=127.0.0.1 PORT=4173 npm start
```

Choose a **new path** ending in `.sqlite` or `.db`, inside a private local directory. Do **not** use the name/path of an existing JSON library. The adapter refuses the wrong file extension, invalid or oversized permissions on existing files, non-SQLite contents, malformed records and unsupported schema versions. A fresh SQLite file is mode `0600`. This opt-in does not modify the default JSON library, change existing process configuration, or attempt any implicit migration.

To review a previously migrated **new** SQLite snapshot against a disposable source JSON file:

```bash
npm run sqlite-migrate -- plan ./test-bookmarks.json
npm run sqlite-migrate -- migrate ./test-bookmarks.json ./new-test-library.sqlite
npm run sqlite-migrate -- inspect ./new-test-library.sqlite
# When explicitly ready for a TEST server, point GCB_DATA_FILE at that new file.
```

Before any eventual real-library cutover, stop the JSON writer, verify its snapshot and backup, perform an independent migration against an approved copy, and test both recovery directions. This document does not authorize migration or deletion of real data.

## Runtime semantics and consistency

The adapter preserves the v1 JSON record model (`schema`, `bookmarks`, `collections`), the public HTTP request/response contracts and the in-process `snapshot()/mutate()` interface. It uses the same published SQLite v1 tables (`metadata`, `collections`, `bookmarks`, `tags`) and validates referenced IDs, dates, URLs, statuses and record order. Writes use an explicit SQLite `BEGIN IMMEDIATE` / `COMMIT` transaction, with `ROLLBACK` after failures. Changes to foreign keys, indexes, payloads, tag rows, order and count metadata are applied together. A failed write leaves both the cached snapshot and on-disk records unchanged; later valid writes remain possible.

The selected local journal policy is **`journal_mode=DELETE` with `synchronous=EXTRA`**, with foreign keys on and an existing 2-second SQLite busy timeout. This deliberately avoids WAL checkpoint and sidecar backup complexity for the development single-writer service; SQLite's official documentation describes EXTRA as adding directory sync after deletion of the rollback journal. This is not independently certified against power failure on all filesystems. Cooperative servers still use the canonical-path `.lock` file. A crash leaves that lock for verified manual recovery; the SQLite transaction itself remains crash-consistent under its documented assumptions. No distributed multi-writer coordination is provided.

Current `snapshot()` reads a validated in-memory cache, and serialized mutations update indexed SQLite tables. Reordering rows updates all positional ordinals, and request validation still scans the library in memory. Performance at large collection sizes has not been profiled or accepted. Do **not** expose the development server beyond a reviewed loopback/test boundary.

## Private, offline SQLite backups

**The JSON `npm run backup` and `npm run restore-backup` commands remain JSON-only.** The SQLite commands below are separate and do not read or write the JSON library. Stop the SQLite server before calling them; the SQLite backup command refuses the source when its `.lock` exists, even if the process crashed, until an administrator verifies it is abandoned.

```bash
npm run sqlite-backup -- backup ./new-test-library.sqlite ./private-backups
npm run sqlite-backup -- verify ./private-backups/SELECTED-backup.sqlite
npm run sqlite-backup -- restore ./private-backups/SELECTED-backup.sqlite ./new-restored-test.sqlite
npm run sqlite-migrate -- inspect ./new-restored-test.sqlite
```

Backups use Node's SQLite backup API to create a private temporary database, validate its `integrity_check`, `foreign_key_check`, source payloads/counts and entire restored JSON-v1 model, then publish a **new** mode-0600 `.sqlite` and `.sha256` manifest. Both paths use no-overwrite creation; corrupted/tampered backups are rejected. Verify the pair together. A restore checks digest and SQLite integrity before creating a separate destination. Restores cannot overwrite an existing file. Backups are limited to 256 MiB and **not encrypted**. Use private local storage. No automatic retention, rotation, off-site copy, scheduled backup, unattended stale-lock removal or power-loss certification exists.

## Recovery and remaining gates

In a test, an unclean `SIGKILL` leaves the server's file lock. Do not delete it based solely on a PID or process-name guess. Verify every old writer is stopped, inspect the SQLite file and backup with read-only tools, back up the damaged or suspect original elsewhere, and only then manually clear the confirmed abandoned lock. Restart the server using the verified original or a **new** restored destination. Never overwrite the authoritative old database as a demonstration.

The current SQLite adapter is a development foundation only. Release readiness still requires versioned schema upgrades and rollback, real power-loss/storage failure tests, performance profiling at 10,000+ records, encrypted/offsite backup and retention design, full real-browser/device acceptance, user identity/TLS controls, and independently verified recovery on target hardware. Follow [GitHub issue #3](https://github.com/GoreeCloud/bookmarks/issues/3).
