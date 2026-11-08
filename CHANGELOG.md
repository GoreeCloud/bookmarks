# Changelog

Release maturity: **development preview**. Versions below describe development milestones, not Stable releases. GitHub commits and CI must be verified independently.

## v0.1.19 — November 8, 2026 (opt-in SQLite runtime/recovery preview)

- Add optional, explicitly selected SQLite storage backend (`GCB_STORAGE_BACKEND=sqlite` with a private `.sqlite`/`.db` path) while leaving the existing JSON backend as the default. SQLite uses the same v1 JSON model, canonical single-writer lock, index-backed tables, transactional `BEGIN IMMEDIATE`/`COMMIT` and rollback, and preserves collection references, ordering and Unicode. `journal_mode=DELETE` and `synchronous=EXTRA` reduce sidecar complexity and strengthen rollback-journal durability in supported filesystems; no cross-host or production readiness is claimed.
- Add separate **offline-only** SQLite backup/verify/restore CLI with private 0600 files, SHA-256 manifests, SQLite backup API, content integrity checks and no-overwrite destinations. SQLite backup refuses a locked running data file; JSON backup commands remain JSON-only. Backups are unencrypted and require manual retention and verified local recovery.
- Add 11 new SQLite tests: API restart persistence, schema/permission safeguards, concurrent serialized writes, referential and ordinal updates, rollback after injected SQL error, SIGKILL/abandoned-lock recovery, offline backup integrity/restore, tamper and overwrite refusal, and backup refusal for locked sources. Original JSON tests remain unchanged. No live database migration, browser extension acceptance or production deployment.

## v0.1.18 — November 8, 2026 (offline SQLite migration development milestone)

- Add an opt-in, dependency-free **offline-only** `node:sqlite` JSON-v1 to SQLite converter with read-only planning, strict input validation, source digest tracking, private new-destination publication, FK/PK constraints, indexable metadata and ordered payload retention, SQLite integrity checks and reversible new-file JSON export. Existing JSON HTTP store is deliberately unchanged; Node 22's SQLite API remains experimental.
- Add six migration tests: no-write planning, lossless Unicode/IDs/tags/status/timestamp round trips, no-overwrite behavior, malformed UTF-8/duplicate IDs/dangling collection rejection, tampering detection, and 1,201-record restart/read-only inspection plus CLI coverage. Documentation clarifies this is **not** a live database migration or production adapter.
- The v0.1.17 original source was already merged via public PR #1 to `main` and passed post-merge GitHub CI; the new v0.1.18 changes are independent and require their own GitHub CI/review acceptance.

## v0.1.17 — November 8, 2026 (local development preview)

- Apply one strict, lossless UTF-8 JSON decoder to authenticated HTTP uploads, stored library startup and backup verification/restoration. Invalid byte sequences now fail closed instead of being silently replaced with Unicode replacement characters; UTF-8 JSON with Unicode titles and notes remains supported.
- Add three regressions for malformed upload bytes, invalid on-disk JSON and a checksum-matched backup containing malformed UTF-8. Verify no partial import or collection mutation and no overwrite of an existing library or creation of an invalid restore target.
- Local `npm run check` and **46/46 Node tests** pass. The optional isolated Chromium tab-session/privacy harness passed with system Chromium; its API and storage are mocked, not a live browser or extension acceptance.
- GitHub remains README-only. This ZIP and Git patch are local development handoffs, not a committed source, public release, or deployed service.

## v0.1.16 — November 6, 2026 (local development preview)

- Added fail-closed listener binding: the server starts only on literal loopback `127.0.0.1` or `::1` by default, preventing accidental exposure from `HOST=0.0.0.0`, `::`, external IP addresses or DNS hostnames.
- Non-loopback binding requires an explicit `GCB_ALLOW_NON_LOOPBACK=1` opt-in **and** a literal IP. It does not remove the independent strict Host-header check or establish public/TLS deployment readiness. Ambiguous opt-in values fail startup.
- Added policy tests and a real child-process startup regression verifying that rejected wildcard configuration does not create a data file or sidecar lock; `npm run check` and **43/43 Node tests** pass locally. No public GitHub source commit, CI, device acceptance or production deployment is claimed.

## v0.1.15 — November 6, 2026 (local development preview)

