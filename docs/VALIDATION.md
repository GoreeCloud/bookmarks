# GoreeCloud Bookmarks — Validation and Constraints

Local source verification for the v0.1.21 SQLite compatibility and header-integrity milestone, November 8, 2026.

## v0.1.21 SQLite file-header identity and version guard

- `npm run check` and **68/68 local Node tests** passed with Node 22.16.0. The new tests verify application ID and file schema version on new and offline-migrated databases; backward-compatible zero-header v0.1.20 files are read without mutation, while future versions and foreign/mixed headers are rejected.
- These checks are non-destructive disposable tests, not real-library migration, crash/power-loss certification, encryption or rollback of future schema upgrades. JSON remains default and the SQLite backend stays explicitly opt-in. GitHub CI and merge require independent readback.

## v0.1.20 offline backup canonical lock and unchanged-row efficiency

- Offline SQLite backups now acquire and hold the existing canonical exclusive server writer lock through source validation, snapshot copy, checksum verification, publication and cleanup. A symlink-alias backup cannot bypass an active writer; destination errors release the backup-owned lock. Existing and abandoned locks are not automatically stolen or deleted.
- SQLite edits with unchanged bookmark/collection ID order now update only modified rows. Reorders/inserts/deletions still relocate unique ordinals atomically; simulated SQL trigger failure during reorder causes a complete rollback. No changes to JSON default behavior or the published SQLite v1 schema.
- **66/66 local Node tests** and `npm run check` passed, including two new offline-backup tests and one unchanged-row/rollback test. A synthetic 10,000-record profile on this development host measured about 215 ms insert, 74 ms single edit and 177 ms reopen after the change, versus ~295 / ~280 / ~262 ms on a prior single run. These are uncontrolled single-run observations, not release performance SLAs or target-hardware acceptance.
- Live extension acceptance, real power-loss recovery, production database migration, encryption, backup retention and off-site copies remain open.

## v0.1.19 optional SQLite runtime and offline backup/restore (new)

- Explicit `GCB_STORAGE_BACKEND=sqlite` with a private `.sqlite`/`.db` path chooses a separate new/previously validated database; no JSON library is migrated or replaced without an explicit separate offline command. Existing default JSON-backed API behavior is preserved.
- Runtime serializes SQLite mutations and updates the schema's ordinal, indexed, tag, payload and metadata tables in one transaction. Invalid records, database-injected write failures, duplicate IDs and bad references fail closed with no partially committed records or cached state divergence. Local app-API restart and SIGKILL recovery were tested on disposable paths; an unclean shutdown leaves the existing fail-closed `.lock` requiring verified manual intervention.
- Offline SQLite backup uses the built-in SQLite backup API to a private candidate file, verifies the snapshot and SHA-256 pair, and restores only to a new destination. It refuses a locked live writer, altered checksums and overwriting existing targets. No automatic off-site backup, encryption, scheduled rotation, or power-loss certification exists.
- 11 new tests in `tests/sqlite-store.test.mjs` and `tests/sqlite-backup.test.mjs`; full v0.1.19 Node suite and CI results are recorded separately. The former 52-test v0.1.18 checkpoint remains historical evidence. The only browser acceptance attempted remains `ERR_BLOCKED_BY_ADMINISTRATOR` against the disposable loopback server; issue #2 stays open.

## v0.1.18 offline SQLite migration (new)

- Tested Node 22's built-in experimental `node:sqlite` module with a new read-only plan, transactionally built 0600 SQLite snapshot, `integrity_check`, `foreign_key_check`, payload-column match verification and no-overwrite JSON export. The normal server is still JSON-backed and no production data was accessed.
- Six new tests check untouched source and preexisting destinations, Unicode/IDs/tags/record order round-trip, invalid UTF-8/duplicate IDs/dangling collections, modified SQLite indexed columns, 1,201-record new-process inspection, and all CLI commands. Migration uses only disposable test data.
- See [Offline SQLite Migration](SQLITE_MIGRATION.md) for explicit no-cutover limits, tested runtime version and remaining crash, durability, encryption, backup and database service gates.
- An actual unpacked Chromium extension test against a disposable 127.0.0.1 server was attempted with Chromium 144 and Playwright, but the browser returned `ERR_BLOCKED_BY_ADMINISTRATOR` on localhost navigation. No extension worker was observed. This **does not pass** real-browser acceptance; GitHub issue #2 remains open. The server itself started on loopback and was stopped, and the test profile was discarded.

## Automated checks

