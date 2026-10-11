# Portable GoreeCloud Bookmarks export

**Development only.** The export controller selects only the current user's owned collection names, descriptions and colors; bookmark names, descriptions, URLs, timestamps and tag names; and pins for URLs actually included in owned collections. Shared-only pinned links are not included.

The response preserves `collections` and `pinnedLinks` for the existing JSON backup importer and includes `formatVersion: 1`. This is a **bookmark backup**, not a full-account backup: account configuration and unrelated personal profile fields are intentionally excluded. The importer still requires independent testing against a disposable database.

The backup contains user-selected URLs, titles and descriptions and is therefore sensitive. Keep it private. A future application integration must verify download response cache behavior, restore compatibility, large-file performance and account/collection authorization before production release. No cross-device Sync or automatic uploads are implied.
