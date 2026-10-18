# AGENTS.md

Guidance for future work in the canonical Byline monorepo.

## Architecture

- `apps/web/` is the static Astro public site; the legacy Next.js export
  configuration remains a compatibility guard.
- `wordpress-plugin/` is the WordPress control plane and authenticated newsroom tools.
- `apps/discord-bot/` is an optional, separately deployed service.
- `packages/` is the canonical source for shared contracts, the Weekly Wildcat theme, and UI
  presentation metadata.
- `apps/web/story-presentations/` holds optional, developer-defined article layouts keyed
  by WordPress post ID. They arrange the normalized `ArticlePresentation`; WordPress
  still owns every word, and there is no WordPress setting for them. See
  `docs/custom-story-presentations.md`.
- `schemas/`, `docs/`, and `scripts/` are repository-wide.

Do not recreate the former two-repository architecture or add divergent copies
of shared render/theme contracts. New WordPress development belongs here under
`wordpress-plugin/`. The standalone `weeklywildcat/byline-plugin` repository is
historical/update compatibility infrastructure only.

## Non-negotiable compatibility

- Keep `apps/web/next.config.ts` on `output: "export"`. Do not add SSR, server
  actions, frontend auth/database, image optimization, or a runtime Next server.
- WordPress admin tools must work without loading the public site.
- Sports records are a fixed archive in native Pages. Do not reintroduce custom
  games, teams, roster editors, imports, or live sports schedules. Preserve legacy
  source records and public read aliases; see `docs/sports-archive.md`.
- Keep the homepage composition in code and use only the Weekly Wildcat theme.
  Do not reintroduce a layout designer, design publishing, or generic themes.
- Keep the installed plugin folder `weekly-wildcat-headless`, main file
  `weekly-wildcat-headless.php`, updater slug `weekly-wildcat-headless`, and
  release asset `weekly-wildcat-headless.zip`.
- Preserve legacy `ww_*` CPT/meta/option identifiers and
  `/weekly-wildcat/v1/*` REST aliases. Canonical `/byline/v1/*` APIs adapt them.
- Keep the public poll cookie names `ww_voter_id` and `ww_poll_voted_<pollId>`,
  their signature format, and their voter-key derivation. WordPress is the only
  poll datastore; do not reintroduce Cloudflare D1 or a second poll
  implementation in the Worker. See `docs/polls.md`.
- Do not expose deploy hooks, Discord/OAuth secrets, admin nonces, or other
  protected configuration through public endpoints or static manifests.
- Publish WordPress releases from `weeklywildcat/byline`; do not remove the
  standalone plugin repository or its `v0.2.1` bridge release.

## Commands

From the repository root:

```sh
npm ci
npm run typecheck
npm test
npm run build
npm run package:plugin
node scripts/verify-updater-transition.mjs
```

Scoped commands use the `typecheck:*`, `test:*`, and `build:*` scripts in the
root `package.json`. PHP syntax and regressions run through `npm run test:php`.
The plugin packaging command must pass before any plugin tag is pushed.

## Change discipline

- Keep pure moves separate from functional changes when reorganizing paths.
- Update shared packages for shared content and presentation behavior.
- Add regression coverage for storage, REST, updater, privacy, or static-export
  compatibility changes.
- Do not force-push `main`, rewrite imported history/tags, or flatten plugin
  ancestry. Historical imported plugin tags use the `plugin-` prefix.
- Do not commit generated `node_modules`, `.next`, `out`, plugin `build`,
  plugin `release`, Discord `dist`, or mirrored WordPress media.

The canonical CI workflow is `.github/workflows/ci.yml`; the release workflow is
`.github/workflows/release-plugin.yml`. See `docs/updater-transition.md` before
changing updater or release behavior.
