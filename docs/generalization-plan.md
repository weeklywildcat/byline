# Generalizing Byline

Revision 3, 2026-11-11. Audited against `main` at `179ba9c0`.

Working on this? Read [Picking up a phase](#picking-up-a-phase) first.

## Status

Update this table in the pull request that changes it.

| Phase | State | Where |
| --- | --- | --- |
| 0. Prove composition and the toolchain | Done for Phase 1; CI green on the spike. Open: deploy rehearsal (before Phase 3), production-size incremental timings (before Phase 7) | [Results](generalization-phase-0.md); spike in [#305](https://github.com/weeklywildcat/byline/pull/305) (draft, never merge) |
| 1. The site seam | Not started. Next: slice 1a | |
| 2. The resolved publication model | Not started | |
| 3. Version and identity in the pipeline | Not started | |
| 4. The theme behind the contract | Not started | |
| 5. Appearance without code | Not started | |
| 6. Homepage presets | Not started | |
| 7. External sites | Not started | |

## Goal

Any publication can run Byline. A publication that never writes code gets a
working newsroom and public site and can make the site look like its own. A
publication that does write code can add a theme, pages, and bespoke stories
without forking Byline.

## Not in scope

- A hosted Byline service or multi-tenant newsroom. One newsroom per publication.
- A page builder, or design controls on a Story or the Front Page desk.
- Custom newsroom collections, fields, or plugins per publication.
- A second public front end. Astro stays the only supported renderer.
- Moving Weekly Wildcat out of this repository.

## Picking up a phase

### Read, in this order

1. This document: the target shape, the decisions, and your phase.
2. [Phase 0 results](generalization-phase-0.md): what is proven, and the traps.
3. The root `AGENTS.md` and the scoped guide for each app or package you touch.
4. The spike, [#305](https://github.com/weeklywildcat/byline/pull/305), for working reference code. See [Using the spike](#using-the-spike).

### Rules

- **One slice, one pull request.** Do the first unstarted slice of the earliest
  unfinished phase unless the user says otherwise. Do not start a later phase early.
- **Re-audit before you start.** This repository changes daily. Re-run the
  searches your slice depends on against current `main`; the file lists here
  were true at `179ba9c0`.
- **No visual change to Weekly Wildcat** unless the slice says so. Prove it with
  the [parity check](#parity-check), not by eye.
- **Do not change a decision.** If a slice cannot be done under the
  [decisions](#decisions), stop and ask the user. Do not work around one.
- **Never merge or rebase onto the spike branch.** Port code by hand.
- **Keep Weekly Wildcat working at every commit on `main`.** It is the canary
  and the production site.
- **Update the docs in the same pull request:** the status table, any section
  the work made wrong, and the `AGENTS.md` rules listed for that phase.
- **Report exactly** what passed and what was not run, as the root guide requires.

### Parity check

Before changing anything, build the baseline from `main`; after, build your branch; compare.

```sh
# on main, then again on your branch (use two worktrees)
BYLINE_CONTENT_MODE=weekly-wildcat-fixture npm run build:frontend
BYLINE_CONTENT_MODE=weekly-wildcat-browser-fixture npm run build:frontend   # second comparison

diff -r <main>/apps/web/out <branch>/apps/web/out
```

Expected differences only: hashed file names under `_astro/` and the references
to them, and build timestamps or identifiers in `_byline/manifest.json`. Any
difference in HTML text, routes, feeds, sitemaps, redirects, or headers is a
regression. Once content modes are renamed (slice 1f), use the new names.

### Checks for every slice

`npm run typecheck`, `npm test`, both fixture builds, `npm run verify:contracts`,
and `npm run test:frontend:browser`. A slice that touches the newsroom also runs
`npm run test:newsroom:integration`, `npm run migrate:check --workspace @byline/newsroom`
against an empty database, and `next build`. A slice that touches publishing runs the
[snapshot parity gate](payload-build-snapshots.md#operations-and-verification).
A slice that touches install, Docker, or the Cloudflare build must pass CI's
Docker and scoped-install jobs; neither runs on a machine without a Docker daemon.

### Using the spike

[#305](https://github.com/weeklywildcat/byline/pull/305) (`spike/site-composition`) proved the mechanics with toy sites. Reuse its mechanics; do not reuse its contents.

| Take from the spike | Path there |
| --- | --- |
| Site selection by one link | `scripts/select-site.mjs`, root `postinstall` |
| Compatibility assertion, contract shape | `packages/site-contract/src/index.ts` |
| Astro integration: page injection, switchable engine routes, asset copier | `apps/web/site-integration.mjs` |
| Site pages in the route manifest and sitemap | `apps/web/lib/build-snapshot.ts`, `apps/web/lib/sitemap.ts` |
| Site directory in the source fingerprint | `apps/web/scripts/astro-with-publication.mjs` |
| Scoped install with the site workspace | `scripts/build-cloudflare.mjs` |
| Dockerfile without a hand-written manifest list | `apps/newsroom/Dockerfile` |
| A publication repository for testing, and the lockfile check | `scripts/spike/` |
| CI for both layouts | `.github/workflows/spike-site-composition.yml` |

The spike's `sites/*` hold placeholder content, its contract is a fraction of
the real one, and its `/preview/site-spike` route exists only to prove bundling.
None of that ships.

### Traps Phase 0 found

- After any `npm ci`, the site must be selected again. A root `postinstall` does
  it; `--include-workspace-root=false` skips that, so the Cloudflare build script selects explicitly.
- A site must export `./package.json`, or tools cannot find its directory.
- `COPY --parents` needs the labs Dockerfile frontend. Use the manifest stage.
- Engine source must not reach `node_modules` by relative path. The install root
  is not always the engine.
- `verify-build` fails on any route missing from the manifest and `verify-seo`
  on any indexable page missing from the sitemap. Both are correct; feed them.
- `buildRouteManifest` throws on a duplicate route. A site page that replaces an
  engine route reuses that route's entry.
- Tests that read a route file by path break when the route moves.
- A local git submodule needs `protocol.file.allow=always`.

## What the code looks like today

| Area | Already general | Still Weekly Wildcat, or single-checkout |
| --- | --- | --- |
| Publication facts | `BylinePublicationConfig` in `@byline/core`; the Publication Global; the snapshot carries it | Every Global field is required with a Wildcat default, so defaults are written into storage. `normalizePublicationConfig` special-cases the theme id |
| Appearance | `appearance.theme` and `tokenOverrides` in the contract; two sanitizers (`core`, `theme-contract`) | Forced to `weekly-wildcat` with empty overrides in `apps/web/lib/publication.ts`, `apps/web/scripts/astro-with-publication.mjs`, and twice in `apps/newsroom/src/public/publication-config.ts` |
| Theme | `@byline/theme-contract`; tokens become CSS variables; `globals.css` has neutral `:root` defaults | The theme's `renderers` is empty. The homepage's only stylesheet is the theme's 1,548 lines (`--ww-*`). `article.css` has Wildcat-scoped selectors. Fonts are hard-coded in `apps/web/lib/theme.ts` |
| Homepage | A design document (`schema-v2`), bounded parsers, slots derived from the document | `getWeeklyWildcatHomeDesign`, `WEEKLY_WILDCAT_*_DEFAULTS`, `compatibility-*` sources, "At NSHS", Behind the Scenes |
| Bespoke code | Story, interactive, tracker, and Data presentation registries with plain-data `describe*` functions | Registries live in engine packages. `payload.config.ts` imports the component registries to describe them. The newsroom loads `styles.css` and `client.ts` by relative path into `packages/` |
| Public routes | Standard routes | The route vocabulary in `packages/content/src/routing.ts` names Wildcat pages, and the newsroom reads it to protect addresses. Nine Wildcat pages sit in `apps/web`; an analytics id is inline in `BaseLayout.astro` |
| Branding | Asset fields in the Global | URL text fields pointing at files committed to `apps/web/public/` |
| Snapshot | v3 is current; v2 is still read | The envelope names no engine or site version |
| Feature switches | Control navigation and public exposure only. Collections are unconditional | Nothing states this as a rule |
| Build and deploy | Fixture builds, contract checks, snapshot parity | Workspaces are `apps/*` and `packages/*`. The Dockerfile lists manifests by hand. `deploy:newsroom` requires a clean `main` of this repository. The newsroom and the public site deploy at different times |

## Target shape

### Engine and site

The apps stay in the engine. A site is a package the engine apps consume. The
engine repository holds three sites:

- `sites/default`: neutral, needs no edits. A no-code publication runs it as is.
- `sites/weekly-wildcat`: the real one. It stays here as the engine's canary,
  so a cross-cutting change remains one pull request and one CI run.
- `sites/maximal`: a test fixture that uses every extension point.

`BYLINE_SITE` names a site by directory (default `sites/default`).
`scripts/select-site.mjs` links `node_modules/@byline/site` to it, and engine
code refers to the site only as `@byline/site/*`. Every tool resolves that link
by ordinary package resolution; there are no per-tool aliases.

### Three entry points, not one module

| Entry | Contains | May be loaded by |
| --- | --- | --- |
| `@byline/site/config` | Plain data and pure functions: site id, contract version, `requiresByline`, publication defaults, theme descriptors and tokens, the home design document, feature defaults, the route table (site pages as pattern and file path, engine routes switched off, redirects), the asset directory, and descriptors (id, kind, title) for every registry entry | Anything, including plain Node: the Payload CLI, migrations, scripts, Vitest, both apps |
| `@byline/site/web` | What Astro renders: head tags and analytics, theme stylesheets, renderers with their style and client loaders | `apps/web` only |
| `@byline/site/preview` | The React components and styles the newsroom previews: theme, story presentations, interactives, trackers, Data presentations | The newsroom's client and preview bundles only |

`config` imports no JSX, CSS, or `.astro` file. The route table lives in
`config` because the newsroom protects those addresses and the build verifies
them; the page files it points at are loaded only by Astro. `web` and `preview`
may share component modules. A contract test asserts the descriptors in `config`
match the entries in `web` and `preview`. The newsroom never resolves `web`.

Site pages import the public app through `@byline/web/*` exports (the layout,
shared components), never by relative path into `apps/web`.

### Three types and a resolver, not one contract

```text
BylineSiteDefinition ─▶ PublicationDefaults ─┐
                                             ├─▶ resolvePublication() ─▶ ResolvedPublicationConfig ─▶ snapshot
Publication Global ───▶ PublicationOverrides ┘
```

- `PublicationDefaults`: serializable, from the site's `config` over engine defaults.
- `PublicationOverrides`: what the Global stores. Every inheritable field can be unset. A list overrides as a whole.
- `ResolvedPublicationConfig`: today's `BylinePublicationConfig`. Only this enters a snapshot.

**Inheritance is stored, not implied.** The Global never writes a resolved or
default value back. The settings screen shows an inherited value as inherited,
with a reset control. This covers theme, colors, fonts, density, preset,
navigation, sections, and feature switches (inherit, on, off).

### Composition

In this repository, `sites/*` are workspaces. For a publication with its own
repository, Phase 0 tested this layout:

| Question | Answer | Tested |
| --- | --- | --- |
| Where is the engine? | A git submodule at `byline/`, pinned to a release tag | Yes |
| What is the workspace root? | The publication repository: `byline/apps/*`, `byline/packages/*`, `site` | Yes |
| Who owns `package-lock.json`? | The publication repository, seeded from the engine's. A check confirms every engine package version is present, allowing hoisting moves. A conflicting site dependency nests under `site/` | Yes |
| What is the Docker build context? | The publication root, with the engine's Dockerfile and `ENGINE_DIR=byline`, `BYLINE_SITE=site` | Yes, in CI |
| Which commit does Cloudflare build? | The publication commit, which pins the engine | Scoped install and build yes; a hosted Workers build no |
| Where does `deploy:newsroom` run? | A clean `main` of the publication repository | No |

Rejected: cloning a site into an engine checkout, and a third deployment repository.

### Compatibility

- **Versions.** The site contract has its own integer version. A site declares
  `requiresByline` as an engine range. Every build asserts both before doing work.
- **Snapshot identity.** The next snapshot version adds the engine contract
  version, the site id, and the site contract version. The renderer refuses a
  snapshot from another site or an unsupported contract, and refuses a theme,
  preset, or presentation id it cannot resolve, with a message naming both sides.
- **Deploy order.** The public renderer upgrades first and reads the previous
  and current contract. The newsroom upgrades after. `deploy:newsroom` checks
  the live `/_byline/manifest.json` supports the contract it is about to emit,
  and stops if not.
- **Deprecation.** `sites/maximal` and `sites/weekly-wildcat` gate every engine
  change now. Once an external site exists, a breaking change to a registry or
  theme API ships with one release of deprecation first.

### Persisted identifiers

A theme id and preset id are stored in the Global. Interactive and tracker
names are stored in Story bodies. Data presentation keys are stored on
projects. Story presentations are keyed by Story ID in the site and are not
stored; removing one already falls back to the standard article.

- An id is permanent and never reused.
- An entry may declare `aliases` for old ids.
- An entry is retired, not deleted. A retired entry keeps a fallback.
- The engine supplies a fallback per kind for anything still unresolved: the
  site's default theme, the site's default home, a static placeholder block, the table template.
- Each site commits an id ledger. A check fails when an id leaves the ledger without an alias or a retirement.

### Rules the engine keeps

- **One schema for every installation.** Collections, tables, and migrations
  never depend on a site or a feature switch. Switches control navigation,
  permissions, jobs, and public exposure.
- **Sites do not own the public root.** A copier merges site assets and fails
  the build on a collision with `_byline/`, `_astro/`, headers, redirects,
  robots, feeds, sitemaps, the 404 page, or any emitted file.
- **Dependency direction.** Engine packages and apps import no `sites/*` path
  and no site-specific package; they reach a site only through `@byline/site/*`,
  and each app only through the entries it is allowed. Tests, fixtures, and docs
  are exempt. One narrow literal check remains: no site's theme id in engine
  runtime source or CSS.
- **No relative `node_modules` paths** in engine source.

### Three ways to customize

| Tier | Who | Where | What |
| --- | --- | --- | --- |
| Settings | Administrators | Site → Publication | Identity, sections, navigation, logo uploads, theme, colors, font pairing, density, homepage preset, feature switches |
| Configuration | A developer, lightly | The site's `config` | Publication defaults, token values, home design, engine routes on or off |
| Code | A developer | The site's `web` and `preview` | A theme with its own CSS and renderers, pages, bespoke stories, interactives, Data presentations |

## Decisions

Settled with the user. Changing one needs the user.

1. The apps stay in the engine; a site is a package with three entry points.
2. Weekly Wildcat stays in this repository. External sites are supported and proven with a fixture, not by moving ours.
3. The homepage stays in code: the site's design document or an engine preset an administrator picks. No reordering UI.
4. Appearance is a publication setting for administrators. Stories and the Front Page get no design controls.
5. One newsroom per publication, one schema for all of them, no per-site newsroom code beyond the site package.
6. Settings store overrides only; inheritance is explicit.
7. Identifiers a site ships are permanent.
8. The public renderer upgrades before the newsroom.
9. npm publishing waits. External sites pin the engine as a submodule.

## Phases

Each slice lands on `main` and leaves Weekly Wildcat's public output unchanged unless it says otherwise.

### Phase 0: Prove composition and the toolchain

See [the results](generalization-phase-0.md). Two items stay open and do not block Phase 1:

- A deploy rehearsal on a staging stack. Needed before Phase 3 changes `deploy:newsroom`.
- Incremental timings on a production-size snapshot. Needed before Phase 7.

### Phase 1: The site seam

Six slices, in order. Each is one pull request.

#### 1a. The seam, empty

Port the spike's mechanics with no behavior change. The sites exist and are selected, but hold almost nothing.

- Add `packages/site-contract` with the real contract types for `config`, `web`, and `preview`, the contract version, and `assertSiteCompatible`.
- Add `sites/default`, `sites/weekly-wildcat`, and `sites/maximal`, each exporting the three entries and `./package.json`, each with only an id and versions.
- Add `sites/*` to the root workspaces. Add `scripts/select-site.mjs` and the root `postinstall`.
- Update `apps/newsroom/Dockerfile` (manifest stage, `ENGINE_DIR`, `BYLINE_SITE`), `scripts/build-cloudflare.mjs`, and the source fingerprint in `apps/web/scripts/astro-with-publication.mjs`.
- Add the Astro integration, asserting compatibility and doing nothing else yet. Assert compatibility in `apps/newsroom/src/payload.config.ts`.
- Add `@byline/site` and `@byline/site-contract` to `transpilePackages` in `apps/newsroom/next.config.mjs`.
- CI: build the newsroom image with each site; run the scoped install with `BYLINE_SITE=sites/weekly-wildcat`.
- Production must select `sites/weekly-wildcat`: set `BYLINE_SITE` in the Cloudflare build and the newsroom compose environment before this merges. Confirm with the user.

Done when parity holds, all checks pass, and CI builds the image three ways.

#### 1b. Publication defaults and the theme package

- Move `packages/theme-weekly-wildcat` into `sites/weekly-wildcat` (publication defaults and tokens to `config`; `styles.css` to `web` and `preview`). Delete the package.
- Give `sites/default` neutral publication defaults and reuse the engine's neutral tokens. It does not need to look good until Phase 4; it needs to build.
- Replace every import. At `179ba9c0` these were: `apps/web/lib/publication.ts`, `apps/web/lib/theme.ts`, `apps/web/src/layouts/BaseLayout.astro`, `apps/web/views/fonts.css`, `apps/web/views/globals.css`, `apps/web/tsconfig.json`, `apps/web/vitest.config.mts`, three web tests, and in the newsroom `app/(preview)/layout.tsx`, `front-page/FrontPagePreview.tsx`, `globals/Publication.ts`, `preview/publication.ts`, `public/publication-config.ts`, `ui/people/NewsroomPeopleScreen.tsx`, `ui/story/ArticleCanvas.tsx`, `next.config.mjs`, and `scripts/verify-shared-style-contracts.mjs`.
- Move the self-hosted fonts (`apps/web/public/fonts`, `SELF_HOSTED_FONTS`) to the Wildcat site.
- Leave the forced `appearance` and the Global's stored defaults alone; Phase 2 owns them. The Global's defaults now come from the selected site's `config`.

Done when parity holds, no engine file imports a Wildcat package, and the default site builds.

#### 1c. Routes, pages, and assets

- Make the route vocabulary data. `packages/content/src/routing.ts` keeps engine routes only; `CODE_ROUTED_PAGE_SLUGS`, `REDIRECTED_PAGE_SLUGS`, and the fixed entries for `media-kit`, `open-source`, and `intranet` become functions of the site's route table.
- Update the consumers: `apps/web/lib/build-snapshot.ts`, `code-routes.ts`, `public-content.ts`, `sitemap.ts`, `src/pages/[...segment].astro`, and in the newsroom `public/url-changes.ts` and `public/snapshot/collect.ts`. Check `packages/content/src/public-snapshot-v2.ts`.
- Move to `sites/weekly-wildcat`: the pages `about`, `join`, `diversity-inclusion`, `off-deadline`, `behind-the-scenes`, `media-assets`, `media-kit`, `open-source`, `intranet`; their `views/`; and `public/brand`, `public/diversity-inclusion`, `public/media-kit`, `public/newsroom`, the icons, and the social image.
- Decide per page whether the engine keeps a generic version (About from the Pages collection is the likely one) or the route simply does not exist on the default site. Ask the user if unclear.
- Add `@byline/web` exports for what site pages need. Inject site pages; inject switchable engine routes; add the asset copier with its reserved-path and collision checks.
- Move the inline analytics script from `BaseLayout.astro` to the Wildcat site's head.

Done when parity holds including `_redirects`, sitemaps, and `robots.txt`, and the default site builds without those routes.

#### 1d. Registries

- Split each registry into descriptors in `config` and components in `web` and `preview`: story presentations, interactives, trackers (`packages/story-presentations`), and Data presentations (`packages/data-presentations`). Engine templates (`table`, `ranking`, `timeline`) and fixture entries stay in the engine.
- Entries carry `styles` and `client` loaders. Remove the seven relative dynamic imports in `apps/newsroom/src/preview/StoryPreview.tsx`, `story-assets.ts`, and `data-assets.tsx`, and their counterparts in `apps/web`.
- The newsroom server (`payload.config.ts`, `hooks/story-body.ts`, `data/registry.ts`) reads descriptors from `config` only.
- Update the scaffolding commands (`npm run story-presentation`, `npm run data-presentation`) to write into the selected site, and the guides in `packages/story-presentations`, `packages/data`, and `packages/data-presentations`.
- Establish what an unknown interactive, tracker, or presentation key does today, in the newsroom and in the build, and record it here. Phase 3 defines the fallback.
- Add the descriptor-matches-entries contract test and the id ledger with its check.

Done when parity holds, `sites/maximal` registers one of everything and its fixture build renders them, and the newsroom bundle contains no `web` entry.

#### 1e. The homepage

- Move `getWeeklyWildcatHomeDesign`, the `WEEKLY_WILDCAT_*_DEFAULTS`, and the `compatibility-*` wiring to the Wildcat site's `config`. `packages/design` keeps the package contracts and parsers.
- Give `sites/default` a home built from the same packages with plain sources.
- Move the calendar heading ("At NSHS") and Behind the Scenes to the site.
- Update `apps/web/lib/homepage-design.ts`, `apps/newsroom/src/front-page/server.ts`, and the seven homepage tests.

Done when parity holds and the Front Page desk shows the same slots for Weekly Wildcat.

#### 1f. Checks, names, and guides

- Add the dependency-direction check, the theme-id literal check, and the relative-`node_modules` check to `npm run verify:contracts`.
- Rename content modes to `fixture` and `browser-fixture`, resolved per site (about thirty files reference the old names, including CI).
- CI builds and verifies all three sites.
- Update `AGENTS.md` per [the list below](#agentsmd-changes), `docs/architecture.md` (still says Snapshot v2), `docs/shared-package-styles.md`, `docs/getting-started.md`, and `README.md`.
- Close #305 and delete `spike/site-composition`.

Done when the engine names no publication outside tests, fixtures, docs, and migrations, and the checks prove it.

### Phase 2: The resolved publication model

- Add `PublicationDefaults`, `PublicationOverrides`, and `resolvePublication` to `@byline/core`.
- Make the Global's inheritable fields optional and remove their stored defaults, with a migration.
- Clear stored values equal to the site default at migration time, and assert the resolved configuration is identical before and after. Rehearse on a copy of production data.
- Stop forcing `appearance` in the four places listed above.
- Show inherited values and a reset control on the settings screen.

Done when changing a default in a site changes a publication that never overrode it, and does not change one that did.

### Phase 3: Version and identity in the pipeline

- Assert the site contract version and `requiresByline` at build time in both apps.
- Add engine and site identity to the next snapshot version; keep reading v3.
- Make the renderer refuse a mismatched snapshot and an unresolvable id, after aliases and fallbacks.
- Add the manifest check to `deploy:newsroom`, document the upgrade order, and run the deploy rehearsal.

Done when a snapshot from the wrong site or a newer contract fails the public build with a clear message, and a retired id still renders.

### Phase 4: The theme behind the contract

- Split the theme stylesheet. Structural homepage CSS moves to `@byline/ui`, driven by tokens, with `--ww-*` renamed to `--byline-*`.
- Move the Wildcat-scoped rules out of `article.css` into the Wildcat theme.
- Themes declare their fonts (self-hosted files, stylesheet, preloads).
- Add tokens where the CSS hard-codes a value a theme should own.
- Give `sites/default` a neutral theme built only from tokens.
- Keep one token sanitizer.
- Newsroom previews read the active theme and resolved overrides.

Done when the default theme renders every package and article mode with no Wildcat CSS loaded, and Weekly Wildcat still matches its screenshots. Capture screenshots of both sites before starting.

### Phase 5: Appearance without code

- Extend the overrides: theme, color and density, a font pairing from a curated self-hosted set, a homepage preset.
- Validate before publish: color contrast, known pairing, known preset.
- Replace branding URL fields with uploads prepared like publication media. Keep URL values readable.
- Add an Appearance screen with a live preview of the homepage and an article, on the existing preview routes and Global drafts.
- Add a first-run checklist.

Done when a fresh newsroom on the default site can be renamed, rebranded, recolored, and published without touching a file.

### Phase 6: Homepage presets

- Add two or three engine presets built from the existing packages.
- Keep `compatibility-*` sources for the Wildcat design only.
- Drop feature-dependent packages when the feature is off.

Done when switching presets changes the homepage and the Front Page desk shows the new slots.

### Phase 7: External sites

- Adopt release tags a site can pin.
- Publish a site template repository in the tested composition, with one update command and the lockfile check.
- Run the template in engine CI against each release.
- Rewrite getting started for both paths, and write an upgrade guide and contract changelog.
- Measure incremental builds at production size in the external layout.
- Revisit npm packages if pinning proves awkward.

Done when a new publication can go from the template to a published story by following the docs.

## AGENTS.md changes

Made in the slice that makes them true. Until then the root guide only points here.

- Repository map: `packages/site-contract` and `sites/`; the theme package is gone (1a, 1b).
- Engine code reaches a site only through `@byline/site/*`; the newsroom never loads `web`; engine code names no publication (1f).
- A shipped identifier is permanent; retire, do not delete (1d).
- The schema is the same for every installation; feature switches never change it (1a).
- No relative `node_modules` paths in engine source (1f).
- Settings store overrides; never write a resolved default back (Phase 2).
- Upgrade the public renderer before the newsroom (Phase 3).
- Appearance is a publication setting; Stories and the Front Page have no design controls (Phase 5).
- The homepage design is the site's code or an engine preset; Front Page placements choose stories for existing slots (Phase 6).

## Risks and open questions

- **Production site selection.** Slice 1a changes which site a build uses by default. If production does not set `BYLINE_SITE`, it builds the default site.
- **Splitting 1,548 lines of homepage CSS** (Phase 4) is the largest single task and the likeliest source of visual regressions.
- **Clearing stored defaults** (Phase 2) is a data migration on the production Global.
- **Incremental builds.** Any source edit, site or engine, drops the Astro cache through Byline's own fingerprint. That is today's behavior, and Phase 0 showed the external layout does not worsen it. It was not measured at production size.
- **Unknown-id behavior today** is not established (slice 1d).
- **Generic pages for the default site** (slice 1c) need a product decision per page.
- **Analytics for no-code sites** is not covered.
- **Who hosts.** A no-code publication still needs someone to run Docker, PostgreSQL, and a static host once.
