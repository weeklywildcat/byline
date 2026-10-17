# Byline

Byline powers the Weekly Wildcat newsroom and static public site. This monorepo contains the Astro frontend, WordPress admin tools, shared packages, and optional Discord service. The homepage uses one custom layout maintained in code.

## Repository layout

- `apps/web/` — public Astro app. It reads one normalized build snapshot and
  produces a static export; it has no auth, database, SSR, or runtime app server.
- `apps/discord-bot/` — separately deployed, stateless Discord newsroom service.
- `wordpress-plugin/` — WordPress control plane and newsroom tools. The installable
  folder remains `weekly-wildcat-headless/` and the main file remains
  `weekly-wildcat-headless.php`.
- `packages/` — canonical publication, content, homepage package, UI, and Weekly Wildcat theme contracts.
- `schemas/` — versioned JSON schemas.
- `docs/` — architecture, compatibility, and migration guidance.
- `scripts/` — root validation and release packaging utilities.

## Setup and root commands

Use Node 24 or newer, npm, and PHP 8.3 for the complete local matrix. The
WordPress plugin retains PHP 7.4 as its minimum and CI validates PHP 7.4, 8.0,
and 8.3.

```sh
npm ci
npm run typecheck
npm test
npm run build
```

Useful scoped commands:

```sh
npm run typecheck:frontend
npm run test:frontend
npm run build:frontend

npm run test:plugin
npm run typecheck:plugin
npm run build:plugin
npm run test:php
npm run package:plugin

npm run test:discord
npm run typecheck:discord
npm run build:discord
```

`npm run package:plugin` writes and validates
`wordpress-plugin/release/weekly-wildcat-headless.zip`. It verifies the legacy
install path, required runtime assets, exclusions, and WordPress-provided React
externals.

## Frontend

Copy `apps/web/.env.example` to `apps/web/.env.local` when using a CMS directly.
The app reads `/byline/v1/publication` before the
Astro build. Fixture/CI builds can use `BYLINE_PUBLICATION_FILE`,
and `BYLINE_PUBLICATION_JSON`.

`apps/web/astro.config.mjs` intentionally uses static output, trailing slashes,
and the existing `apps/web/out/` deployment directory. The result includes safe
publication and build manifests and requires no public Byline server. The old Next
route tree and runnable exporter were removed at cutover; the tagged rollback
point remains the authoritative copy of that implementation.

Polls are the only runtime state the published site reads. WordPress owns poll
definitions and vote records; `apps/web/src/worker.js` is a thin same-origin
proxy from the relative `/api/polls/*` contract to `/byline/v1/polls/*`. It has
no database binding. See [docs/polls.md](docs/polls.md).

## WordPress plugin

The plugin owns durable editorial settings, legacy sports/events storage,
publication configuration, protected deployment/Discord integrations, and
newsroom workflows. Admin tools work without the public site being reachable.
The fixed homepage follows automatic selection rules, including the sticky lead.
Sports management is retired; the plugin converts published game and roster records to fixed archive Pages grouped by sport and season. See [sports archive](docs/sports-archive.md).
There is no layout editor, manual homepage pinning, or design scheduling.
Historical design posts remain stored privately and are no longer read or published.

Legacy CPTs, metadata/options, REST aliases, installed slug, main file, and ZIP
name are compatibility contracts. Do not rename them as cleanup. See
[current contracts](docs/migration/current-contracts.md) and the
[updater transition](docs/updater-transition.md).

## Plugin releases

Future WordPress releases are published from `weeklywildcat/byline`.

**Automatic patch releases.** Merging a pull request that changes
`wordpress-plugin/`, `packages/`, or `schemas/` releases a new patch version
with no further steps. `.github/workflows/auto-release.yml` runs
`scripts/prepare-release.mjs`, which bumps the plugin header, protocol constant,
`wordpress-plugin/package.json`, and lockfile, adds a `readme.txt` changelog
entry from the merged pull request titles, commits that to `main`, and publishes it.
Write pull request titles as you want them to read in WordPress's "View version
details". Merges that only change the public site, docs, or CI do not release.

**Minor and major releases, or hand-written notes.** Bump the version and write
the `readme.txt` entry in the pull request itself. The automatic workflow sees a
version with no tag and releases it as written, without a second bump.

**Manual release.** Pushing a matching `vX.Y.Z` tag (never rewriting existing
tags) still works and runs the same publish workflow.

Either way, `.github/workflows/release-plugin.yml` runs JS/TS and PHP
validation, builds admin assets, validates the production ZIP, and publishes
`weekly-wildcat-headless.zip`.

Historical plugin tags imported into this repository are prefixed `plugin-` so
they cannot collide with canonical releases. The standalone `byline-plugin`
repository remains available for historical releases, failed bridges `v0.2.1`
and `v0.2.2`, and fixed standalone bridge `v0.2.3`.

## Discord bot

The service in `apps/discord-bot/` uses WordPress as the durable story/link
store. Its `.env.example`, Dockerfile, and compose example document deployment.
It is tested and built by monorepo CI but is always excluded from the WordPress
ZIP.

## Architecture and operations

- [Architecture](docs/architecture.md)
- [Astro frontend operations and rollback](docs/migration/astro.md)
- [Astro migration benchmark](docs/migration/astro-benchmark.md)
- [Polls: WordPress storage, REST, proxy, and D1 migration](docs/polls.md)
- [Updater bridge and retirement criteria](docs/updater-transition.md)
- [Legacy compatibility contracts](docs/migration/current-contracts.md)

All future development happens in `weeklywildcat/byline`. The standalone plugin
repository must not be deleted; archive it only after the bridge is observed in
production and a canonical plugin release is proven to update bridged installs.
