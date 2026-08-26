# AGENTS.md

Guidance for future work in the canonical Byline monorepo.

## Architecture

- `apps/web/` is a statically exported Next.js public site.
- `wordpress-plugin/` is the WordPress control plane and authenticated Studio.
- `apps/discord-bot/` is an optional, separately deployed service.
- `packages/` is the canonical source for shared contracts, themes, and UI
  presentation metadata used by both Studio and the frontend.
- `schemas/`, `docs/`, and `scripts/` are repository-wide.

Do not recreate the former two-repository architecture or add divergent copies
of shared render/theme contracts. New WordPress development belongs here under
`wordpress-plugin/`. The standalone `weeklywildcat/byline-plugin` repository is
historical/update compatibility infrastructure only.

## Non-negotiable compatibility

- Keep `apps/web/next.config.ts` on `output: "export"`. Do not add SSR, server
  actions, frontend auth/database, image optimization, or a runtime Next server.
- Studio must function from WordPress admin without loading the public site.
- Keep the installed plugin folder `weekly-wildcat-headless`, main file
  `weekly-wildcat-headless.php`, updater slug `weekly-wildcat-headless`, and
  release asset `weekly-wildcat-headless.zip`.
- Preserve legacy `ww_*` CPT/meta/option identifiers and
  `/weekly-wildcat/v1/*` REST aliases. Canonical `/byline/v1/*` APIs adapt them.
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
npm run test:frontend:second-publication
npm run package:plugin
node scripts/verify-updater-transition.mjs
```

Scoped commands use the `typecheck:*`, `test:*`, and `build:*` scripts in the
root `package.json`. PHP syntax and regressions run through `npm run test:php`.
The plugin packaging command must pass before any plugin tag is pushed.

## Change discipline

- Keep pure moves separate from functional changes when reorganizing paths.
- Update shared packages when behavior belongs to both Studio and production.
- Add regression coverage for storage, REST, updater, privacy, or static-export
  compatibility changes.
- Do not force-push `main`, rewrite imported history/tags, or flatten plugin
  ancestry. Historical imported plugin tags use the `plugin-` prefix.
- Do not commit generated `node_modules`, `.next`, `out`, plugin `build`,
  plugin `release`, Discord `dist`, or mirrored WordPress media.

The canonical CI workflow is `.github/workflows/ci.yml`; the release workflow is
`.github/workflows/release-plugin.yml`. See `docs/updater-transition.md` before
changing updater or release behavior.
