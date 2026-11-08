# GoreeCloud Bookmarks — Chromium Quick Capture (Experimental)

This is a **development-preview** Manifest V3 extension that sends the active HTTP(S) browser tab to a locally running GoreeCloud Bookmarks instance. It has not been installed or audited in a real Chrome profile. It is **not** published to the Chrome Web Store and is not a production synchronization client.

## Manual developer installation

1. Start GoreeCloud Bookmarks on its default `127.0.0.1:4173` HTTP listener with a strong `GCB_AUTH_TOKEN` (see root README).
2. In a Chromium browser, open the extensions management page, enable Developer mode, and choose **Load unpacked**. Select this `extension/` directory.
3. Open an ordinary HTTP(S) webpage and click **GoreeCloud Bookmarks — Save Link**.
4. Under **Connection settings**, enter your server **operator** token. The extension exchanges it for an eight-hour, revocable session token; only that temporary session is stored in `chrome.storage.session` (not synced). The operator secret is not stored. Then save a title, tags and optional collection.
5. Use **Revoke / forget session** to clear extension storage immediately and attempt server revocation. If the local server is offline, revocation is unconfirmed and the issued token expires at most eight hours after issuance.

## Security and functionality boundaries

- The only declared host access is `http://127.0.0.1:4173/*` and `http://localhost:4173/*`. No permission for all websites, no content scripts, no webpage text scraping and no arbitrary network origin configuration.
- `activeTab` provides access to the currently invoked tab, and `storage` is used only for the revocable session token. Older preview builds stored the operator secret; v0.1.13 removes that legacy key during initialization.
- The popup prevents saving browser-internal, file, `javascript:` and other non-HTTP(S) URLs.
- Requests use `credentials: 'omit'` and `redirect: 'error'`; a timed-out local server fails safely. If your token is rejected or expires, the popup clears the stored session and requires reconnection. This is single-owner, not production identity management.
- Do not point this preview at an internet-exposed HTTP service. Future HTTPS remote support needs a reviewed, narrowly scoped permission flow.
- Only the active tab is saved; bulk tabs, automatic metadata fetch, authenticated page archives and cross-browser packaging are not implemented.
