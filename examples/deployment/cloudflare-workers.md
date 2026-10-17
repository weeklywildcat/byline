# Cloudflare Workers Builds

Production Byline uses Workers + static assets. Wrangler is pinned in
`@byline/web`; its scripts explicitly use `apps/web/wrangler.jsonc`. Do not deploy
through a root redirected Wrangler config, add D1, or upload changed files with
a custom uploader. Wrangler's static asset manifest deduplicates asset contents.

## Cloudflare settings to change after merge

These are dashboard settings, not settings this PR can enforce in Wrangler:

| Setting | Required value |
| --- | --- |
| Production branch | `main` |
| Root directory | `apps/web` (framework detection/cache relative to the Astro project) |
| Build command | `npm run build` |
| Deploy command | `npm run deploy` |
| Preview command | `npm run deploy:preview` |
| Node version | `24` or a supported newer version |
| Build cache | **Enabled**; confirm the log restores `node_modules/.astro` for this project |
| Dependency installation | Leave automatic installation enabled; do **not** set `SKIP_DEPENDENCY_INSTALL=1` |

npm workspaces use the repository's root lockfile and link internal `@byline/*`
packages even with the command run in `apps/web`. Use the pinned local Wrangler,
not a separately auto-installed CLI. Keep the existing production hook targeting
the same production branch. Install the snapshot-capable WordPress plugin and
prepare its first artifact before letting the new frontend build run.

Keep the public CMS endpoint variable if needed:

```env
NEXT_PUBLIC_WP_API_URL=https://cms.example.edu/wp-json/wp/v2
```

Normally no extra snapshot variable is necessary: the wrapper derives
`/wp-json/byline/v1/build-snapshot` from the existing endpoint. An override is
`BYLINE_BUILD_SNAPSHOT_URL=https://cms.example.edu/wp-json/byline/v1/build-snapshot`.
Remove a manually pinned `BYLINE_PUBLICATION_REVISION` (the verified artifact owns
the revision). Remove any rollout `BYLINE_LEGACY_REST_BUILD=1`; do not configure fixture variables
or `BYLINE_BUILD_SNAPSHOT_FILE` in production. Publication configuration comes
from the snapshot. `WORKERS_CI_BUILD_UUID`, `WORKERS_CI_COMMIT_SHA` and
`WORKERS_CI_BRANCH` are supplied by Workers, not manually maintained settings.

Configure **Settings → Build → Build watch paths** using these exact patterns
(relative to the repository root; Cloudflare's `*` spans nested path characters):

```text
Include:
apps/web/*
packages/*
schemas/*
wordpress-plugin/*
scripts/*
tests/fixtures/*
package.json
package-lock.json
.npmrc
.nvmrc
.node-version
tsconfig*
.github/workflows/*

Exclude:
docs/*
migration/*
examples/*
apps/discord-bot/*
README.md
AGENTS.md
```

This conservatively includes WordPress and all shared packages/schemas because
they can alter public serialization or rendering. Pure documentation or
Discord-only source pushes do not build the site; a root lockfile change still
does. Exclusions take precedence. Deploy-hook invocations intentionally still
build even when there is no relevant Git diff.

The plugin's hook success is not evidence of a live revision. Verify
`/_byline/manifest.json` through the public hostname. A no-op warm build should
show restored dynamic routes; absent cache merely produces a correct cold build.
A cold build always downloads the required media again. Clear cache under
**Settings → Build → Build cache → Clear Cache**, or use Astro `--force` locally.
See [snapshot operations](../../docs/build-snapshots.md) and the
[measured benchmark](../../docs/migration/build-performance-2026-10.md).

Official references: [monorepos](https://developers.cloudflare.com/workers/ci-cd/builds/advanced-setups/),
[build configuration](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/),
[build caching](https://developers.cloudflare.com/workers/ci-cd/builds/build-caching/),
[watch paths](https://developers.cloudflare.com/workers/ci-cd/builds/build-watch-paths/).