- Node.js 22 syntax checks: passed for server, core, authentication guard, revocable sessions, store, schema, backup, SQLite migration, browser client, and Chromium extension modules.
- Fifty-two tests: passed (46 existing plus six offline SQLite migration tests). Coverage includes unsafe URL rejection, tracking URL cleaning, input limits, tag normalization, duplicate normalization, HTML export escaping, serialized atomic JSON persistence, rollback of rejected mutations, verified SHA-256 snapshot backups, strict v1 library validation, no-overwrite restore CLI, separate-server authenticated recovery, HTTP requests, collection/bookmark CRUD, import deduplication, trash/restore and security headers.
- Browser client in offline/mocked Chromium: desktop and mobile rendered with sample bookmarks, and desktop interaction flows (unlock, create collection, save bookmark, search, mark read, soft-delete, restore) plus mobile collection selection completed with no JavaScript errors. These use mock API responses; the separately tested HTTP API runs under Node fetch.

## v0.1.17 strict UTF-8 integrity checks

- One dependency-free parser (`src/json.mjs`) uses `TextDecoder('utf-8', { fatal: true, ignoreBOM: true })` and `JSON.parse`. It preserves genuine multilingual characters but rejects invalid UTF-8 bytes and a leading UTF-8 BOM instead of silently coercing stored or uploaded content.
- The parser is used for authenticated JSON requests (400 on malformed body), persisted library startup and checksum-backed backup verify/restore. A valid SHA-256 manifest alone is not sufficient to accept an undecodable backup.
- A new three-test suite verifies valid Unicode, malformed request uploads for create/legacy/full import, fail-closed startup with a corrupt existing file, and refusal to restore a malicious/malformed but checksum-matched snapshot. The live library bytes and unauthorized restore destination remain unchanged.
- `npm run check` and **46/46 Node tests passed locally** on Node 22.16.0. The optional mocked Chromium session harness passed with `GCB_CHROMIUM_PATH=/usr/bin/chromium`. These checks do not verify a production deployment, real extension installation, remote HTTPS exposure or all filesystem failure scenarios.

## v0.1.16 fail-closed server binding

- `validateBindHost()` requires literal IPv4/IPv6 addresses. Default startup accepts only `127.0.0.1` or `::1`, independent of the request `Host` allowlist. All other bind addresses require the explicit `GCB_ALLOW_NON_LOOPBACK=1` setting; DNS hostnames are rejected even with opt-in, preventing ambiguous name resolution.
- Unit tests cover allowed loopback binds, rejected wildcard/external/hostname binds, malformed opt-in values, and literal-IP opt-in. An actual child-process startup test with `HOST=0.0.0.0` checks nonzero exit and verifies the library and `.lock` were never created.
- `npm run check` and **43/43 automated tests** passed with Node.js 22.16.0 on the development source. This does not assert that exposing the server remotely is secure or production-approved. The previous isolated Chromium browser checks are historical and were not repeated for this backend-only change.

## v0.1.15 legacy preview revocation and JSON media-type checks

- After the request body is read, the legacy `POST /api/import/preview` now rechecks the issued session before examining private bookmark metadata. A revoked session is denied with 401 even if it was valid when an intentionally slow upload began. Existing full-file preview and mutation revalidation remain in place.
- `readJson` now accepts only `application/json` and optional UTF-8 charset parameters, case-insensitively, rejecting JSON-like media-type prefixes, unsupported charsets and additional parameters with 415. No new content types or remote integration are enabled.
- HTTP regression tests exercise revoked slow legacy preview and malformed/valid media types. Full test result reported separately from these targeted observations.
- Limitations remain: revocation cannot undo an already committed write, network-disconnected revoke attempts may fail, and operator credentials need out-of-band rotation. This does not establish a production identity or browser security audit.

## v0.1.14 revalidation of revoked credentials before late writes

- An already-authorized request may still be reading a chunked JSON body or waiting for an earlier file mutation. Server-side authorization now checks the issued session again inside the serialized mutation callback, and after reading private import-preview bodies.
- Raw HTTP tests hold JSON requests open, revoke the bearer token with a separate request, then finish the body. The collection creation, whole-file import and full-file preview return 401 and do not mutate the library.
- `npm run check` and **41/41** Node tests passed locally on Node.js 22.16.0. The optional isolated Chromium session harness passed with `GCB_CHROMIUM_PATH=/usr/bin/chromium` and mocked fetch/storage. This is not live browser-to-server or extension acceptance.
- A file write committed before session revocation is still durable and is not canceled/rolled back. Offline revocation may fail, and the operator token still requires out-of-band rotation when compromised. Remote exposure and production identity remain unsupported.

