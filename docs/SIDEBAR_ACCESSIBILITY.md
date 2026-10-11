# Sidebar accessibility: Development improvements

GoreeCloud Bookmarks now names its sidebar collapse/expand button using existing localized text and exposes `aria-expanded` plus the target `aria-controls="sidebar"`. The icon is hidden from assistive technology so the button's label is announced instead of a decorative glyph.

On narrow screens, the translucent dismissal overlay is an actual named button rather than a click-only `div`, and pressing Escape closes the expanded sidebar. Event listeners are registered only while the mobile sidebar is open and removed during cleanup.

The source boundary test checks the labels, controlled region, expanded state and Escape listener cleanup in CI. It is **not** a substitute for real keyboard/screen-reader and mobile-browser acceptance. The fork remains in Development and must meet Glaze V1.7.0 and accessibility qualification before release.
