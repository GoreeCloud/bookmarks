# GoreeCloud Bookmarks — Functional Capabilities

**Status:** Product requirements / implementation scope. A checked capability below means a development-preview feature was implemented and tested to the extent described in VALIDATION.md; unchecked capabilities are plans and are **not** currently available.

## Current implementation — v0.1.22

- [x] Save, edit and open web bookmarks (HTTP/HTTPS only)
- [x] Titles, descriptions and personal notes
- [x] Tags, clickable tag filtering and unfiled inbox
- [x] Create, rename and delete collections
- [x] Favorites, pinned links and reading status
- [x] Recently deleted view and restoration
- [x] Search titles, URLs, notes, tags and descriptions loaded in the client
- [x] Authenticated REST metadata search with validated tag, collection, reading, pin, favorite and trash filters, sorting and paginated responses (maximum 100 per request)
- [x] Filter by collection, favorites, reading status and trash
- [x] Sort by newest, oldest and title; grid and list layouts
- [x] Import bookmark HTML and compatible JSON with collection name mapping; authenticated read-only import preview and browser confirmation before importing; export full JSON and bookmark HTML (whole-file preview/commit is one persistence transaction for up to 10,000 links and 8 MiB, with stale-revision rejection; invalid individual links are skipped and counted)
- [x] Duplicate URL detection and safe removal of common tracking parameters
- [x] Explicit tab-lock action that clears credentials, cached library and rendered data on manual lock or rejected credentials; best-effort server revocation of the current issued session
- [x] Local self-hosted authenticated API and persistent storage; memory-only eight-hour individually revocable browser/extension sessions, with separate operator secret and 32-session cap; server rechecks sessions before mutating after slow requests or writer-queue delays (not multi-user identity or production SSO)
- [x] Responsive desktop and mobile web layout with light/dark modes
- [x] Basic HTTP hardening, strict UTF-8 JSON decoding on uploads, persisted libraries and backups (reject malformed bytes without silently altering text), unsafe-scheme rejection, no server-initiated web fetch
- [x] Fail-closed loopback-only IP listener by default (non-loopback requires explicit `GCB_ALLOW_NON_LOOPBACK=1`), plus a default loopback Host-header allowlist with explicit exact-host `GCB_TRUSTED_HOSTS` opt-in for reverse-proxy configuration (not full DNS-rebinding or production security certification)
- [x] Local bounded-memory failed-authentication throttling with HTTP 429 and Retry-After (not distributed production protection)
- [x] Local snapshot backup with paired SHA-256 manifest and non-destructive verification (`npm run backup` / `npm run verify-backup`)
- [x] Private canonical-path single-writer guard for JSON data, with fail-closed crash lock and verified graceful release (not distributed multi-instance support)
- [x] Validated, non-overwriting local restoration into a new file (`npm run restore-backup`); restored-library startup and authenticated HTTP reads tested (not disaster-recovery certification)
- [x] Experimental Chromium MV3 extension for active-tab capture, tags, and collection selection, localhost-only (not device-validated)
- [x] Opt-in SQLite development storage adapter with atomic transactions, verified rollback, local restart, and separate offline, checksum-backed SQLite backup/restore (JSON remains default; no production migration)
- [x] Automated Node.js API, schema validation, storage, backup and recovery tests

## Full intended product scope

### Capture and bookmarks
- [ ] Production-ready browser extensions for Chromium, Firefox and Safari where feasible (Chromium localhost-only preview exists)
- [ ] Browser context-menu capture; save tabs, multi-tab sessions and highlights
- [ ] Operating-system share-sheet and mobile app integrations
- [ ] Automated and privacy-controlled metadata, thumbnails and favicons
- [ ] Advanced duplicates, URL redirect and dead-link detection
- [ ] Custom cover images, bulk edit, bulk movement and rich bookmark activity history

### Organization and collections
- [ ] Nested folders and collection hierarchies
- [ ] Saved smart filters and organization rules
- [ ] Automatic tag merging, bulk tagging and content-type filters
- [ ] Customized collection icons/covers and curated resource directories

### Archival and preservation
- [ ] Isolated webpage capture worker with SSRF, redirect, DNS and size protections
- [ ] Safe HTML snapshots, screenshots, PDF output and reader extraction
- [ ] Archived version history, change detection and retention controls
- [ ] Offline archives and local/S3-compatible storage with per-format quotas
- [ ] Wayback Machine integration and consent-based archive submission
- [ ] Supported video archiving and authenticated client-side capture safeguards

### Reading and annotations
- [ ] Distraction-free reader with adjustable typography
- [ ] Offline reading caches and resume position
- [ ] Text highlights, colored annotations and notes attached to passages
- [ ] PDF/EPUB highlighting and exports with source links
- [ ] Per-bookmark reminders and reading progress sync

### AI and knowledge management
- [ ] Optional local model support and user-consented external models
- [ ] AI tagging, categorization, summaries, research digests and collection suggestions
- [ ] Semantic/hybrid search, AI Q&A and cited source retrieval
- [ ] Related-knowledge graph, duplicate concepts and research projects
- [ ] AI agent integrations with restricted MCP access

### Files and media
- [ ] Upload and preview PDFs, EPUBs, images and supported office documents
- [ ] OCR, text extraction, document indexing and appropriate quotas
- [ ] File attachment versioning, deduplication and secure scanning

### Search and feeds
- [ ] Indexed full-text search across saved webpages, archives, notes and documents
- [ ] Saved advanced searches, filter operators and optional transcript indexing
- [ ] RSS/Atom subscriptions, ingestion queues and rules
- [ ] RSS publishing for eligible public collections

### Collaboration
- [ ] Multi-user identities, production session governance and scoped API credentials (revocable single-owner development sessions exist)
- [ ] Private shared libraries, viewer/contributor/admin permissions
- [ ] Invitation lifecycle, access expiration, public collections and embeds
- [ ] Permission-aware search, archiving, AI access and private annotations

### Apps and integrations
- [ ] Native Android, iOS, Windows, macOS and Linux support as appropriate
- [ ] Cross-device sync, conflict resolution and selective offline data
- [ ] Integrations with GoreeCloud Browser, GoreeCloud Browser Mobile, GoreeCloud AI and GoreeCloud Search
- [ ] GoreeCloud Mesh interoperability subject to GoreeShield/Wardveil policies
- [ ] Automation integrations for Obsidian, Readwise, RSS clients, n8n and similar providers where authorized
- [ ] Webhooks, developer SDK and documented versioned APIs

### Privacy, security and operations
- [ ] Strong identity and MFA options; scoped sharing authorization
- [ ] At-rest/E2EE collection options with honest indexing trade-offs
- [ ] Secure backup/restore automation and verified disaster recovery
- [ ] Observability, structured security events and rate limiting
- [ ] Large-library database migration, indexing and scalability validation
- [ ] Accessibility audits, native-device visual acceptance and deployment gates

## GoreeCloud pillars

- **GoreeShield — privacy:** consent, retention, minimization and sharing governance.
- **Wardveil — cybersecurity:** safe capture, scanning, vulnerabilities, access policy and incident controls.
- **GoreeCloud Mesh — integration:** authorized interoperability and event-driven workflows.
- **GoreeCloud UI — design language:** semantic tokens, premium responsive design, accessible stateful components.

The capability backlog is not evidence of implementation. Complete milestones require code, tests, readback and security review before status changes.