## v0.1.13 revocable sessions and minimized browser secret retention

- `POST /api/auth/session` requires the existing operator secret and issues a 256-bit, random, prefixed, opaque bearer with an eight-hour expiry. Only a SHA-256 token digest and expiry are stored in memory, never the raw issued token; at most 32 sessions are retained. Sessions do not survive a server restart.
- `POST /api/auth/revoke` invalidates the specified issued session (not the operator credential); `POST /api/auth/revoke-all` requires the operator credential and invalidates every issued session. Existing API callers using the operator credential remain backward compatible, so leakage of that secret still requires changing `GCB_AUTH_TOKEN` and restarting.
- Web unlock uses the operator secret once to mint a temporary session, stores only that session in tab `sessionStorage` and deletes the old `gcb-token` storage key. Lock clears private browser state synchronously and attempts server revocation with `keepalive`. Offline/rejected revocation remains unconfirmed until expiry. A session issued after a tab is locked is immediately discarded and a best-effort revoke is sent.
- Chromium extension now stores only the issued session in `chrome.storage.session`, deleting the old `gcbToken` key. Forget clears the local session and attempts server revocation. A real browser extension installation and live-network acceptance remain **unverified**.
- New Node unit and HTTP integration coverage exercises independent credentials, expiration, capacity, revoke/revoke-all, malformed tokens, and legacy operator compatibility. `npm run check` and **40/40 tests passed** locally. The updated optional offline Chromium mocked API harness passed stale-401, locked export, late issuance, and locked import-preview checks without JavaScript errors; this does not establish real-device or production security acceptance.

## v0.1.12 tab-session race hardening

- Browser `api()` captures the originating credential and session epoch before sending a request. It checks both after network response and after JSON decoding, so stale 401s cannot lock a newer unlock and stale successes cannot reach callers.
- New unlock submissions increment the epoch before reading the library. Successful unlocks persist the tab token and close the dialog only if the same attempt remains current. A delayed unlock response after Lock cannot reopen the tab.
- Browser exports validate session identity after reading the response body and before creating the download object URL. Import preview/confirmation checks the epoch again before prompting or committing.
- `npm run check` and **37/37 Node tests passed** on the local source. Two new structural regression tests cover the session checks.
- Optional offline `npm run browser-session-smoke` harness (Python Playwright + Chromium) passed scenarios: a stale 401 after a new unlock, an export finishing after Lock, a pending unlock resolving after Lock, and an import preview resolving after Lock. There were no JavaScript exceptions. The harness uses in-memory fake Storage and mock fetch; it is **not** real Chrome extension, real HTTP-to-browser or device acceptance.
- Superseded by the v0.1.13 memory-only session implementation below. The operator bootstrap secret is still accepted by legacy API clients and must be rotated out-of-band if compromised. Requests already accepted before server-side revocation can finish; failed revocation attempts remain unconfirmed.

## v0.1.11 full-file atomic import checks

- New `importWholeFile` stages 500-item chunks on a **detached draft**. It applies the resulting library only after all chunks succeed, and the authenticated HTTP commit persists it through **one** `store.mutate` call rather than a series of independently durable writes.
- New read-only `POST /api/import/full/preview` returns totals for up to 10,000 links and a SHA-256 revision of the current stored library. `POST /api/import/full` requires that revision (428 otherwise); it checks the state again **inside** the writer queue, rejects a stale revision (409), and leaves all imported data absent on conflict.
- Tests cover 1,201-item cross-boundary deduplication and collection associations, 10,001-item rejection, ambiguous duplicate imported collection IDs, rejected writes with no partial in-memory changes, and an actual authenticated 1,001-item HTTP preview/commit after a simulated intervening write. Full suite **35/35 passed** on Node 22.16.0.
- Legacy 500-item endpoints remain supported and unchanged; the browser now uses the bounded whole-file endpoints for JSON and HTML, capped at 8 MiB and 10,000 bookmarks. Per-link invalid URL and duplicate entries are intentionally **skipped and counted**, not a global import abort.
- Isolated system Chromium (`set_content` with mocked fetch and browser storage) exercised v0.1.11 whole-file Cancel and Continue for a 601-link JSON file at **1320 × 820** and **390 × 844**. Cancel sent a full-file preview without a commit; Continue sent the entire file and the matching revision as one commit. Both checks had no JavaScript errors or viewport-width overflow. This is **not** live-browser-to-server or real-device acceptance; Chromium live HTTP navigation remains restricted in this environment.

