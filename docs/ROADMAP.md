# GoreeCloud Bookmarks — Development Roadmap

This roadmap sequences a large requested product scope into maintainable, testable releases. No phase should be labeled Stable solely because code is merged. Public deployment requires independent security and operational approval.

## P0: Working private foundation (implemented locally through v0.1.17)

- Authenticated server with fail-closed literal loopback bind policy, an independent strict Host-header allowlist and minimal persistence (non-loopback binding is explicitly opt-in, not production approved).
- Bookmark and collection CRUD, tags, notes, read status and favorites.
- Tracking parameter cleaning, duplicate prevention and soft delete; strict UTF-8 JSON decoding at API and local persistence/recovery boundaries.
- Collection-aware additive JSON import/export, local UI search and bounded, filterable REST search, GC UI visual foundation, automated tests.
- Experimental Chromium MV3 active-tab saving extension (local server only; live installation test pending).

## P1: Hardening and trusted storage

- Choose a supported SQLite/PostgreSQL persistence layer with migrations and explicit single/multi-instance support; the local JSON store flushes replacement bytes before rename and now refuses a second cooperative server using a private single-writer lock, but it is still not a multi-process database or a distributed lock.
- Implement real user identities, operator-credential rotation, production session policies, secure recovery and distributed throttling. The local preview now issues individually revocable eight-hour browser/extension sessions (memory-only, capped at 32; all invalidated on restart); a lost operator secret still requires an out-of-band configuration change and restart. The v0.1.15 server rechecks session credentials before each store mutation and after slow preview-body reads; writes committed before revocation cannot be reverted. No multi-user permissions, MFA or production identity provider is implemented.
- Complete automated backup scheduling/rotation, restore drills and failure injection (checksum-backed restore to a new file, strict v1 schema validation and recovered-server HTTP smoke test now exist locally).
- Add database-backed pagination/indexes (bounded API search exists), accessibility checks and automated browser tests.
- Complete image/thumbnail policy, favicon handling and a purpose-built metadata fetcher with SSRF protections.

**Acceptance:** migrations reversible, backup restored, security boundary tested, 10,000+ bookmarks profiled, keyboard and touch journeys verified.

## P2: Preservation engine

- Background capture queues with isolated network access and resource limits.
- Safe HTML/SingleFile, PDF/screenshot/reader snapshots, immutable versions.
- Redirect, DNS rebinding, private address and oversized-download controls; HTML sandboxing.
- Storage quotas, retries, integrity hashes and archive lifecycle policies.

**Acceptance:** malicious URLs and untrusted archives fail closed, unavailable sites still load stored snapshots, preservation recoverable after restart.

## P3: Full-text, feeds and intelligence

- Full-text archive indexing and OCR where permitted.
- RSS subscriptions, polling intervals and deduplication.
- Optional locally hosted AI summaries, tagging and semantic search.
- Consent-controlled external model endpoints, source-backed Q&A, no default exfiltration.

**Acceptance:** privacy review, reproducible search relevance tests, retrieval honors access controls, AI is genuinely optional.

## P4: Collaboration and clients

- Multi-user collections, roles, invitations, permission-aware search.
- Extend browser capture extension to production-safe HTTPS origins, Firefox/Safari compatibility, signed packaging and release verification; native mobile and desktop integrations.
- Cross-device sync, offline collections, edit conflict policy and recovery tests.
- Public resource publishing with careful defaults.

**Acceptance:** authorization tests, mobile/desktop acceptance, sync conflicts resolved without silent data loss.

## P5: Ecosystem integration and maturity

- GoreeCloud Mesh APIs and event-based interoperability with GoreeCloud Browser, Search, AI and adjacent services.
- GoreeShield policy enforcement and Wardveil security event integration.
- Production observability, alerting, release packaging and security reviews.
- Full GoreeCloud UI visual and accessibility audits with current device screenshots.

**Acceptance:** documented dependencies, test evidence, privacy and security gates, a validated rollback plan and explicit release approval.

## Import safety follow-up

v0.1.11 now supports a bounded whole-file non-mutating preview and version-aware, single-write commit (8 MiB JSON and up to 10,000 bookmarks), while retaining the legacy 500-item batch API. A stale preview is rejected rather than committing against changed data; invalid individual bookmarks are counted as skipped, not treated as a whole-file abort. Future work: an explicitly designed streaming import format for larger files, more detailed per-link conflict review, and explicit rollback/undo for a completed import after the user changes their mind. Neither automated undo nor import files beyond the stated bounds are implemented.
