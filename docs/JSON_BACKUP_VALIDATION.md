# JSON bookmark backup input validation

**Development-only.** The Linkwarden-compatible JSON importer validates its complete collection/link/tag/pin structure before checking the account's inherited capacity policy or starting any database writes. It accepts optional legacy text fields when strings, null, or absent; rejects non-string collection descriptions/colors, bookmark names/descriptions/URLs, tag names, and malformed pinned-link entries with a 400 response.

This is a field-type safety boundary, not a new backup format. Legitimate URL-less saved content and the existing collection/pin restoration semantics are preserved. Unsafe web URLs continue to be filtered by `importSafety.ts`. Import dates that cannot be parsed are omitted.

Focused mocked tests assert rejected data does not invoke capacity checks, transactional writes, or archive repair. Source CI cannot replace a disposable PostgreSQL restore and rollback exercise. Keep this change stacked with archive recovery and the Fork-to-Native migration reviews, with no production release until identity, permissions, account migration and data-recovery obligations are accepted.
