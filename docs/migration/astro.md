# Astro frontend operations

Byline's production frontend is a static Astro build. WordPress remains the
control plane and authoritative content store; Cloudflare remains a static host
plus the existing poll proxy.

```text
WordPress REST + sports APIs
            |
            v
  memoized BuildSnapshot
  indexes + route digests
            |
            v
       Astro static build
            |
            v
 route + asset + SEO + media verification
            |
            v
  apps/web/out -> Cloudflare assets
```

## Responsibilities

`packages/content` is framework-independent. `snapshot.ts` coordinates loaders,
`indexes.ts` builds relationship maps, `digests.ts` creates cheap deterministic
route dependencies, `routing.ts` owns URL normalization and manifest validation,
`redirects.ts` is the explicit permanent-redirect registry, and `media.ts` owns
versioned media identities. The concrete WordPress/sports adapters live in
`apps/web/lib/build-snapshot.ts`.

Astro owns route composition and metadata under `apps/web/src/pages` and
`apps/web/src/layouts`. Existing React presentation components are rendered to
static HTML. Only search, poll state, newsletter signup, reader feedback, share
actions, and the small homepage/schedule controls hydrate as islands. Category,
author, page, article body, and sports archive markup requires no React runtime.

The build writes its expected route inventory and timing data to the disposable
`apps/web/.byline-build` directory. Postbuild copies mirrored media, emits the
public manifests, materializes the legacy `/404/` artifact, then rejects missing
routes, stale routes, broken local asset references, missing required metadata,
or missing materialized media. Reports are available in
`apps/web/out/_byline/{routes,seo,media-manifest,build-metrics}.json`; the
versioned client search index is `apps/web/out/_byline/search-index.json`.

## Local development

Use Node 24 or later.

```sh
npm ci
npm run dev
npm run typecheck:frontend
npm run test:frontend
npm run build:frontend
npm run test:frontend:second-publication
```

The browser regression suite exercises the built Weekly Wildcat output in
`apps/web/out`, separately from the WordPress E2E suite. After building the
deterministic fixture, install Chromium once and run:

```sh
BYLINE_PUBLICATION_FILE=tests/fixtures/weekly-wildcat-publication.json \
BYLINE_CONTENT_MODE=weekly-wildcat-fixture \
npm run build:frontend
npx playwright install chromium
npm run test:frontend:browser
```

The suite starts the lightweight static server in
`apps/web/scripts/serve-static.mjs` automatically. It covers the desktop and
mobile homepage geometry, static article/category/sports output, interactive
search and schedule controls, article islands, and the public 404 page.

### Current search payload measurement

The historical migration measurement remains in
`migration/astro-page-assets.json`; it recorded the production-content search
HTML at 3,571,082 bytes. It is intentionally not rewritten. A deterministic
Weekly Wildcat fixture measurement before and after moving the index is shown
below (raw file sizes; the build metrics report records the current index
schema and byte count):

| Measurement | `/search/` HTML | Search JS assets | Static index |
| --- | ---: | ---: | ---: |
| Fixture before PR 3 | 19,449 B | 15,500 B | inline in HTML |
| Fixture after PR 3 | 12,623 B | 15,742 B | 2,755 B raw / 727 B gzip / 601 B Brotli |

The post-change index is emitted at `out/_byline/search-index.json`, carries
`schemaVersion: 1`, and is fetched same-origin after the lightweight search
shell hydrates. The before/after fixture builds measured 1,416 ms and 883 ms
locally respectively; those timings are directional local measurements, not a
production benchmark.

For live CMS content, copy `apps/web/.env.example` to `.env.local`. The main
inputs are `NEXT_PUBLIC_WP_API_URL` and `NEXT_PUBLIC_SITE_URL`; the names are
retained for deployment compatibility. Deterministic local/CI fixtures use
`BYLINE_PUBLICATION_FILE`, `BYLINE_DESIGNS_FILE`, and `BYLINE_CONTENT_MODE`.
`BYLINE_WORDPRESS_FETCH_CONCURRENCY` bounds paginated CMS requests.