## v0.1.10 import-preview checks

- Added separate unit tests confirming that a preview operates on a clone, returns the same counts as actual import for an unchanged library, and rejects malformed or ambiguous collection data and oversized batches.
- HTTP integration checks verify that preview requires authentication, yields expected import/skip counts, rejects invalid collections, and does not change the stored library before actual import.
- Isolated desktop Chromium `set_content` with a mock API exercised the updated browser file-import flow: Cancel sends the preview request only; Continue sends the preview then import; no JavaScript errors. This is **not** a live browser-server or real-device test.
- The browser input preview covers at most the first 500 links. Other imports run as separate 500-item transactions, so the first-batch preview is not an exact full-file guarantee and failure of a later batch does not roll back prior batches.

## Limitations

- Live Chromium navigation to the loopback server was blocked by this execution environment, so a real live-HTTP end-to-end browser test was not completed. The HTTP API was tested independently via Node fetch.
- The offline Chromium rendering used mock API responses; it does not validate live API-browser integration or device-native presentation.
- The built-in server is intended for trusted local use and is not certified for production or exposed remote access.
- No production security assessment, penetration testing, external accessibility audit, database scalability test, or real-device acceptance was performed.
- A Manifest V3 Chromium extension source and pure capture/manifest tests are present. It has not been installed or validated in a live Chrome profile. No AI model, archive worker or background automation is present.

## Security design boundaries

- No server-side requests to saved URLs; SSRF surface is intentionally postponed.
- Bearer access token is required for all private endpoints; SHA-256 digests are timing-safely compared in memory. Repeated failed logins from a socket IP trigger a bounded in-memory rate limiter (HTTP 429 and Retry-After). This does not provide production-wide throttling across instances or proxy IP preservation.
- CSP blocks third-party script/resource sources and framing; dynamic bookmark content is inserted via textContent.
- The JSON store uses a single-process serialized mutation queue, private files and an exclusive canonical-path single-writer server guard. A second cooperative server is refused; this is not a multi-process database or a distributed lock.
- End-to-end encryption, per-user access controls and public deployment protections are future work.

## Repository synchronization

The source was developed locally through v0.1.10. The GitHub connector permitted repository inspection and creating a feature branch, but blocked writes to repository contents. Therefore no source commit, pull request, merge or deployment is claimed. A fresh source ZIP and Git patch for the source tree can be applied to the target repository after appropriate write access is restored. The application has not been pushed or deployed.

## v0.1.1 incremental changes

- Collection-aware JSON import: maps external collection IDs to existing or newly added local collections by name, preserving bookmark associations on additive imports; rejects invalid collection lists transactionally.
- Asset serving now resolves relative to the application module, not the caller’s process working directory. HTTP regression suite starts the server from a different directory.
- Local-only Chromium MV3 extension source: active-tab capture, tags, collection selection, session-scoped token, no content scripts or broad host access; browser-install behavior remains unverified.
- Twelve automated Node tests passed and syntax checks passed on November 6, 2026 in the local container using Node.js 22.16.0.
- Isolated Chromium offline interaction checks passed at desktop and mobile viewport sizes. Live browser navigation to localhost returned `ERR_BLOCKED_BY_ADMINISTRATOR`; no live HTTP browser end-to-end claim.

## v0.1.3 incremental changes

- Added authenticated `GET /api/bookmarks` search with `q`, `tag`, `collectionId`, `status`, `favorite`, `pinned`, `trash`, `sort`, `limit` and `offset`; defaults to 30 and caps page length at 100. Search only covers existing metadata, notes, tags and URLs, not remote or archived page contents. Unknown, duplicate or invalid filters are rejected.
- Introduced a dependency-free, bounded-memory fixed-window authentication guard: after 10 invalid authorization attempts from the same socket IP in one minute, further requests from that IP receive 429 until the window resets. This has in-memory state only. It is not an IP-based identity system and clients behind one proxy IP may share a window.
- Added unit and authenticated HTTP integration checks for search validation, source-specific throttling and 429 responses. The test suite increased from 12 to 15 passing tests.
- UI and Chromium-extension source remain unchanged from v0.1.1; prior mock browser evidence does not establish that new API additions were exercised in a live browser.
- Package creation, ZIP integrity and patch applicability are verified separately during handoff.

## v0.1.4 incremental changes

