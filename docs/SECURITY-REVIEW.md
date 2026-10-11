# Imported application threat-review backlog

**Status: unverified.** This is a structured audit checklist, not a vulnerability finding or a security certification.

1. **URL capture & background browser:** inspect every server-side fetch, proxy and browser navigation for redirects, DNS rebinding, private-address access, metadata service access, alternate IP forms, protocol allowlist and size/time limits; test adverse URLs and retries.
2. **Owner/tenant authorization:** inspect every collection, tag, archive, attachment, user invite, API token and sharing operation for ownership and permission checks; test cross-owner IDs and invalid scopes.
3. **Upload/archive content:** inspect MIME validation, decompression/resource limits, path traversal, HTML/PDF safety, extraction sandbox, stored-XSS handling, long-term storage controls and public link expiration.
4. **Auth/session/account:** review cookie settings, OAuth allowlists, CSRF, token lifecycle, password and recovery flows, rate limits, privileges and error disclosure.
5. **External services/privacy:** inventory upstream subscription endpoints, telemetry, newsletters, error reporting, remote AI, fonts, icons, fetch destinations, archive targets and defaults; disable optional outbound transfers until explicitly authorized.
6. **Supply chain:** verify lockfile, action pins, package integrity, license inventory, dependencies and image digest pins before deployments.
7. **Recovery:** test export, versioned migration, restore, backups, integrity, failure states, and rollback using synthetic data.
8. **Platform systems:** scope GoreeCloud Identity, Privacy Shield, Wardveil Security, Everkeep, Mesh, Manager, Policy, Observability and Glaze with verified contracts.

There is no authorized production deployment, no completed penetration/security audit, and no blanket acceptance of inherited defaults.
