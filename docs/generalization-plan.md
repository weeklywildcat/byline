# Generalizing Byline

Status: proposed, revision 2, 2026-11-11. Nothing here is built yet.
Audited against `main` at `179ba9c0`. Re-audit the areas a phase touches before starting it; this repository moves quickly.

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

## What the code looks like today

| Area | Already general | Still Weekly Wildcat, or single-checkout |
| --- | --- | --- |
| Publication facts | `BylinePublicationConfig` in `@byline/core`; the Publication Global; the snapshot carries it | Every Global field is required with a Wildcat default, so defaults are written into storage. `normalizePublicationConfig` special-cases the theme id |
| Appearance | `appearance.theme` and `tokenOverrides` in the contract; two sanitizers (`core`, `theme-contract`) | Forced to `weekly-wildcat` with empty overrides in `apps/web/lib/publication.ts`, `apps/web/scripts/astro-with-publication.mjs`, and twice in `apps/newsroom/src/public/publication-config.ts` |
| Theme | `@byline/theme-contract`; tokens become CSS variables; `globals.css` has neutral `:root` defaults | The theme's `renderers` is empty. The homepage's only stylesheet is the theme's 1,548 lines (`--ww-*`). `article.css` has Wildcat-scoped selectors. Fonts are hard-coded in `apps/web/lib/theme.ts` |
| Homepage | A design document (`schema-v2`), bounded parsers, slots derived from the document | `getWeeklyWildcatHomeDesign`, `WEEKLY_WILDCAT_*_DEFAULTS`, `compatibility-*` sources, "At NSHS", Behind the Scenes |
| Bespoke code | Story, interactive, tracker, and Data presentation registries with plain-data `describe*` functions | Registries live in engine packages. `payload.config.ts` imports the component registries to describe them. Hosts load `styles.css` and `client.ts` by relative path into `packages/` |
| Public routes | Standard routes | Nine Wildcat pages sit beside them; an analytics id is inline in `BaseLayout.astro` |
| Branding | Asset fields in the Global | URL text fields pointing at files committed to `apps/web/public/` |
| Snapshot | v3 is current; v2 is still read | The envelope is `schemaVersion`, `revision`, `generatedAt`, `publication`, `datasets`, `data`. It names no engine or site version |
| Feature switches | Control navigation and public exposure only. Collections are unconditional | Nothing states this as a rule |
| Build and deploy | Fixture builds, contract checks, snapshot parity | Workspaces are `apps/*` and `packages/*`. The Dockerfile lists workspace manifests by hand. Cloudflare runs `npm ci --workspace=@byline/web` and CI asserts Payload never enters that install. `deploy:newsroom` requires a clean `main` of this repository. The newsroom and the public site already deploy at different times |

Three findings shape the design:

1. **The newsroom uses site code in two different ways.** Its server (Payload
   config, hooks, jobs, the Payload CLI) needs identifiers and defaults. Its
   Live Preview needs components and styles. Neither needs Astro pages.
2. **The packages are not libraries.** All of them export raw TypeScript at
   `0.1.0`, and the two apps are applications.
3. **Everything assumes one checkout.** Install, Docker, Cloudflare, CI, and
   the deploy script would each need to learn where a site lives.

## Target shape

### Engine and site

The apps stay in the engine. A site is a package the engine apps consume. The
engine repository holds three sites:

- `sites/default`: neutral, needs no edits. A no-code publication runs it as is.
- `sites/weekly-wildcat`: the real one. It stays here as the engine's canary,
  so a cross-cutting change remains one pull request and one CI run.
- `sites/maximal`: a test fixture that uses every extension point.

`BYLINE_SITE` selects a site by directory. Engine code refers to it only as `@byline/site/*`.

### Three entry points, not one module

| Entry | Contains | May be loaded by |
| --- | --- | --- |
| `@byline/site/config` | Plain data and pure functions: site id, contract version, `requiresByline`, publication defaults, theme descriptors and tokens, the home design document, preset choice, feature defaults, route switches, and descriptors (id, kind, title) for every registry entry | Anything, including plain Node: the Payload CLI, migrations, scripts, Vitest, both apps |
| `@byline/site/web` | Astro pages, head tags and analytics, the asset directory, renderers with their style and client loaders | `apps/web` only |
| `@byline/site/preview` | The React components and styles the newsroom previews: theme, story presentations, interactives, trackers, Data presentations | The newsroom's client and preview bundles only |

`config` imports no JSX, CSS, or `.astro` file. `web` and `preview` may share
component modules. A contract test asserts the descriptors in `config` match
the entries in `web` and `preview`. The newsroom never resolves `web`.

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
navigation, sections, and feature switches (inherit, on, off). Without it, a
value nobody chose would outlive every later change to the site's default.