To compare a candidate output with the recorded migration baseline:

```sh
cd apps/web
node scripts/capture-output-baseline.mjs out ../../migration astro
node scripts/compare-parity.mjs ../../migration/next-baseline-routes.json ../../migration/astro-routes.json
node scripts/compare-seo-parity.mjs ../../migration/next-baseline-seo.json ../../migration/astro-seo.json
```

## Publishing and failure behavior

The existing WordPress publish/deploy hook still starts the provider build. CI
and production call `npm run build:frontend`; that command now invokes Astro and
still publishes `apps/web/out`, so `wrangler.jsonc` and the Worker entry point do
not change.

Publication configuration may fall back to the checked compatibility defaults
when its discovery endpoint is unavailable, matching previous behavior. Posts,
contributors, categories, pages, and enabled sports datasets are required build
inputs: a failure names the endpoint and stops the export instead of silently
publishing an incomplete site. Corrections and coverage are explicitly optional
modules and log a warning when absent. A media download failure is recorded as
an external CMS fallback; all successfully materialized media must exist in the
current artifact or verification fails.

No Astro incremental route cache is enabled. Every build is a correct cold build
and deletes `.byline-build` first. The mirrored media directory is an optional
download cache only: deleting `apps/web/public/_wordpress-media` makes the next
build slower, not incomplete. To force a completely cold local build, delete
that ignored directory and run `npm run build:frontend`.

## Versioned invalidation

The constants are in `packages/content/src/versions.ts`.

- Bump `BUILD_CACHE_SCHEMA` when key serialization or snapshot/cache structure
  changes incompatibly.
- Bump `ARTICLE_RENDER_VERSION`, `ARCHIVE_RENDER_VERSION`, or
  `SPORTS_RENDER_VERSION` when output dependencies for that route class change.
- Bump `GLOBAL_LAYOUT_VERSION` when shared shell, global metadata, navigation, or
  theme behavior changes.
- Bump `MEDIA_CACHE_VERSION` when media naming or transformation semantics
  change.

These digests make a future incremental-build experiment possible, but they do
not participate in cold-build correctness today.

## Debugging

- Missing or extra route: inspect `.byline-build/expected-routes.json` and
  `out/_byline/routes.json`; the verifier prints the exact difference.
- Broken local image or stylesheet: the asset verifier prints both the page and
  unresolved path. Check `out/_byline/media-manifest.json` for download status.
- SEO mismatch: recapture the candidate and run `compare-seo-parity.mjs`; it
  reports the route and field.
- Slow or failed CMS input: inspect `out/_byline/build-metrics.json`. Snapshot
  timings are split into posts, contributors, categories, tags, corrections,
  pages, sports, media materialization, indexing, digest generation, and route
  discovery. Required failures include the endpoint category.
- Sports endpoint failure: enabled sports games, rosters, and teams are required
  and stop the build; coverage is optional and warns.
- A stale output suspicion: `astro-with-publication.mjs` recreates the build
  scratch directory and Astro recreates `out`; route closure also rejects stale
  HTML/XML/TXT artifacts.

`apps/web/scripts/crawl-production.mjs` can compare a deployed host against the
route manifest after a release.

## Rollback

The last known-good Next release is `v0.2.15`, commit `1ce10d1`. The migration
lives on `codex/astro-migration`. To restore the previous production renderer,
deploy that tag/commit through the same Cloudflare pipeline. Its frontend command
was `node apps/web/scripts/next-with-publication.mjs build`. The old route tree
and runnable exporter are not carried after cutover; the tag is the rollback
source. `apps/web/next.config.ts` remains static-export-only to preserve the
repository's compatibility invariant. Do not run Astro and Next as competing
production builds.
