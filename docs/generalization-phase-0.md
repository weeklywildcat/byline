# Generalization Phase 0 results

Date: 2026-11-11. Plan: [generalization-plan.md](generalization-plan.md).
Spike code: this branch, `spike/site-composition`, based on `main` at `179ba9c0`. Throwaway: not meant to merge as is.

## What the spike built

- `packages/site-contract`: `defineSiteConfig`, `assertSiteCompatible`, contract versions, the entry type.
- `sites/default` and `sites/weekly-wildcat`: each exports `./config` (plain data), `./web` (an Astro head component and the interactives), `./preview` (a stylesheet and the interactives). Each has a site page, a replacement `/about/` page, one interactive with its own stylesheet and client, and one public asset.
- `scripts/select-site.mjs`: links `node_modules/@byline/site` to the selected site directory (`BYLINE_SITE`, or an argument).
- `apps/web/site-integration.mjs`: an Astro integration that asserts compatibility, injects site pages, injects engine routes the site has not switched off, and copies site assets after the build with reserved-path and collision checks.
- Wiring: `astro.config.mjs`, a site `<Head />` in `BaseLayout.astro`, site pages in the route manifest (`build-snapshot.ts`) and the sitemap (`sitemap.ts`), the site directory in the source fingerprint, `payload.config.ts` loading `config`, an unlinked newsroom route `/preview/site-spike` rendering `preview`, the site workspace in `build-cloudflare.mjs`, and a Dockerfile that globs manifests.
- A scratch publication repository (outside this repository) with the spike engine as a git submodule pinned to a tag, `site/` beside it, and its own `package.json` and lockfile.

## Results

| Context | In this repository | Submodule layout |
| --- | --- | --- |
| `npm ci` / `npm install` | Pass | Pass. A root `postinstall` selects the site. The engine checkout stays clean |
| Cloudflare scoped install | Pass: site deps install, Payload and Next absent, Astro cache kept | Pass (`--workspace=@byline/web --workspace=site`) |
| Package typecheck | Pass | Not run separately |
| Web typecheck (`astro check`, `tsc`) | Pass, 0 errors | Pass, 0 errors |
| Newsroom typecheck | Pass | Pass |
| Web Vitest | 600 of 601. The failure is a test that reads `src/pages/about.astro` by path, which the spike moved | Same |
| Newsroom Vitest | 501 of 501 | Not run |
| Package tests, `verify:contracts` | Pass | Not run |
| Payload CLI: committed migrations, drift check, type generation | Pass under both sites, no drift | Pass, engine stays clean |
| Newsroom `next build` | Pass. Bundle has the `preview` entry, its CSS and client chunks; no `web` entry and no `.astro` file | **Failed, then passed** after the fix in finding 4 |
| Astro fixture build with `verify-build` and `verify-seo` | Pass under both sites | Pass |
| Site page, replaced `/about/`, site head tag, site interactive's CSS and client | Present in the output | Present |
| Asset copier | Rejects `_byline/manifest.json` (reserved) and `favicon-32.png` (collision) | Not repeated |
| Public browser tests | 124 of 124 | Not run |
| Docker build | Running in CI (`spike-site-composition.yml`), both sites | Running in CI, publication repository built in the job |
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
6. **The Dockerfile needs a decision.** In this repository, `COPY --parents` with globs replaces the hand-written manifest list. In the submodule layout the build context is the publication root and engine manifests sit under `byline/`, so the engine Dockerfile needs an engine-directory argument, or the template ships its own. Both are unverified.
7. **The site must be reselected after install.** `npm ci` recreates `node_modules`, and `--include-workspace-root=false` skips the root `postinstall`, so every build entry point runs the site selection itself.
8. **One schema confirmed.** The migration drift check passed identically under both sites.
9. **Local submodules need `protocol.file.allow=always`.** This matters only for local testing; a GitHub URL does not need it.

## Composition, as tested

| Question | Answer |
| --- | --- |
| Where is the engine? | A git submodule at `byline/`, pinned to a tag. Works |
| What is the workspace root? | The publication repository: `byline/apps/*`, `byline/packages/*`, `site`. Works |
| Who owns `package-lock.json`? | The publication repository, seeded from the engine's. Works; check per finding 5 |
| What is the Docker build context? | The publication root. Unverified; see finding 6 |
| Which commit does Cloudflare build? | The publication commit, which pins the engine. The scoped install and build work; the hosted Workers build was not run |
| Where does `deploy:newsroom` run? | Not tested |

## Before Phase 1

Phase 0's done-when is not fully met. Still open:

- The Docker build in both layouts: the `spike-site-composition` workflow on this branch builds the image, applies migrations, and runs the newsroom build inside it. Results pending.
- A deploy rehearsal on a staging stack.
- The incremental measurement on a production-size snapshot.

Changes to Phase 1 from these results:

- Select the site with the link script, not tool aliases. Require a `./package.json` export.
- Feed site pages to the route manifest and sitemap, and move switchable engine routes to injection.
- Add a check against relative `node_modules` paths in engine source.
- Decide whether the engine Dockerfile takes an engine-directory argument or the template owns one.
- The spike pointed the `about` page test at the moved file; Phase 1 should locate routes through the route table instead.
