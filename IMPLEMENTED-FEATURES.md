# GoreeCloud Bookmarks — Implemented Features

> **Authority:** Repository-native implemented-feature record, seeded from existing `FEATURES.md`.

## GoreeCloud Bookmarks — Features

## Status

**Release lifecycle:** Development  
**Implementation status:** Go/PostgreSQL service and persistence foundation plus Firefox client source candidate implemented; no authenticated end-user bookmark-management feature is currently exposed.  
**Authority:** Planned feature scope is derived from `SPECIFICATIONS.md` and the canonical GoreeCloud Bookmarks project specification. Current verified capability is recorded in `CAPABILITIES.md`.

Inclusion in the planned catalog below does **not** mean a feature is implemented, validated, released, deployed, or production-ready.

## Current implemented Development foundation

The current source implements engineering service/data-foundation behavior:

- HTTP process-health route at `GET /api/v1/health`.
- Fail-closed readiness route at `GET /api/v1/ready`; readiness passes only for reachable PostgreSQL with exact-current migration history.
- Local-development service entry point with bounded HTTP timeouts and graceful shutdown.
- Explicit ordered/checksummed PostgreSQL migrations and initial Bookmark persistence relation.
- Owner-scoped internal bookmark create/read persistence; no bookmark-domain HTTP endpoint yet.
- Automated formatting, module-tidy, vet, unit/integration-test, and build validation for the Go/PostgreSQL foundation.
- Exact-revision CycloneDX SBOM generation and pinned `govulncheck` vulnerability scanning in fail-closed CI.
- Application-owned Firefox client source candidate under `clients/firefox/`; application-backed capture and runtime/signing acceptance remain blocked.

These are enabling runtime capabilities, not user-facing bookmark-management features.

## Planned capture and library

- One-click URL capture with immediate persistence before enrichment.
- Inbox-based capture-first workflow.
- Collections and nested collections.
- Tags, favorites, pins, Read Later, reminders, and snooze.
- Saved webpages, articles, documents, images, video, audio, files, notes, snippets, highlights, searches, feed entries, and archives.
- Multi-tab and browsing-session capture.
- Selection, image, and link capture from GoreeCloud Browser.

## Planned search and organization

- Metadata search across titles, URLs, descriptions, collections, tags, notes, and highlights.
- Full-content search across extracted and archived content.
- Search filters and power-user operators.
- Smart Collections and saved searches.
- Optional meaning-based retrieval and natural-language queries.
- Automatic tag, collection, summary, and related-item suggestions.
- User-defined automation rules.

## Planned preservation and reading

- Metadata-only, readable, visual-snapshot, and complete archive modes.
- Archive version history and change comparison.
- Isolated safe archive viewing.
- Link-health monitoring and Library Health views.
- Duplicate and canonical-URL detection.
- Optional tracking-parameter cleanup with provenance retention.
- Reader mode, reading progress, highlights, annotations, and lightweight research notes.

## Planned offline and synchronization

- Useful local client caches.
- Offline-selected bookmarks, collections, favorites, Read Later, and Smart Collections.
- Conflict-tolerant synchronization.
- Sync history and device visibility.
- Preservation of ambiguous conflicting edits for user review.

## Planned sharing and collaboration

- Private-by-default individual and collection sharing.
- Read-only archive sharing.
- Viewer, Contributor, Editor, Manager, and Owner collaboration roles.
- Collaborative activity history.
- Optional public curated collections with explicit metadata disclosure controls.

## Planned clients and integration

- Deep native GoreeCloud Browser integration.
- Web application.
- Desktop application.
- Mobile application and mobile share-target integration.
- Address-bar retrieval from the private bookmark library where enabled.
- Optional synchronization with conventional browser bookmarks.
- Cross-application GoreeCloud integrations where they improve user value without transferring domain authority.

## Planned privacy, security, and continuity

- Private-by-default access.
- Standard Private Library and optional Private Vault processing models.
- Normal private, Sensitive, Private Vault, and Shared privacy levels.
- Minimum metadata and external-request behavior.
- Explicit sharing and retention controls.
- Safe archive isolation.
- Import, export, backup, restore, and portability.
- Administration/content-access separation.

## Planned rediscovery and discovery

- Related bookmarks.
- On This Day.
- Forgotten Bookmarks.
- Random Bookmark.
- Related Discovery.
- Weekly Review.
- Optional feed following.

## Planned accessibility and operation

- Keyboard-first desktop/web operation and command palette.
- Screen-reader support, logical focus order, scalable text, reduced motion, high contrast, large touch targets, and non-color state indicators.
- Storage usage and cleanup controls.
- Processing-queue, indexing, synchronization, notification, and link-health observability.

## Current verified capabilities

See [`CAPABILITIES.md`](CAPABILITIES.md). At the current Development foundation, no end-to-end end-user feature in the planned catalog above is verified as implemented; the Firefox source candidate does not change that boundary.