- Backup snapshots now include a paired `.sha256` manifest. `npm run verify-backup -- BACKUP.json` independently recalculates the checksum, validates the manifest format and checks the JSON schema without modifying the live database.
- Added a corruption regression test confirming checksum validation rejects altered backups while the live store remains intact. Sixteen automated Node tests passed.
- Backups remain unencrypted, and this does not validate the success of an actual restore; protect and store snapshots with strong filesystem controls.

## v0.1.5 incremental changes

- Added `npm run restore-backup -- BACKUP.json NEW_DATA_FILE.json`: verifies the paired checksum and JSON schema, writes to a new file using a temporary same-filesystem file plus an atomic hard link, and refuses to overwrite existing files. Live library replacement remains a separate, explicit operator process.
- Unified v1 library structural validation at store load, before mutations commit, and at backup/restore boundaries. Malformed, duplicate-ID and unsafe-scheme records are rejected before being persisted or restored.
- Added restore tests for exact recovered bytes, collection and bookmark associations, restrictive file modes, tampering, existing-destination rejection, invalid library content, CLI error paths, and startup of an independent HTTP server against a restored file. The suite passed 20/20 tests with Node.js 22.16.0.
- No automated production restore, encryption, remote browser acceptance, multi-process concurrency, cross-device sync or public deployment is claimed. Checksum files are not cryptographic signatures or tamper-evident against a malicious party with write access to both files.

## v0.1.6 incremental checks

- Import rejects repeated or blank source collection IDs before persisting changes, including when a batch includes valid bookmarks.
- Tab Lock and rejected authentication clear private browser state and UI DOM; late HTTP library responses are ignored after a lock.
- Static privacy assertions plus offline Chromium interaction checks complement the automated HTTP tests; they do not certify device-level or production security.
- Tag chip filtering and clear-filter controls were exercised in offline Chromium with a mocked library at desktop and phone dimensions.

## v0.1.7 incremental checks

- Updated the store write path to call `FileHandle.sync()` on its private temporary replacement before atomic rename. File durability is improved, but full power-loss guarantees depend on the filesystem, directory metadata persistence and proper backups.
- Backup creation now flushes both data and checksum files and removes incomplete newly created backup files if creation or verification fails; it does not alter the source data file.
- Configured explicit request/header/keep-alive timeouts on the local Node HTTP server. These do not replace reverse-proxy protections or a production DoS assessment.
- Verified new regression cases for private file permissions, unchanged persisted data after validation failure, no stray swap files, and verifiable private backup/manifest files.
- `npm run check` passed, the full test suite passed 24/24, and isolated Chromium privacy flows passed again at 1320 × 820 and 390 × 844 with mocked responses. No live API-in-Chromium or real-device acceptance is claimed.

## v0.1.10 incremental checks

- A strict HTTP Host-header policy now checks every request before `/health`, static files or authenticated APIs. Default exact accepted names are `localhost`, `127.0.0.1` and `[::1]`, with optional port. Unknown hosts return 421; no API token or private library data is returned.
- Operator-controlled `GCB_TRUSTED_HOSTS` allows explicit ASCII/punycode domain names for trusted reverse proxies, rejecting wildcards, suffix confusion, embedded schemes, ports in config, encoded loopback alternatives and malformed authorities.
- Host-policy unit tests and direct HTTP integration tests verify both rejection and legitimate loopback requests, including requests carrying valid bearer tokens with an unauthorized Host.
- `npm run check` passed and **31/31** automated tests passed on Node 22 locally. This mitigation is not an end-to-end DNS-rebinding security evaluation; remote deployment remains unverified.

## v0.1.8 incremental checks

- Added `src/lock.mjs` startup guard. `open(..., 'wx', 0o600)` grants one server a private sidecar lock for the canonical JSON path; another server using the same file exits without disturbing the first.
- The guard is acquired before opening the store and is released after graceful HTTP shutdown; startup failure during store parsing also releases an owned lock. A SIGKILL leaves the lock in place to avoid unsafe automatic stale-lock removal.
- Tests cover exclusive acquisition, restrictive permissions, conflict between two live servers, first-writer availability during the conflict, graceful restart, unclean shutdown refusal with data preserved through the restart, *manually verified* isolated-test recovery, and failed-startup lock cleanup. Existing-file symlink aliases resolve to the same lock.
- `npm run check` passed and the full local Node.js suite passed **29/29** on Node.js 22.16.0. Earlier isolated desktop/mobile Chromium UI tests remain the available UI evidence; this server-only update did not create a live-browser acceptance result.
- Still missing: multi-process database, robust crash/power-loss acceptance across filesystems, real-browser extension installation, GitHub CI on committed source, secure remote deployment, and production recovery drills.
