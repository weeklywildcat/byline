# Byline

Byline is an open-source publishing platform for static news sites. This is the
canonical monorepo for the public Next.js app, WordPress control-plane plugin,
shared contracts and themes, Byline Studio, and the optional Discord newsroom
service. Weekly Wildcat remains the compatibility/default publication; other
publications supply the same versioned contracts without forking the platform.

## Repository layout

- `apps/web/` — public Next.js app. It reads published WordPress contracts and
  produces a static export; it has no auth, database, SSR, or runtime Next server.
- `apps/discord-bot/` — separately deployed, stateless Discord newsroom service.
- `wordpress-plugin/` — WordPress control plane and Studio. The installable
  folder remains `weekly-wildcat-headless/` and the main file remains
  `weekly-wildcat-headless.php`.
- `packages/` — canonical publication, content, design, Studio, UI, and theme
  contracts plus first-party themes. Studio and the public frontend consume the
  same block presentations, viewports, theme definitions, and CSS-token mapping.
- `schemas/` — versioned JSON schemas.
- `docs/` — architecture, extension, compatibility, and migration guidance.
- `scripts/` — root validation and release packaging utilities.

## Setup and root commands

Use Node 24 or newer, npm, and PHP 8.3 for the complete local matrix.

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
npm run test:frontend:second-publication

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
The app reads `/byline/v1/publication` and published design endpoints before the
Next build. Fixture/CI builds can use `BYLINE_PUBLICATION_FILE`,
`BYLINE_PUBLICATION_JSON`, and `BYLINE_DESIGNS_FILE`.

`apps/web/next.config.ts` intentionally keeps `output: "export"`, trailing
slashes, and unoptimized images. The result is `apps/web/out/`; it includes safe
publication/design manifests and requires no public Byline server.

The North Star acceptance command builds a second publication from local
fixtures and scans HTML, JSON, and XML for Weekly Wildcat identity, theme, or
disabled-module leakage.

## WordPress plugin and Studio

The plugin owns durable editorial settings, legacy sports/events storage,
publication configuration, protected deployment/Discord integrations, and
private Studio drafts/revisions. Public static builds read published designs
only. Studio runs within authenticated WordPress admin and never depends on the
public site being reachable.

Legacy CPTs, metadata/options, REST aliases, installed slug, main file, and ZIP
name are compatibility contracts. Do not rename them as cleanup. See
[current contracts](docs/migration/current-contracts.md) and the
[updater transition](docs/updater-transition.md).

## Plugin releases

Future WordPress releases are published from `weeklywildcat/byline`:

1. Bump the plugin header and `wordpress-plugin/package.json` to the same version.
2. Merge the tested change to `main`.
3. Create and push a matching `vX.Y.Z` tag without rewriting existing tags.
4. `.github/workflows/release-plugin.yml` runs JS/TS and PHP validation, builds
   Studio, validates the production ZIP, and publishes
   `weekly-wildcat-headless.zip`.

Historical plugin tags imported into this repository are prefixed `plugin-` so
they cannot collide with canonical releases. The standalone `byline-plugin`
repository remains available for historical releases and the live `v0.2.1`
updater bridge.

## Discord bot

The service in `apps/discord-bot/` uses WordPress as the durable story/link
store. Its `.env.example`, Dockerfile, and compose example document deployment.
It is tested and built by monorepo CI but is always excluded from the WordPress
ZIP.

## Architecture and extension points

- [Architecture](docs/architecture.md)
- [Extension contracts](docs/extensions.md)
- [Updater bridge and retirement criteria](docs/updater-transition.md)
- [Legacy compatibility contracts](docs/migration/current-contracts.md)

All future development happens in `weeklywildcat/byline`. The standalone plugin
repository must not be deleted; archive it only after the bridge is observed in
production and a canonical plugin release is proven to update bridged installs.
