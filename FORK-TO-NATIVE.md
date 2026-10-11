# GoreeCloud Bookmarks — Fork-to-Native transformation register

**Status:** Development / unqualified. **Upstream anchor:** `952ac4540657cae3a67c3ca59433899d2fda8374`. **Target:** `GoreeCloud/bookmarks`. **Design authority:** Glaze V1.7 / 1.7.0. The separate historical native repository `GoreeCloud/goreecloud-bookmarks` remains untouched.

## Why import this foundation?

The imported application contains a mature data, web-preservation, capture, annotation, organization, browser-extension and mobile interoperability baseline. Importing it accelerates functional evaluation and preserves proven user workflows while GoreeCloud defines independently owned services. The monorepo also imports material architectural debt: subscriptions, identity/storage assumptions, commercial screens, branded assets, network integrations, and package coupling. These MUST be audited and progressively replaced, not accepted as the native destination.

## Implementation stages

| Stage | Target and evidence | Current |
| --- | --- | --- |
| 0. Source acquisition | Upstream SHA, AGPL notice, independent repository, imported tree and threat inventory | Imported; security audit pending |
| 1. Containment | Upstream publishing disabled; synthetic-only testing; external requests mapped | Initial CI containment implemented; full dependency audit pending |
| 2. GoreeCloud UI | Product shell identity, Glaze 1.7.0 tokens/runtime, accessible navigation, responsive screens and visual acceptance | Core shell foundation only; Glaze consumer acceptance blocked |
| 3. Trust boundaries | Tenant isolation, authz, safe URL/capture, job timeouts, secret protection, upload validation | Inherited code; unverified |
| 4. Core native replacement | Independent bookmark API/domain + preserving collections, tags, import/export and archiving | Planned; evaluate existing Go/PostgreSQL native service |
| 5. Integration | Nine platform systems assessed and applicable ones tested | Unverified/blocked |
| 6. Clients | Truly native Android, iOS and Linux app + browser capture with safe sync | Inherited clients are not native acceptance |
| 7. Native exit | No inherited product shell controlling core product; migration, rollback, tests, licenses, privacy, security, and Glaze accepted | Not achieved |

## Transformation audit

| Area | Imported boundary | Required modernization |
| --- | --- | --- |
| Web application | `apps/web` Next.js shell, commercial/auth screens, PWA | Replace all presentation with Glaze; remove promotions and upstream references without affecting core workflows |
| Persistence | `packages/prisma` database | Versioned governed migrations; owner/tenant isolation; safe export and migration |
| Bookmark APIs | `packages/router` and `apps/web/pages/api` | Authz, bounded inputs, compatibility schema, pagination, rate limits, audit trail |
| Capture & archiving | `apps/worker`, `packages/lib`, filesystems | SSRF/rebinding protection, resource limits, isolated browsers, retention, no implicit external uploads |
| Browser | `apps/extension` | Minimize permissions; owned icon/branding; audit credentials, origins, extension store policy |
| Mobile | `apps/mobile` | Genuine native clients per GoreeCloud mobile standard, not a web wrapper |
| Billing/commercial | billing / subscription hooks, promotion, settings, landing | Remove after dependency/authorization-flow mapping; do not bypass third-party entitlements |
| Localization & assets | inherited translations, icons, imagery | Replace product-facing identity throughout; retain required legal notices |
| CI & release | upstream release/publish workflows | Disabled active inherited workflows; adopt scoped GoreeCloud validation and release gates |
| Glaze | no verified consumer acceptance | Stable 1.7.0 only; tests and cross-platform qualifications mandatory |

## Verification & non-goals

The static checker proves only known modified source invariants. Do not claim a running deployment, complete rebrand, cleared dependency audit, migrated accounts, tested backup, or Glaze acceptance. Before any production promotion: verify exact release candidate, dependency/SBOM, functional + adverse-path tests, privacy/security/SSRF checks, E2E and accessibility, representative visuals, clean install/upgrade, recoverability, and license/notice compliance. Preserve rollback to the pre-import repository commit `7f10d69354234faa1ac160a0b045be448397ef82` and avoid rewriting shared history.
