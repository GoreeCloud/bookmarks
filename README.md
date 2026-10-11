# GoreeCloud Bookmarks

**Capture first. Preserve what matters. Find it again.**

GoreeCloud Bookmarks is a GoreeCloud-owned bookmark and digital-resource platform in **Fork-to-Native Development**. This repository imports Linkwarden as a compatibility and feature foundation while a native GoreeCloud product is progressively built around independently governed security, privacy, APIs, storage, identity, collaboration, archiving, and the Glaze Design & Experience System.

> **Development only.** This imported and partially transformed code is **not** a completed native implementation, Glaze-conformant consumer, security-qualified deployment, or Stable product. No production deployment has been authorized.

## Current foundation

The imported monorepo contains Linkwarden's Next.js/TypeScript web experience, APIs and Prisma data layer, browser extension, mobile source, background worker, and archive/preservation capabilities. These are **inherited**, not newly verified GoreeCloud capabilities. The first GoreeCloud change establishes product provenance, removes potentially unsafe inherited CI publishing jobs, begins a Glaze-aware web-shell modernization, and adds testable source-boundary checks.

Development priority: preserve functional bookmark capture, collections, tags, full-text search, preservation, reading, annotations, and collaboration while methodically replacing inherited code. No upstream cloud account, subscriptions, analytics, or marketing dependencies may be assumed appropriate for the GoreeCloud product.

## Source & legal information

- **Upstream:** [linkwarden/linkwarden](https://github.com/linkwarden/linkwarden)
- **Imported source commit:** `952ac4540657cae3a67c3ca59433899d2fda8374` (October 11, 2026 acquisition)
- **GoreeCloud target:** `GoreeCloud/bookmarks` — an independently owned repository, not a maintained GitHub fork
- **Upstream license:** GNU Affero General Public License v3.0 (`LICENSE.md`); existing third-party notices and obligations remain in force
- **Development approach:** governed Fork-to-Native, with an explicitly required Native exit
- **Design target:** Glaze V1.7 / 1.7.0 current Stable/Anchor; adoption is **not** yet accepted
- **Source of truth:** this repository for new implementation; preserve existing `GoreeCloud/goreecloud-bookmarks` until an independently verified consolidation/migration decision

See [UPSTREAM-PROVENANCE.md](UPSTREAM-PROVENANCE.md), [FORK-TO-NATIVE.md](FORK-TO-NATIVE.md), and [docs/GLAZE-ADOPTION.md](docs/GLAZE-ADOPTION.md).

## Running in an isolated development environment

The imported application is **not yet approved for deployment**. When evaluating it, use only synthetic accounts/bookmarks, a disposable PostgreSQL database and archive volume, isolated network access, and the upstream development prerequisites. Do **not** connect production data or secrets. `package.json` still uses upstream workspace identifiers intentionally until internal import paths and database/package contracts can be migrated safely.

Use the committed CI source-boundary checker as a limited first gate:

```sh
python3 scripts/check_foundation.py
```

This check is **not** a substitute for the complete app build, authenticated end-to-end workflow, dependency audit, security testing, Glaze acceptance, or backup/restore validation.

## Current gates

- [x] Import legal upstream foundation and retain attribution/license.
- [x] Establish GoreeCloud identity on core web shell and PWA metadata.
- [x] Remove inherited GitHub release/publish workflows from active tree.
- [x] Add a bounded static regression check for the transformation boundary.
- [ ] Audit and remove upstream subscriptions, billing, promotions, trackers, and network destinations without disabling legitimate features.
- [ ] Implement and verify Glaze V1.7.0 runtime/experience conformance across supported screens and states.
- [ ] Verify authentication, tenancy boundaries, SSRF-safe fetch/archiving, file upload handling, and secure defaults.
- [ ] Decide and implement compatibility with the existing native Go/PostgreSQL service; verify import/migration and rollback.
- [ ] Complete dependency audit, clean-room test environment, full unit/integration/E2E/accessibility, and release readiness.
- [ ] Rebuild native desktop, Android, and iOS experiences and applicable GoreeCloud platform integrations.

See [FORK-TO-NATIVE.md](FORK-TO-NATIVE.md) for risk-based milestones and exact acceptance boundaries.
