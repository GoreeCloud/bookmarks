# Built-in search operator help

**Development-only / Glaze qualification pending.** The search box now offers an expandable, localized-label reference for URL, tag, pinned, and date operators. Examples stay in the Bookmarks interface instead of opening an upstream Linkwarden documentation site. The help button exposes its expanded state and controlled region to assistive technology.

This is a usability and privacy-boundary improvement for the existing advanced-search operator UI. It does not modify the search index or claim that all query/filter forms are verified against production data. Both query parsing and index-backed results must be validated separately, alongside keyboard, screen-reader, and representative mobile/desktop runtime testing.

This PR builds on the keyboard-search-operators feature branch. Do not mistake an inherited Linkwarden help link removal for complete upstream identity, billing, telemetry or external-endpoint decontamination.
