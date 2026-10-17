# Astro frontend operations

Historical migration notes: the layout designer, design APIs, and generic themes have since been removed. The current site uses the fixed Weekly Wildcat layout; see [architecture](../architecture.md).

Byline's production frontend is a static Astro build. WordPress remains the
control plane and authoritative content store; Cloudflare remains a static host
plus the existing poll proxy.

```text
WordPress durable deployment job
  prepare immutable snapshot before hook
            |
            v
  pointer + one verified artifact
  local indexes + complete render cache keys
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
| Current post-endpoint fixture | 12,828 B | 15,742 B | 5,157 B raw / 889 B gzip / 744 B Brotli |

The post-change index is emitted at `out/_byline/search-index.json`, carries
`schemaVersion: 1`, and is fetched same-origin after the lightweight search
shell hydrates. The before/after fixture builds measured 1,416 ms and 883 ms
locally respectively; the current post-endpoint fixture build measured 1,253
ms. These timings are directional local measurements, not a production
benchmark.

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

Production now fails closed on missing/corrupt/stale/incompatible prepared
snapshots. Publication configuration comes from the same artifact; required
corrections/coverage/event arrays can be empty but cannot be absent. The old
publication-default/REST behavior is retained only for development and the
explicit `BYLINE_LEGACY_REST_BUILD=1` rollout escape hatch. Media failures retain
the established explicit external fallback, and every materialized asset remains
subject to closure verification.

Astro incremental builds are enabled for dynamic routes with complete render
dependency keys, independent of the older route digests. Static routes continue
to render each build. `.byline-build` is recreated; `node_modules/.astro` is the
supported persistent framework cache. Media is materialized afresh in production,
with sitewide deduplication and bounded downloads. Read [snapshot operations](../build-snapshots.md)
for schema/revisions, atomic generation, race handling, retention, force rebuilds,
recovery, and the required [Workers dashboard settings](../../examples/deployment/cloudflare-workers.md).

Fresh measurements are in [the October build-performance report](build-performance-2026-10.md).
The earlier migration benchmark below is historical, not the current route count.

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
  reports the route and field. The Next baseline is a historical snapshot and
  intentionally differs from the live site in places where matching it would
  preserve a bug: `article:published_time`/`modified_time` are now timezone-aware
  ISO timestamps, `article:author` is a profile URL, social image URLs are
  absolute, the homepage title names the publication, and section descriptions
  are no longer placeholders. `scripts/verify-seo.mjs` (run by `postbuild`) is the
  current contract.
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
