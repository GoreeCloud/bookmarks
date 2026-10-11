# Inherited automation containment

The initial source import removed all inherited workflows from the active GitHub Actions directory before publishing this branch. Files retired: check-branch.yml, extension-build.yml, locale-action.yml, mobile-release.yml, playwright-tests.yml, release-container.yml, release-edge-container.yml. Their original bytes remain available via the imported upstream Git history. Some are release/publishing/locale workflows with upstream-specific trust assumptions; restoring them requires a GoreeCloud-specific audit of triggers, secrets, destinations and pinned dependencies. The replacement workflow runs a read-only local static boundary check only, and does not build, deploy, publish, or accept a release.

## Import quality caveat

The untouched upstream snapshot contains trailing whitespace in a few extension, web, Prisma and patch files. A repository-wide `git diff --check` reports those inherited lines during the one-time import; the GoreeCloud-authored files are validated separately to avoid rewriting third-party patch semantics during acquisition. The exception is *not* a waiver for future changes.
