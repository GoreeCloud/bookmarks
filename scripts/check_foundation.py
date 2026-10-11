#!/usr/bin/env python3
"""Static source invariants for the initial GoreeCloud import; not runtime qualification."""
from pathlib import Path
import json
import unittest

ROOT = Path(__file__).resolve().parents[1]

class FoundationTests(unittest.TestCase):
    def test_legal_and_source_provenance(self):
        self.assertIn("GNU AFFERO GENERAL PUBLIC LICENSE", (ROOT/"LICENSE.md").read_text())
        p=(ROOT/"UPSTREAM-PROVENANCE.md").read_text()
        self.assertIn("952ac4540657cae3a67c3ca59433899d2fda8374",p)
        self.assertIn("linkwarden/linkwarden",p)

    def test_web_identity_and_pwa(self):
        web=(ROOT/"apps/web/pages/_app.tsx").read_text()
        self.assertIn("<title>GoreeCloud Bookmarks</title>",web)
        self.assertIn("glaze-foundation.css",web)
        shell=(ROOT/"apps/web/components/SidebarShell.tsx").read_text()
        self.assertIn('aria-label="GoreeCloud Bookmarks dashboard"',shell)
        manifest=json.loads((ROOT/"apps/web/public/site.webmanifest").read_text())
        self.assertEqual(manifest["name"],"GoreeCloud Bookmarks")
        self.assertTrue((ROOT/"apps/web/public/goreecloud-bookmarks-mark.svg").exists())
        self.assertFalse(any("linkwarden" in json.dumps(i).lower() for i in manifest.get("icons",[])))

    def test_ssr_safe_sidebar_persistence(self):
        sidebar=(ROOT/"apps/web/components/Sidebar.tsx").read_text()
        self.assertIn("disclosuresHydrated",sidebar)
        self.assertIn("setDisclosuresHydrated(true)",sidebar)
        self.assertNotIn("useState<boolean>(() => {",sidebar)

    def test_zoom_is_not_disabled(self):
        app=(ROOT/"apps/web/pages/_app.tsx").read_text()
        self.assertNotIn("maximum-scale=1",app)

    def test_motion_and_keyboard_accessibility(self):
        css=(ROOT/"apps/web/styles/glaze-foundation.css").read_text()
        self.assertIn("prefers-reduced-motion: reduce",css)
        self.assertIn(":focus-visible",css)
        self.assertIn('[data-theme="dark"]',css)
        self.assertIn('[data-theme="light"]',css)

    def test_search_operator_help_stays_inside_bookmarks(self):
        search=(ROOT/"apps/web/components/SearchBar.tsx").read_text()
        self.assertNotIn("docs.linkwarden.app/usage/advanced-search", search)
        self.assertIn('aria-expanded={showHelp}', search)
        self.assertIn('aria-controls={helpId}', search)
        self.assertIn('SEARCH_OPERATOR_EXAMPLES.map', search)
        self.assertIn('role="region"', search)

    def test_external_publishing_workflows_contained(self):
        active={p.name for p in (ROOT/".github/workflows").glob("*.yml")}
        self.assertEqual(active,{"foundation-check.yml"})
        workflow=(ROOT/".github/workflows/foundation-check.yml").read_text()
        self.assertIn("contents: read",workflow)
        self.assertNotIn("secrets.",workflow)

if __name__=="__main__":
    unittest.main(verbosity=2)
