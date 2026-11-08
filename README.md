# GoreeCloud Bookmarks

**Your private library of the internet.** Save it. Organize it. Preserve it. Find it. Own it.

GoreeCloud Bookmarks is a privacy-first, self-hosted bookmark and read-it-later application. This repository is an **early development preview (v0.1.18)**, implementing a working first slice of the larger [feature specification](docs/FEATURE_CATALOG.md). It is not yet a complete Linkwarden/Karakeep/Raindrop.io replacement or a production-ready public service.

## What works in v0.1.18

- **Bookmark library:** Save, edit, search and open HTTP(S) URLs; titles, descriptions, notes, tags, favorites, pinned items, timestamps and read-later status.
- **Collections:** Create, rename, browse and delete collections; deleting a collection preserves its bookmarks in the unfiled inbox.
- **Tab privacy:** An explicit Lock button clears the tab's temporary session token, local bookmark/collection state and rendered library, and attempts server-side revocation. Each unlock exchanges the operator token for a separate eight-hour, revocable, memory-only session token; the operator token is not stored in the browser. Stale responses cannot reopen the tab or finish exports/imports after Lock. A failed/offline revoke is unconfirmed until expiry; server-side session validity is checked again before queued mutations and slow-upload previews, but writes already committed before revocation cannot be undone.
- **Cleaning and safety:** Remove known tracking parameters, strip embedded URL credentials, reject unsafe schemes, detect duplicate URLs and ignore URL fragments when deduplicating.
- **Trash and recovery:** Soft-delete bookmarks and restore them from Recently deleted. Independently restore a verified snapshot to a new library file; preexisting data is never overwritten by the restore command.
- **Import and export:** Import browser bookmark HTML or compatible JSON with collection name/association preservation and rejection of duplicate external collection IDs (up to 8 MiB per browser file, 10,000 links per whole-file import; legacy API batches remain capped at 500 entries); export standard HTML or complete JSON.
- **Chromium quick-capture extension:** Optional locally loaded Manifest V3 extension for the active tab, tag assignment, collection selection and server-issued, revocable browser-session token; limited to the localhost:4173 server. See [extension setup](extension/README.md).
- **Search and presentation:** Local metadata/tag/notes search, clickable tag filters, sorting, responsive grid/list views and light/dark appearance. The REST API also supports bounded, filterable bookmark searches (`GET /api/bookmarks`) for integrations.
- **Self-hosted backend:** Built-in HTTP server, 24+ character operator bearer-token bootstrap and time-limited revocable sessions, file-backed persistent store with fsync-before-atomic-replacement, a small REST API, bounded HTTP request/header timeouts, a strict Host-header allowlist and fail-closed loopback-only bind policy (separate explicit non-loopback opt-in), and basic HTTP security headers, bounded failed-authentication throttling, shared stored-library validation, and no outbound crawling.
- **GoreeCloud UI references:** First-party semantic color, shape and spacing values drawn from the current [GC UI design authority](https://github.com/GoreeCloud/gc-ui). No predecessor design system source or third-party visual assets.
- **Zero runtime npm dependencies.** Node.js built-ins only.

## Start locally

Requires **Node.js 22 or newer**.

1. Generate a unique access token:

   ```bash
   node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
   ```

2. Start the application with your generated token:

   ```bash
   GCB_AUTH_TOKEN='paste-your-generated-token-here' npm start
   ```

   On Windows PowerShell, set `$env:GCB_AUTH_TOKEN='paste-your-generated-token-here'` then run `npm start`.

3. Open **http://127.0.0.1:4173**, enter the operator token and start saving links. The server issues a temporary session; only that session token is saved in the tab. Re-enter the operator token after an eight-hour expiry or server restart.

4. Run verification:

   ```bash
   npm run check
   npm test
   ```

   An **optional, offline Chromium browser session-race test** is provided as `npm run browser-session-smoke`. It requires Python Playwright and a local Chromium installation (set `GCB_CHROMIUM_PATH` if Playwright does not provide one). The test uses isolated mocked fetch and Storage; it is **not** browser-to-live-server or real-device acceptance.

**Listener binding and Host-header protection:** By default the server may bind only literal `127.0.0.1` or `::1` IP addresses. `HOST=localhost`, DNS names, `HOST=0.0.0.0`, wildcard IPv6, and other non-loopback binds fail startup unless separately permitted: `GCB_ALLOW_NON_LOOPBACK=1` permits **literal non-loopback IPs only**, not DNS hostname resolution. This explicit setting is not a production security approval; use it only after reviewing HTTPS, firewall, session and identity protections. By default the HTTP server accepts only exact loopback `Host` headers (`127.0.0.1`, `localhost`, `[::1]`, optionally with ports). Requests with unexpected hosts are rejected with HTTP 421, including health and static assets. For a trusted HTTPS reverse proxy that preserves a public Host, set `GCB_TRUSTED_HOSTS=bookmarks.example.org` (or comma-separated exact names), using ASCII/punycode hostnames without `https://`, ports, or wildcards. Invalid configuration prevents startup. **This is one DNS-rebinding defense, not a complete remote-exposure security solution.** Keep `HOST=127.0.0.1` for local development and put the upstream behind correctly configured TLS and authorization; avoid directly binding the preview to an external interface.

A `.env.example` documents supported environment variables. Node does not automatically load this file; provide the variables explicitly or configure them using your process manager. The default server binds to **127.0.0.1** and should remain local during development. No installation of third-party packages is necessary.

## Storage, backups and deployment

By default, data is saved at `data/bookmarks.json`. All JSON HTTP uploads, library loads and backup verification use strict UTF-8 decoding; malformed bytes are rejected rather than silently replacing bookmark text. Mutations use serialized, validated file writes that flush new file bytes before atomic replacement within **one** Node.js process. This reduces the window of data loss from an interrupted write but is not a guarantee of power-loss durability on every filesystem (the containing directory is not fsynced). Backup data and SHA-256 manifest files are created with restrictive file permissions, flushed before verification, and incomplete pairs are cleaned up if snapshot creation fails. Backups are not encrypted; protect the storage and backup folders using restrictive filesystem permissions. Create a timestamped snapshot and paired `.sha256` manifest with `npm run backup` (set `GCB_DATA_FILE` and `GCB_BACKUP_DIR` as appropriate). Keep both files together.

Verify and recover a backup **without overwriting the running library**:

```bash
npm run verify-backup -- /path/to/bookmarks-backup.json
npm run restore-backup -- /path/to/bookmarks-backup.json /path/to/NEW-library.json
```

The restore command verifies the checksum and complete v1 record structure, writes the verified bytes into a **new, non-existing file**, and fails rather than replacing an existing file. To use the recovered file, **stop the existing server**, make another backup of the active database, and point `GCB_DATA_FILE` at the newly restored file for a new process. Verify the recovered library before considering any manual cutover. The automated tests include restarting a separate server against a restored file and checking bookmarks/collections through the authenticated API. The checksum protects against accidental corruption; an attacker with write access to both files can recompute it. This is not disaster-recovery certification, encrypted backup, or unattended scheduling.

The API JSON export supports migration and collection-aware additive imports, but import does not restore historical IDs and timestamps; standard HTML export preserves only links and titles.

### Single-writer startup and unclean shutdown

On startup, the server acquires an exclusive `GCB_DATA_FILE.lock` file beside the resolved JSON data path, using private permissions. A second server for the same library fails to start rather than racing to overwrite its data. Existing-library symlink aliases resolve to one canonical path and therefore share the same lock. A normal `SIGINT`/`SIGTERM` shutdown waits for active requests before releasing the lock. The server intentionally **does not automatically steal or discard a lock after a crash**, because process IDs can be reused and two concurrent writers can destroy data.

If a start fails with **Library is locked**, inspect the `.lock` JSON metadata and confirm **all** GoreeCloud Bookmarks server processes using that library are stopped. Make a verified backup of the library and only then, if the lock is conclusively abandoned, manually remove **only** the matching `.lock` file and restart. Never remove the data JSON as part of lock recovery. If unsure, leave the lock in place and investigate. A force kill, power loss, or machine crash can leave the lock behind; no automated cleanup or cross-host lease is claimed.

**Security boundaries:** A private sidecar lock (`GCB_DATA_FILE.lock`) now prevents cooperative server processes from writing the same canonical JSON library simultaneously. This is deliberately single-writer, not a multi-process database or a distributed lock. Do not manually remove a lock while any writer might still run. Do not expose the Node HTTP server directly on the public internet. For remote access, place it behind a properly configured **HTTPS reverse proxy** with additional authentication/controls as appropriate. Never store your real access token in the repository, a public URL, or logs. The operator access token is entered for each unlock and is **not** stored by the browser or extension. Browser `sessionStorage` retains only a server-issued, revocable eight-hour session; extension `chrome.storage.session` retains only its independent session. Lock/Forget clears local state first and attempts remote revocation, but network failure can leave a session active until expiry, and already-accepted server requests may complete. All sessions are cleared on server restart. The operator token is **not revocable through the session API**; rotate `GCB_AUTH_TOKEN` and restart the server to invalidate a compromised operator credential. A legacy programmatic client may still authenticate directly with that operator token. The service does **not** currently provide individual user identities, granular sharing authorization, per-user request quotas, at-rest encryption, encrypted backups or production-grade audit logs. It limits failed bearer-token authentication attempts per direct connection IP in memory (10 failures per minute, then HTTP 429 with Retry-After); it does not substitute for reverse-proxy protection or a production identity provider.

Saved web links are treated as untrusted data. The server does not automatically visit saved URLs, preventing introduction of a generic SSRF-capable fetcher at this stage. Stored titles and notes are inserted into the interface as text, not parsed as HTML. User-provided links are constrained to HTTP(S).

### Offline SQLite migration preview (not activated)

A new opt-in **offline** `npm run sqlite-migrate -- plan|migrate|inspect|export` tool can validate a JSON-v1 source, create a private **new** SQLite snapshot with indexed collections, bookmarks, tags, and metadata, check database integrity, and export a JSON-v1 copy into another **new** file. It does **not** change the running server or its JSON storage. The built-in `node:sqlite` API is experimental on Node 22; source size is limited to 64 MiB and any real cutover requires independent recovery testing and approval. See [Offline SQLite Migration](docs/SQLITE_MIGRATION.md) for commands, no-overwrite behavior, limits, and restoration guidance.

## API reference

All `/api/` routes require an `Authorization: Bearer YOUR_TOKEN` header.

| Method | Route | Description |
| --- | --- | --- |
| GET | `/health` | Minimal public liveness check |
| POST | `/api/auth/session` | Operator credential only: mint a memory-only eight-hour session (201 with opaque `token`, `expiresAt`) |
| POST | `/api/auth/revoke` | Issued session credential only: invalidate that one session |
| POST | `/api/auth/revoke-all` | Operator credential only: invalidate all issued sessions |
| GET | `/api/library` | Return entire library snapshot |
| GET | `/api/bookmarks` | Search bookmarks with validated query parameters and pagination |
| POST | `/api/bookmarks` | Create a bookmark |
| PATCH | `/api/bookmarks/:id` | Modify bookmark properties or restore from trash |
| DELETE | `/api/bookmarks/:id` | Move a bookmark to Recently deleted |
| POST | `/api/collections` | Create a collection |
| PATCH | `/api/collections/:id` | Rename a collection |
| DELETE | `/api/collections/:id` | Delete collection, move its bookmarks to inbox |
| POST | `/api/import` | Import `{ "bookmarks": [...] }` batch, skip invalid/duplicate items |
| POST | `/api/import/preview` | Legacy: validate and simulate one batch of up to 500 links without writing data |
| POST | `/api/import/full/preview` | Validate/estimate an entire file of up to 10,000 links without writing; returns a SHA-256 state revision |
| POST | `/api/import/full` | Save an entire validated import in one file transaction; requires `baseRevision` from preview, otherwise 428; stale preview returns 409 |
| GET | `/api/export` | Download complete library JSON |
| GET | `/api/export/html` | Download standard Netscape bookmark HTML |

For `GET /api/bookmarks`, supported optional parameters are `q` (metadata/notes/tags substring, max 200 characters), `tag`, `collectionId` (`none` for unfiled), `status` (`unread|reading|read`), `favorite`, `pinned`, `trash` (each `true|false`), `sort` (`newest|oldest|title`), `limit` (1-100, default 30) and `offset` (0-1,000,000). It returns `{ "items": [...], "total": number, "limit": number, "offset": number }`. This is metadata search, **not** AI/full-text webpage search. Unknown, duplicated or invalid filters return 400.

The browser import flow now previews **all** supported links and requests confirmation before saving. The commit requires the exact `revision` returned by `POST /api/import/full/preview` as `baseRevision`, checked inside the serialized write transaction. A library change between preview and commit yields HTTP 409 without saving any imported records; review the changed library and preview again. The complete file is written in **one** atomic replacement. Duplicate/unsafe individual links are **skipped and counted** (they do not cause strict all-or-nothing semantic rejection); invalid global input such as ambiguous collection IDs rejects the transaction. The revision is a conflict detector, **not** a secret, signature or authentication credential.

Ordinary API JSON request bodies remain limited to **1 MiB**, and legacy `/api/import` and `/api/import/preview` requests remain capped at **500 bookmarks**. The two `/api/import/full` endpoints accept up to **8 MiB** JSON, **10,000** links and **200** collections per request. Browser input files are capped at 8 MiB, and JSON serialization may itself exceed the HTTP body cap. Larger files require deliberate offline splitting or a future streaming import implementation; they are **not** silently partially imported. Invalid inputs return 400, stale revisions 409, and missing preview revisions 428.

## Maturity and roadmap

**Not yet implemented:** Multi-user identities, scoped permissions, production SSO/MFA, and secure remote session governance; Saved full-page HTML/PDF/screenshot archives, automatic metadata fetch, OCR, RSS ingestion, AI tagging/summarization/semantic search, knowledge graph, annotations/highlights, Firefox/Safari extensions, native Android/iOS/desktop apps, cross-device sync, multi-user accounts and collaboration, encrypted collections, reminders, automated link health, or remote production deployment. These are tracked as requested capabilities in [Feature Catalog](docs/FEATURE_CATALOG.md) and [Roadmap](docs/ROADMAP.md), not described as already shipping.

The first release is intentionally **single-instance and single-user**. Next priorities are a real-world extension acceptance check, database migration, scheduled backup/restore drills, identity, full-page archiving with SSRF mitigations, and full-text indexing. Any public deployment requires a separate security, accessibility, operational and visual acceptance process.

## Verification

The source includes an automated Node.js suite for URL safety, validation, export escaping, validated atomic persistence, checksum-backed snapshot recovery, restored-server HTTP smoke tests, authenticated CRUD, and import. Run it with `npm test`. See [Validation and Constraints](docs/VALIDATION.md) for observed results and remaining gaps. **Passing tests are not evidence of production security or release readiness.**

## License and provenance

Licensed under **MIT**; see [LICENSE](LICENSE). Implementation source is original GoreeCloud code and contains no copied Linkwarden, Karakeep, or Raindrop.io code. No third-party runtime dependencies are present. The design uses verified first-party GoreeCloud UI semantic reference values. Third-party product comparisons are planning inputs only and are not licensing or product-identity claims.
