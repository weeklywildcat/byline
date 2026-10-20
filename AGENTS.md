# AGENTS.md

Guidance for agents working in the canonical Byline monorepo.

## Work fast without guessing

Use this order for most tasks:

1. **Read the nearest `AGENTS.md`.** More specific files override this root guide.
2. **Identify the owning layer before editing.** Do not solve a web problem in the plugin, a plugin problem in the web app, or shared behavior with duplicated local code.
3. **Inspect the nearest implementation and tests first.** Search for the existing type, component, endpoint, CSS class, fixture, or test before designing a new abstraction.
4. **Make the smallest coherent change.** Preserve existing boundaries and reuse helpers/primitives already in the repo.
5. **Run the narrowest useful checks first.** Do not start every task with the full monorepo test/build suite.
6. **Escalate validation only when the change crosses boundaries or affects build/runtime contracts.**
7. **Report exactly what changed and exactly what you tested.**

Do not spend time rediscovering architecture that is documented here or in the relevant scoped guide.

## Repository map

- `apps/web/` — static Astro public site and public article/page rendering.
- `wordpress-plugin/` — WordPress control plane, editor UI, REST/meta, publishing tools and authenticated newsroom features.
  - Home, Planning (Stories, Calendar, Media Desk…) and the Story Workspace are private React 19 roots on one shadcn base-nova system (`src/admin-ui`, shared story code in `src/story`) with exactly one `StoryPeek`. See `docs/stories-planning-ui.md`; do not reintroduce WordPress React/components or a second quick view on those screens.
- `apps/discord-bot/` — optional separately deployed Discord service.
- `packages/` — shared contracts, UI, design primitives and Weekly Wildcat theme packages.
- `apps/web/story-presentations/` — per-story presentation resolver and developer-defined bespoke article layouts. Read its scoped `AGENTS.md` before custom story work.
- `schemas/` — shared machine-readable contracts.
- `scripts/` — repo/build/release verification and maintenance scripts.
- `docs/` — architecture and operational documentation.

The standalone `weeklywildcat/byline-plugin` repository is historical/update-compatibility infrastructure only. New WordPress work belongs in this monorepo.

## Choose the owning layer

Prefer these boundaries:

- Public rendering, routing, SEO, static generation, article/page layout → `apps/web/`.
- Reusable article/UI behavior used in more than one surface → `packages/ui/` or the appropriate shared package.
- WordPress editor controls, metadata, REST fields, publishing workflows → `wordpress-plugin/`.
- Shared content/data contracts → the appropriate package/schema, then adapt both consumers.
- Story-specific art direction → `apps/web/story-presentations/`, not global CSS or WordPress layout controls.
- Build/release invariants → `scripts/`, CI, and the relevant docs.

Avoid parallel implementations. If web and WordPress need the same concept, define the shared contract once and adapt at the edges.

## Development loop

### Fresh checkout

Use Node 24+.

```sh
npm ci
```

Do not rerun `npm ci` between ordinary edits unless dependencies or the lockfile changed or the install is suspect.

### Web-only change

Start with:

```sh
npm run typecheck:frontend
npm run test:frontend
```

Run the browser suite only when real layout/browser behavior matters:

```sh
npm run test:frontend:browser
```

Run the frontend build when touching routing, static generation, SEO verification, asset materialization, build snapshots, redirects, or other build-time behavior:

```sh
npm run build:frontend
```

For snapshot/CMS-boundary changes:

```sh
npm run test:frontend:snapshot-build
```

### Shared package change

Start with:

```sh
npm run typecheck:packages
npm run test:packages
```

Then run the checks for every consumer you actually changed or could break. For example, a shared UI change used by the public site normally also needs:

```sh
npm run typecheck:frontend
npm run test:frontend
```

Do not automatically run plugin or Discord checks for a package they do not consume.

### WordPress plugin change

Start with:

```sh
npm run typecheck:plugin
npm run test:plugin
npm run test:php
```

Build plugin assets when editor/admin JavaScript or packaged assets changed:

```sh
npm run build:plugin
```

Use WordPress E2E only when the change depends on the real editor, REST/auth behavior, browser integration, or WordPress-version behavior:

```sh
npm run test:e2e:wp71
```

Do not start a local WordPress environment for pure unit/model changes.

### Discord-only change

```sh
npm run typecheck:discord
npm run test:discord
npm run build:discord
```

### Contract / release / cross-boundary change

Run:

```sh
npm run verify:contracts
```

Use the full suite when the task is broad, changes shared contracts across multiple apps, changes CI/release behavior, or before a release-sensitive handoff:

```sh
npm run typecheck
npm test
npm run build
```

