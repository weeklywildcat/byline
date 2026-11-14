# Generalization Phase 0 results

Date: 2026-11-11. Plan: [generalization-plan.md](generalization-plan.md).
Spike code: draft pull request [#305](https://github.com/weeklywildcat/byline/pull/305), branch `spike/site-composition`, based on `main` at `179ba9c0`. Reference only; it is never merged.

## What the spike built

- `packages/site-contract`: `defineSiteConfig`, `assertSiteCompatible`, contract versions, the entry type.
- `sites/default` and `sites/weekly-wildcat`: each exports `./config` (plain data), `./web` (an Astro head component and the interactives), `./preview` (a stylesheet and the interactives). Each has a site page, a replacement `/about/` page, one interactive with its own stylesheet and client, and one public asset.
- `scripts/select-site.mjs`: links `node_modules/@byline/site` to the selected site directory (`BYLINE_SITE`, or an argument). The root `postinstall` runs it.
- `apps/web/site-integration.mjs`: an Astro integration that asserts compatibility, injects site pages, injects engine routes the site has not switched off, and copies site assets after the build with reserved-path and collision checks.
- Wiring: `astro.config.mjs`, a site `<Head />` in `BaseLayout.astro`, site pages in the route manifest (`build-snapshot.ts`) and the sitemap (`sitemap.ts`), the site directory in the source fingerprint, `payload.config.ts` loading `config`, an unlinked newsroom route `/preview/site-spike` rendering `preview`, the site workspace in `build-cloudflare.mjs`, and a Dockerfile that collects manifests in a build stage and takes `ENGINE_DIR` and `BYLINE_SITE`.
- A scratch publication repository (outside this repository) with the spike engine as a git submodule pinned to a tag, `site/` beside it, and its own `package.json` and lockfile.

## Results

| Context | In this repository | Submodule layout |
| --- | --- | --- |
| `npm ci` / `npm install` | Pass | Pass. A root `postinstall` selects the site. The engine checkout stays clean |
| Cloudflare scoped install | Pass: site deps install, Payload and Next absent, Astro cache kept | Pass (`--workspace=@byline/web --workspace=site`) |
| Package typecheck | Pass | Not run separately |
| Web typecheck (`astro check`, `tsc`) | Pass, 0 errors | Pass, 0 errors |
| Newsroom typecheck | Pass | Pass |
| Web Vitest | 601 of 601, after pointing one test at the moved `about.astro` | 600 of 601 before that fix; not rerun |
| Newsroom Vitest | 501 of 501 | Not run |
| Package tests, `verify:contracts` | Pass | Not run |
| Payload CLI: committed migrations, drift check, type generation | Pass under both sites, no drift | Pass, engine stays clean |
| Newsroom `next build` | Pass. Bundle has the `preview` entry, its CSS and client chunks; no `web` entry and no `.astro` file | **Failed, then passed** after the fix in finding 4 |
| Astro fixture build with `verify-build` and `verify-seo` | Pass under both sites | Pass |
| Site page, replaced `/about/`, site head tag, site interactive's CSS and client | Present in the output | Present |
| Asset copier | Rejects `_byline/manifest.json` (reserved) and `favicon-32.png` (collision) | Not repeated |
| Public browser tests | 124 of 124 | Not run |
| Docker build (CI) | Pass with each site: image builds, links the right site, migrations apply with no drift, and `next build` inside the image bundles `preview` and never `web` | Pass, same checks, from a publication repository built in the job, after its lockfile check |
| Repository CI on the spike (scoped Cloudflare build, newsroom job with integration tests and snapshot parity, public site job with browser tests) | Pass | Not applicable |
| Deploy rehearsal | **Not run**: needs a staging stack | **Not run** |

### Incremental builds (fixture, 41 routes)

| Build | In this repository | Submodule layout |
| --- | --- | --- |
| Cold | 41 rendered | 41 rendered |
| Warm, no change | 25 rendered, 16 restored | 25 rendered, 16 restored |
| Site stylesheet change | 41 rendered | 41 rendered |
| Site page change | 41 rendered | 41 rendered |
| Engine stylesheet change | 41 rendered | 41 rendered |

The layouts behave the same. Byline's source fingerprint drops Astro's cache on any source edit, engine or site, which is today's behavior for engine edits. Moving the site outside the engine costs nothing extra. Making site edits cheaper would mean narrowing the fingerprint, which is separate work.

**Not measured at production size.** No production snapshot exists on disk; acquiring one needs the production build token.

## Findings

1. **A symlink beats aliases.** One link at `node_modules/@byline/site` resolves in Node, tsx, tsc, `astro check`, Vite, Vitest, Next with Turbopack, and the Payload CLI. Per-tool aliases (tsconfig paths, Vite and Vitest aliases, Next config) are unnecessary. A site must also export `./package.json` so tools can find its directory.
2. **The entry split holds.** The newsroom build contained `preview` and never `web`. The Payload CLI loaded `config` under plain Node.
3. **The verifiers caught the gaps.** `verify-build` failed on the unlisted site page and `verify-seo` on its missing sitemap entry. Site pages must feed the route manifest and sitemap from `config`. An engine route a site can switch off must move out of `src/pages` and be injected.
4. **The engine assumed it owns `node_modules`.** `packages/newsroom-ui/src/styles.css` loaded Geist from `../../../node_modules/geist/...`, which broke the newsroom build in the submodule layout. The spike vendored the font file (69 KB, OFL) into the package. Phase 1 needs a check against relative `node_modules` paths in engine source.
5. **The lockfile check is workable.** A publication lock seeded from the engine's had identical third-party versions; one package moved between hoisting locations. A site dependency that conflicts with the engine's (zod 3 against the engine's zod 4) nests under `site/node_modules`, and the engine still resolves its own. The check should compare names and versions, allowing hoisting moves.
6. **One Dockerfile serves both layouts.** A first stage collects the root manifest, the lock, and every workspace manifest by glob, replacing the hand-written list. `COPY --parents` would be shorter but exists only in the labs Dockerfile frontend, and failed validation in CI. `ENGINE_DIR` says where the engine sits in the build context (`.` here, `byline` in a publication repository) and `BYLINE_SITE` names the site.
7. **The site must be reselected after install.** `npm ci` recreates `node_modules`. CI's typecheck failed on the first push because nothing selected the site after a plain install; a root `postinstall` now does. `--include-workspace-root=false` skips that script, so the Cloudflare build selects the site itself, and the Dockerfile's manifest stage carries the selector so `npm ci` can run it.
8. **One schema confirmed.** The migration drift check passed identically under both sites.
9. **Local submodules need `protocol.file.allow=always`.** This matters only for local testing; a GitHub URL does not need it.

## Composition, as tested

| Question | Answer |
| --- | --- |
| Where is the engine? | A git submodule at `byline/`, pinned to a tag. Works |
| What is the workspace root? | The publication repository: `byline/apps/*`, `byline/packages/*`, `site`. Works |
| Who owns `package-lock.json`? | The publication repository, seeded from the engine's. Works; check per finding 5 |
| What is the Docker build context? | The publication root, with the engine's Dockerfile, `ENGINE_DIR=byline`, `BYLINE_SITE=site`. Works in CI |
| Which commit does Cloudflare build? | The publication commit, which pins the engine. The scoped install and build work; the hosted Workers build was not run |
| Where does `deploy:newsroom` run? | Not tested |

## Before Phase 1

Phase 1 can start. Two items from Phase 0's done-when stay open and are assigned to later phases in the plan:

- A deploy rehearsal on a staging stack (before Phase 3 changes `deploy:newsroom`).
- The incremental measurement on a production-size snapshot (before Phase 7).

What Phase 1 takes from these results is written into the plan's [slices](generalization-plan.md#phase-1-the-site-seam) and [traps](generalization-plan.md#traps-phase-0-found).
