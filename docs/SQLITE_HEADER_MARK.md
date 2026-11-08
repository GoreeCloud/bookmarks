# GoreeCloud Bookmarks — Offline legacy SQLite header transition

**Status:** v0.1.23 development-only, opt-in, new-destination operation. This is **not** a SQLite table-schema upgrade, live migration, or production cutover.

The v0.1.21+ runtime identifies newly created SQLite files using application ID `0x4743424d` (`GCBM`) and SQLite `user_version=1`. The earlier v0.1.18–v0.1.20 SQLite-v1 files instead have two zero-valued header markers. Those legacy files remain readable and writable without automatic modification.

## Offline procedure

1. Stop every Bookmarks writer using the source SQLite library and verify the source and a separately retained, checksum-backed backup. Do not clear an unexplained `.lock` or run against personal data solely to test this tool.
2. Use the **new** destination below, on a local hard-link-capable filesystem. It must not exist. Confirm both are private files with restricted directory access.

```bash
npm run sqlite-migrate -- inspect /private/legacy.sqlite
npm run sqlite-header-mark -- /private/legacy.sqlite /private/new-marked.sqlite
npm run sqlite-migrate -- inspect /private/new-marked.sqlite
```

3. Independently compare bookmark IDs, collections, tags, ordering and Unicode content. Keep the original SQLite file and a verified backup unchanged as rollback material. Changing server configuration to point to the new file is a **separate, reviewed decision**, not part of this operation.

## Safety behavior

The tool acquires and holds the **canonical exclusive writer lock** for the source until conversion and verification finish, so cooperating servers and backup operations cannot race it. It opens the source read-only, checks its header pair `(0,0)`, SQLite integrity, foreign keys, full Bookmarks-v1 schema and payload consistency. It snapshots using Node's SQLite backup API into a private temporary file and stamps only that copy with `GCBM`/version 1. It checks complete data equality, unchanged source bytes and device/inode, fsyncs the copy, and publishes via a no-overwrite hard link. The source is never modified by a successful or failed tool operation.

Locked writers, unknown/mixed file headers, already-marked sources, invalid data, existing destinations and failed verification all cause rejection. Temporary files are removed and the tool releases only its own lock. The source SHA-256 in the command output is for audit/verification, **not** an authenticity signature or encryption.

## Limitations

This operation changes **only SQLite file headers**, not table layout, payload schema, API semantics, journal design, backup encryption, retention, account identity, or server deployment. Only valid legacy SQLite-v1 sources up to 256 MiB are supported. It does not verify behavior under real power loss, unsupported network filesystems, hostile external filesystem writers or a compromised host. The `node:sqlite` API is experimental on Node 22. Keep [issue #3](https://github.com/GoreeCloud/bookmarks/issues/3) open pending schema evolution, independent recovery, offsite encrypted backup policy and production controls.