- Fixed a legacy import-preview authorization race: `POST /api/import/preview` now checks issued-session validity again after reading an upload, so a session revoked mid-upload cannot obtain private preview data. This closes the remaining legacy preview path not covered by the earlier full-file preview check.
- Strictly accept `application/json` request bodies, optionally with a UTF-8 charset parameter. Reject media-type prefix tricks such as `application/jsonp`, unsupported charsets and extra parameters with HTTP 415. Ordinary JSON clients remain compatible.
- Extended raw HTTP regression coverage for mid-upload legacy preview revocation and Content-Type validation. Full source remains local only; GitHub CI, real Chrome extension acceptance, production identity controls and deployment are not verified.

## v0.1.14 — November 6, 2026 (local development preview)

- Revalidate issued session credentials at the serialized mutation boundary, rather than trusting authentication that occurred before a slow request upload or while a write was queued. The operator bootstrap token behavior is unchanged.
- Recheck session validity after reading whole-file and legacy import previews so an upload completed after revocation cannot return private preview data.
- Added a raw HTTP integration test that deliberately leaves a JSON upload incomplete, revokes its session, and confirms collection creation, full-file import and private previews return 401 without data changes. Local automated suite: **41/41 passing Node tests**; `npm run check` passed.
- The optional isolated Chromium session-race harness passed with system Chromium. Its fetch and storage are mocked, not real browser-to-server acceptance.
- Revocation does not roll back a write committed before revocation; an offline revoke may remain unconfirmed until the session expires. No GitHub source commit, CI, device acceptance or production deployment is claimed.

## v0.1.13 — November 6, 2026 (local development preview)

- Added eight-hour, revocable, memory-only single-owner sessions minted from the existing operator bearer token. Issued tokens are opaque 256-bit random values, stored only as SHA-256 digests on the server; up to 32 active sessions. Server restart invalidates all sessions.
- Added authenticated session mint, individual revoke and operator-only revoke-all endpoints. Legacy API use of the operator credential remains supported. The operator credential is not changed/revoked by session endpoints and requires an out-of-band configuration change plus restart to rotate.
- Browser tab and experimental Chromium extension now store only issued temporary sessions, removing legacy operator-token storage keys on startup. Lock and Forget clear local state first and attempt server revocation. Offline revocation remains unconfirmed; in-flight server writes may finish.
- Expanded unit/HTTP coverage to 40 passing Node tests; updated the offline Chromium session-race regression harness to verify late issuance and best-effort revocation. Source remains a development preview with no GitHub commit, CI, real-extension acceptance or deployment.

## v0.1.12 — November 6, 2026 (local development preview)

- Bound every browser API response to the tab session epoch and bearer token that initiated it. A stale HTTP 401 cannot lock a newer successful session, and stale JSON data cannot be applied after the tab is locked or re-unlocked.
- Invalidated earlier unlock attempts when a new unlock is submitted. A delayed successful response cannot close the unlock dialog after a subsequent Lock action.
- Prevented an in-flight private JSON/HTML export from triggering a download after locking, and blocked an in-flight import preview from prompting for confirmation or committing after the session changes.
- Added two dependency-free Node structural/regression checks and an **optional** fully offline Python Playwright Chromium race harness. `npm run check` and **37/37 Node tests** pass; isolated Chromium checks cover old-token 401, post-lock export, late unlock and post-lock import preview. This is not production or live browser acceptance.
- No GitHub commit/CI, real-device acceptance, server token revocation, or Stable release is claimed.

## v0.1.11 — November 6, 2026 (local development preview)

- Added an authenticated full-file preview and atomic import API for up to 10,000 bookmarks and 200 collections, with an 8 MiB request cap. The existing 500-link batch API remains available.
- Preview returns a SHA-256 library-state revision; full import requires that revision and verifies it inside the serialized write transaction, refusing stale previews with HTTP 409 and missing revisions with HTTP 428.
- Browser HTML/JSON imports preview the **entire** supported file, then confirm and commit it in one persisted write; Cancel never writes. Duplicates and invalid individual links are counted as skipped, not treated as a global failure.
- Additional unit and HTTP tests verify cross-chunk deduplication, collection associations, no-write preview, revision conflict rejection and all-or-nothing persistence on global errors. Local Node suite: **35/35 passed**.
- No GitHub commit, server deployment, live browser-extension acceptance or Stable release is claimed.

## v0.1.10 — November 6, 2026 (local development preview)

- Introduced authenticated `POST /api/import/preview` to estimate imported/skipped links and created collections without persisting any changes. The real import and preview share identical input validation and duplicate/collection resolution code.
- The browser JSON/HTML import flow now shows a confirmation with the preview results before writing the first batch. Large files disclose that only the first 500 links are previewed and that later batches can fail after prior batches were saved.
- Added independent import-contract unit tests, unauthenticated-preview and no-mutation HTTP assertions, and isolated Chromium mocked-client checks of Cancel/Continue confirmation. The Node.js suite passed **33/33** locally.
- Full live browser-extension acceptance, GitHub CI on a pushed source commit, real-device acceptance and production readiness remain unresolved.

