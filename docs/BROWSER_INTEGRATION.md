# GoreeCloud Bookmarks ↔ GoreeCloud Browser

**Status:** Development-only projection and compatibility planning. Neither Browser direct provider access nor Browser Sync delivery is enabled by this work.

GoreeCloud Bookmarks is the authority for the online bookmark library, saved links, collections, and tags. GoreeCloud Browser continues to own local-only bookmarks, explicit save-destination choice, profile and private-context behavior, and Browser UI. GoreeCloud Sync coordinates approved replication; it does not create a second Bookmarks database.

The consumer boundary is **On this device** versus **GoreeCloud Bookmarks (Online)**; online access and cross-device syncing are independently opted into and must not migrate local bookmarks merely because an account signs in.

## Bounded read projection

The pure `apps/web/lib/client/browserBookmarkProjection.ts` helper maps an already authorized saved link to a bounded Browser read model: stable link and collection identities, HTTP(S) URL, display title, and tags. It rejects invalid IDs, collection mismatches, unsafe URL schemes, credentials embedded in URLs, control characters, oversized links, and malformed records. It projects neither archived page contents nor user credentials, profile secrets, private notes, or session state.

It is **not an authenticated API**. The eventual Bookmarks route must use a verified account-bound identity session, the current authorized collection set, independent Privacy Shield decisions, and accepted producer capability before invoking this projection.

## Sync integration prerequisites

The current GoreeCloud Sync registry advertises the Bookmarks application datasets `bookmarks.items`, `bookmarks.collections`, and `bookmarks.assignments` at schema v1. Browser-owned `browser.*` datasets must not be extended to compete for this authority.

Before enabling online Browser access, implement and validate: account/profile binding and authorization, accepted Bookmarks API contract, explicit online/Sync opt-ins, bounded cursor retrieval, durable write and delete acknowledgements, offline queue and safe retry, conflict/tombstone convergence, browser UI and onboarding, account-switch revocation, and multi-device privacy and security checks.

Browser-side development counterpart: [GoreeCloud/browser PR #200](https://github.com/GoreeCloud/browser/pull/200), a draft contract and CMake smoke; it does not provide a runtime service connection.
