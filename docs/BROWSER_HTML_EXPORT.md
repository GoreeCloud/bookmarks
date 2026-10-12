# Browser-compatible Bookmarks export

Draft integration. In Account settings, use **Export bookmarks (HTML)** or authenticated `GET /api/v1/migration?format=html` to obtain a Netscape-compatible HTML bookmark file. The default authenticated export is unchanged JSON. The renderer reads only the existing owned-collection projection, escapes untrusted text and attributes, excludes unsafe or credential-bearing URLs and supports collection folders, titles, URL, timestamps, tag names and descriptions where consuming importers understand those attributes.

HTML bookmark interchange does **not** preserve URL-less notes, pinned state, account settings or archived page snapshots. Use the JSON export for the more complete portable Bookmarks backup. Download content is sensitive; the endpoint uses no-store/private headers and requires verified user authentication.

Production acceptance: real Chromium/Firefox bookmark import and export round trips, large-library performance, localization and Glaze UI review, source/CI checks and native authorization/privacy qualification. This PR is not a release or a claim of live browser validation.