## v0.1.9 — November 6, 2026 (local development preview)

- Added a strict default loopback Host-header allowlist for the local Node server, including the public health and static routes. Unknown hosts fail with HTTP 421 before authentication or resource serving.
- Added explicit `GCB_TRUSTED_HOSTS` exact-name opt-in for trusted reverse proxies, with input validation rejecting wildcard/suffix tricks, malformed authorities, URL schemes, port-bearing entries, and noncanonical loopback encodings. No TLS, identity-provider, or production remote-access readiness is implied.
- Added pure host-policy regression tests and raw HTTP integration checks. Node.js syntax checks and **31/31 automated tests** passed locally.
- GitHub commit, GitHub CI, real-browser extension installation and production release are still unverified.

## v0.1.8 — November 6, 2026 (local development preview)

- Added an exclusive, privately permissioned single-writer lock file for each canonical JSON data path. Concurrent servers pointing to the same library now fail closed rather than racing to replace it.
- Normal SIGTERM/SIGINT shutdown drains active requests and releases the owned lock; crashes leave the lock in place for manually verified recovery. Existing-library symlink aliases share the same lock.
- Added lock ownership, permission, cross-server conflict, graceful restart, stale crash lock and symlink-alias regression tests. Full local Node.js suite: 29/29 passing.
- This safeguard is not a database, distributed consensus or crash-proof storage. Real-browser extension installation, GitHub commit/CI and production deployment remain unverified.

## v0.1.7 — November 6, 2026 (local development preview)

- File-store updates now flush replacement-file contents to disk before atomic rename; existing data remains unchanged when validation fails. This improves durability but does not assert guaranteed power-loss recovery on all filesystems.
- Snapshot creation now flushes both private backup data and its SHA-256 manifest before verification, cleaning up incomplete output pairs on error without touching the live library.
- Local HTTP server uses bounded request (30 s), header (15 s) and keep-alive (5 s) timeouts. Remote exposure remains unsupported without additional security work.
- Added storage and backup permission/persistence regression coverage. Node.js syntax checks, 24 automated tests and offline desktop/mobile privacy UI checks passed locally.
- GitHub source writes, CI validation on a pushed commit, live browser extension installation and production deployment remain pending.

## v0.1.6 — November 6, 2026 (local development preview)

- Explicit Lock this tab control clears the session bearer token, cached library, open editor dialogs and rendered bookmark metadata.
- HTTP 401 responses now lock and clear the client automatically. Delayed library responses cannot repopulate the client after a lock.
- Reject duplicate or blank external collection identifiers transactionally during JSON import; no ambiguous remapping or partial collection creation.
- Added HTTP regression and client privacy checks. No server-side token revocation or remote deployment is implied.
- Tag chips now filter the visible library, with keyboard-operable buttons, a visible active-filter label, and one-click clearing.

## v0.1.5 — November 6, 2026 (local)
- Added fail-closed v1 library validation on startup, backup inspection and before storage mutations commit.
- Added verified, non-overwriting restore command targeting a new file, with restrictive permissions and no live database replacement.
- Added recovery tests for checksum mismatch, duplicate destination, malformed data and startup of a fresh server using the restored library. Total: 20 passing automated tests.
- Retained local-preview maturity; no GitHub commit, deployment or production recovery claim.

## v0.1.4 — November 6, 2026 (local)
- Added paired SHA-256 manifests for backups and a non-destructive backup verification CLI.
- Added corruption regression coverage; automated suite reached 16 passing tests.

## v0.1.3 — November 6, 2026 (local)
- Added bounded, validated REST bookmark search for future integrations.
- Added an in-memory per-source failed-authentication throttle with HTTP 429 and Retry-After.
- Expanded automated test coverage to 15 passing Node tests, including HTTP-level verification.
- Improved API and security documentation.

## v0.1.1 — November 6, 2026 (local)
- Added collection-aware additive JSON imports and an experimental Chromium MV3 quick-capture extension.
- Fixed static asset lookup when the server is launched outside the repository directory.
- Added offline Chromium UI checks and tested backup/HTTP integration workflows.

## v0.1.0 — November 6, 2026 (local)
- Initial authenticated, self-hosted bookmark and collection API, private JSON persistence, imports/exports, and responsive GoreeCloud UI-inspired interface.