### Composition

In this repository, add `sites/*` to the workspaces. For a publication with its
own repository, the hypothesis Phase 0 must prove or replace:

| Question | Answer to prove |
| --- | --- |
| Where is the engine? | A git submodule at `byline/`, pinned to a release tag |
| What is the workspace root? | The publication repository: `byline/apps/*`, `byline/packages/*`, `site` |
| Who owns `package-lock.json`? | The publication repository, seeded from the engine's lock. A check confirms engine-owned entries match the pinned engine |
| What is the Docker build context? | The publication repository root, using the engine's Dockerfile, which stops listing manifests by hand |
| Which commit does Cloudflare build? | The publication repository's commit, which pins the site and the engine together |
| Where does `deploy:newsroom` run? | A clean `main` of the publication repository |

Rejected: cloning a site into an engine checkout (no single commit pins both,
and the engine's lockfile goes dirty), and a third deployment repository.

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
  and stops if not. This already matters: the two deploy at different times today.
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

Old coverage must keep rendering after the code that made it special is gone.

### Rules the engine keeps

- **One schema for every installation.** Collections, tables, and migrations
  never depend on a site or a feature switch. Switches control navigation,
  permissions, jobs, and public exposure. This is already true; it becomes a rule.
- **Sites do not own the public root.** A copier merges site assets and fails
  the build on a collision with `_byline/`, `_astro/`, headers, redirects,
  robots, feeds, sitemaps, the 404 page, or any emitted route.
- **Dependency direction.** Engine packages and apps import no `sites/*` path
  and no site-specific package; they reach a site only through `@byline/site/*`,
  and each app only through the entries it is allowed. Tests, fixtures, and docs
  are exempt. One narrow literal check remains: no site's theme id in engine
  runtime source or CSS, because an import rule cannot see a selector.

### Three ways to customize

| Tier | Who | Where | What |
| --- | --- | --- | --- |
| Settings | Administrators | Site → Publication | Identity, sections, navigation, logo uploads, theme, colors, font pairing, density, homepage preset, feature switches |
| Configuration | A developer, lightly | The site's `config` | Publication defaults, token values, home design, engine routes on or off |
| Code | A developer | The site's `web` and `preview` | A theme with its own CSS and renderers, pages, bespoke stories, interactives, Data presentations |

## Decisions

Confirm or change before Phase 1.

1. The apps stay in the engine; a site is a package with three entry points.
2. Weekly Wildcat stays in this repository. External sites are supported and proven with a fixture, not by moving ours.
3. The homepage stays in code: the site's design document or an engine preset an administrator picks. No reordering UI.
4. Appearance is a publication setting for administrators. Stories and the Front Page get no design controls.
5. One newsroom per publication, one schema for all of them, no per-site newsroom code beyond the site package.
6. Settings store overrides only; inheritance is explicit.
7. Identifiers a site ships are permanent.
8. The public renderer upgrades before the newsroom.
9. npm publishing waits. External sites pin the engine as a submodule, subject to Phase 0.

## Phases

Each phase lands on `main` and leaves Weekly Wildcat's public output unchanged unless it says otherwise.

### Phase 0: Prove composition and the toolchain

Results so far: [generalization-phase-0.md](generalization-phase-0.md). Docker, the deploy rehearsal, and the production-size incremental measurement are still open.

Throwaway branches. Run every row in both layouts: a site in `sites/*`, and a scratch external repository with the engine as a submodule.

| Context | Must work |
| --- | --- |
| Install | `npm ci` at the root; the Cloudflare scoped install including the site, with Payload still absent |
| TypeScript | Package, web (`astro check`), and newsroom typechecks resolve all three entries |
| Tests | Vitest in web, newsroom, and packages; Playwright against a built site |
| Payload CLI | Migrate, the "migrations match config" check, and type generation load `config` under plain Node |
| Newsroom build | `next build` with `preview`; proof that `web` is never resolved |
| Docker | The production Dockerfile, without hand-listed manifests, from each layout's context |
| Astro | A site page, a site stylesheet and client loaded through an entry, an engine route switched off and replaced |
| Incremental build | See below |
| Deploy rehearsal | `deploy:newsroom` and a hook-triggered Workers build on a staging stack, ending with a correct public manifest |

Incremental build: on a real Weekly Wildcat snapshot (all production routes),
record cold, warm with no change, warm after one site stylesheet change, one
site page change, and one engine change, before and after the move. The source
fingerprint must cover the site directory. A site living outside the engine
must not turn every site edit into a full rebuild. If it does, change the layout.

Done when every row passes in both layouts, the six composition answers are
written down as fact, and the incremental numbers are no worse than today.

### Phase 1: The site seam

- Add `packages/site-contract` and the three sites. Add `sites/*` to the
  workspaces, the Dockerfile, the scoped install, and the source fingerprint.
- Move into `sites/weekly-wildcat`: publication defaults, theme, fonts, home
  design, production registries, the nine pages and their views, brand and page
  assets, analytics, the calendar heading, and Cloudflare settings. Fixture presentations stay in the engine.
- Split each registry into descriptors (`config`) and components (`web`, `preview`), with the matching test.
- Replace direct theme and registry imports in both apps with the allowed entries.
- Add the asset copier and the dependency-direction check.
- Add the id ledger and its check.
- Rename content modes to `fixture` and `browser-fixture`, resolved per site.
- Build and verify all three sites in CI.

Done when the Wildcat fixture build is identical before and after (diff `out/`,
allowing only hashed asset names), the default and maximal sites build and pass
`verify-build` and `verify-seo`, and the new checks are green.

Checks: `npm run typecheck`, `npm test`, all fixture builds, `npm run verify:contracts`, `npm run test:newsroom:integration`, the snapshot parity gate, the Docker build.

### Phase 2: The resolved publication model

- Add `PublicationDefaults`, `PublicationOverrides`, and `resolvePublication` to `@byline/core`.
- Make the Global's inheritable fields optional and remove their stored defaults, with a migration.
- Clear stored values equal to the site default at migration time, and assert the resolved configuration is identical before and after.
- Stop forcing `appearance` in the four places listed above.
- Show inherited values and a reset control on the settings screen.

Done when changing a default in a site changes a publication that never overrode it, and does not change one that did.

Checks: a committed migration, `npm run test:newsroom:integration`, snapshot contract tests, the parity gate.

### Phase 3: Version and identity in the pipeline

- Add the site contract version and `requiresByline`, asserted at build time in both apps.
- Add engine and site identity to the next snapshot version; keep reading v3.
- Make the renderer refuse a mismatched snapshot and an unresolvable id, after aliases and fallbacks.
- Add the manifest check to `deploy:newsroom` and document the upgrade order.

Done when a snapshot from the wrong site or a newer contract fails the public build with a clear message, and a retired id still renders.

### Phase 4: The theme behind the contract

- Split the theme stylesheet. Structural homepage CSS moves to `@byline/ui`, driven by tokens, with `--ww-*` renamed to `--byline-*`.
- Move the Wildcat-scoped rules out of `article.css` into the Wildcat theme.
- Themes declare their fonts (self-hosted files, stylesheet, preloads).
- Add tokens where the CSS hard-codes a value a theme should own.
- Give `sites/default` a neutral theme built only from tokens.
- Keep one token sanitizer.
- Newsroom previews read the active theme and resolved overrides.

Done when the default theme renders every package and article mode with no Wildcat CSS loaded, and Weekly Wildcat still matches its screenshots.

Checks: as Phase 1, plus `npm run test:frontend:browser` on each site.

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
- Publish a site template repository in the composition Phase 0 proved, with one update command.
- Run the template in engine CI against each release.
- Rewrite getting started for both paths, and write an upgrade guide and contract changelog.
- Revisit npm packages if pinning proves awkward.

Done when a new publication can go from the template to a published story by following the docs.

## AGENTS.md changes

Made in the phase that makes them true.

- Repository map: `packages/site-contract` and `sites/`; the theme package moves into the Wildcat site (Phase 1).
- Engine code reaches a site only through `@byline/site/*`; the newsroom never loads `web` (Phase 1).
- A shipped identifier is permanent; retire, do not delete (Phase 1).
- The schema is the same for every installation; feature switches never change it (Phase 1).
- Settings store overrides; never write a resolved default back (Phase 2).
- Upgrade the public renderer before the newsroom (Phase 3).
- Appearance is a publication setting; Stories and the Front Page have no design controls (Phase 5).
- The homepage design is the site's code or an engine preset; Front Page placements choose stories for existing slots (Phase 6).
- `docs/architecture.md` still says Snapshot v2; correct it in Phase 1.

## Risks and open questions

- **The lockfile in an external repository.** A site with its own dependencies needs its own lock, which then differs from the lock the engine was tested with. Phase 0 must show the check is workable.
- **Incremental builds.** Not yet measured with site code outside `apps/web`. Astro's own invalidation rules for dependency and configuration changes were not verified for this plan.
- **Splitting 1,548 lines of homepage CSS** is the largest single task and the likeliest source of visual regressions.
- **Clearing stored defaults** is a data migration on the production Global. The before-and-after assertion is the guard.
- **Unknown-id behavior today** was not found in the audit. Phase 1 should establish what a missing interactive or tracker does now before defining the fallback.
- **Analytics for no-code sites** is not covered.
- **Who hosts.** A no-code publication still needs someone to run Docker, PostgreSQL, and a static host once.