Plugin releases additionally require:

```sh
npm run package:plugin
```

CI remains the final repo-wide verification. Local development should be scoped first.

## Testing strategy

- Prefer an existing nearby regression test over creating a new test framework.
- Reproduce a bug in a focused test before or alongside the fix when practical.
- Use fixtures and existing test helpers; do not make unit/browser tests depend on live WordPress or production services unless the test is specifically an integration/E2E test.
- For visual/layout changes, test the actual responsive geometry or behavior that matters, not implementation details.
- For REST/meta/storage changes, test defaults, sanitization/validation, serialization and backward compatibility.
- For shared contracts, test both producer and consumer boundaries when relevant.
- Do not weaken a test merely to make a change pass.
- Do not run expensive browser/E2E suites when a unit test can prove the behavior.

## Search and editing discipline

Before adding a new component, hook, endpoint, setting, type, CSS primitive or script:

- search for the concept and likely legacy names;
- inspect callers and tests;
- check whether a shared abstraction already exists;
- check for compatibility aliases before removing or renaming anything.

Prefer extending an existing path over adding a second path that does nearly the same thing.

Keep diffs focused. Do not mix opportunistic cleanup, formatting churn, file moves and functional changes unless they are required for the task.

When reorganizing code, keep pure moves separate from behavior changes where practical.

## Static-site constraints

The public site is a static Astro application.

- Keep `apps/web/next.config.ts` on `output: "export"`; it remains a compatibility guard.
- Do not add SSR, server actions, frontend databases/auth, runtime-only rendering, or a required Node server.
- Do not introduce runtime CMS requests into the renderer. Build/snapshot boundaries are intentional.
- Prefer static HTML/CSS and narrowly scoped client behavior.
- Preserve static-export, SEO and snapshot-build verification when touching public rendering.

## WordPress constraints

- WordPress admin tools must work without loading the public site.
- Keep the installed plugin folder `weekly-wildcat-headless`, main file `weekly-wildcat-headless.php`, updater slug `weekly-wildcat-headless`, and release asset `weekly-wildcat-headless.zip`.
- Preserve legacy `ww_*` CPT/meta/option identifiers and `/weekly-wildcat/v1/*` REST aliases. Canonical `/byline/v1/*` APIs adapt them.
- Publish WordPress releases from `weeklywildcat/byline`.
- Do not remove the standalone plugin repository or its `v0.2.1` bridge release.
- See `docs/updater-transition.md` before changing updater or release behavior.

## Product/architecture guardrails

- Sports records are a fixed archive in native Pages. Do not reintroduce custom games, teams, roster editors, imports, or live sports schedules. Preserve legacy source records and public read aliases; see `docs/sports-archive.md`.
- Keep homepage composition in code and use only the Weekly Wildcat theme. Do not reintroduce a layout designer, generic themes or design publishing.
- Public polls remain stored only in WordPress. Keep cookie names `ww_voter_id` and `ww_poll_voted_<pollId>`, their signature format and voter-key derivation. Do not recreate Cloudflare D1 poll storage; see `docs/polls.md`.
- Story presentation: WordPress owns editorial content. The built-in author control stays intentionally small (Standard/Immersive plus headline position). Bespoke layouts belong in `apps/web/story-presentations/`; read its scoped guide.
- Do not expose deploy hooks, Discord/OAuth secrets, admin nonces, or protected configuration through public endpoints, snapshots or static manifests.

## Generated and large files

Do not commit generated:

- `node_modules/`
- `.next/`
- `out/`
- plugin `build/`
- plugin `release/`
- Discord `dist/`
- mirrored WordPress media

Avoid touching generated snapshots/artifacts unless the source change legitimately requires regeneration.

## Git and PR discipline

- Do not force-push `main`.
- Do not rewrite imported history/tags or flatten plugin ancestry.
- Historical imported plugin tags use the `plugin-` prefix.
- Keep PRs single-purpose when practical.
- If a task belongs on an existing open feature branch/PR, prefer updating that work rather than creating a competing implementation.
- Before handoff, inspect the final diff for accidental generated files, duplicated code, debug logging and unrelated cleanup.

## Completion standard

Before saying a task is done:

- confirm the change lives in the correct layer;
- confirm no duplicate implementation was introduced;
- run the smallest relevant typecheck/tests and any build/browser/E2E checks justified by the change;
- note any intentionally unrun expensive checks;
- verify compatibility-sensitive behavior when touched;
- summarize the files/architecture changed and the exact commands that passed.

The canonical CI workflow is `.github/workflows/ci.yml`; release workflow is `.github/workflows/release-plugin.yml`.
