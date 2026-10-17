# Public build snapshots and incremental static builds

WordPress owns the complete public build input. Astro remains a fully static
renderer, and the existing thin Worker serves `apps/web/out` plus its poll proxy.
There is no SSR service, new database, D1 binding, or changed-file uploader.

## Deployment lifecycle

A public write advances the existing public revision and records deployment debt.
The request coalesces its deployment scheduling at shutdown, after Gutenberg,
REST metadata, contributor relationships and term assignments have settled.
The existing durable deployment job prepares a snapshot **before** sending the
provider hook. Preparation failure returns a retryable job error and sends no
HTTP request. Cron, REST retry, WP-CLI and legacy trigger adapters share this gate.

The generator captures revision R, gathers canonical public data directly through
Core controllers/domain serializers, validates it, writes a temporary file in the
artifact directory, and rereads R before atomic rename and pointer promotion.
No HTTP requests back to WordPress are involved. A revision change rejects the
artifact; the normal job retry/coalescing behavior prepares the newest revision.
The expected revision is monotonic, including across concurrent requests. A hook
success still means requested; only the existing public manifest check proves Live.

Generation and Core public writes also share a per-site MySQL advisory lock.
Public pre-write hooks take it before changing content, terms, relationships,
profile fields, attachment metadata or publication configuration. Writers wait
up to 30 seconds; a generator encountering a writer returns a retryable error.
The OS/DB release locks after a crashed request. A private writer marker additionally detects interrupted multi-step saves.
Once the DB lock proves no writer remains active, orphan markers are removed and
the settled CMS state receives a new revision before snapshot generation. The generator rereads revisions directly from the DB,
so an in-process WordPress object cache cannot conceal another writer's revision.
Before canonical serialization, the generator clears WordPress runtime caches so
values primed before a concurrent writer cannot enter a newer revision. Producer/
Core version changes advance the revision and invalidate discovery until a new
artifact is prepared. Normal plugin/theme/Core upgrades and rendering-related
Core settings participate in the same public-change lifecycle.
Revision increments and expected-revision maxima use atomic SQL against existing
WordPress options. There are no new tables.

Published post/Page saves, publish/unpublish/delete, public guest/coverage/
correction/event records, public contributor assignments, author profile fields,
category/tag edits and assignments, referenced attachment fields, and public
publication settings participate. Autosaves/revision posts, ordinary drafts,
editorial notes, tasks, jobs, feedback and poll votes do not. Unreferenced media
edits do not schedule builds. Legacy sports source records remain fixed archives
in native Pages, and are not queried as live sports datasets by the renderer.
Custom integrations that bypass Core hooks with direct SQL must explicitly call
`byline_public_mutation()` around their public write and use the normal lifecycle.

## Contract and public storage

The contract is [public-build-snapshot.schema.json](../schemas/public-build-snapshot.schema.json),
with concrete consumer types/validation in `apps/web/lib/prepared-snapshot.ts`.
Schema v1 includes `schemaVersion`, `revision`, `generatedAt`, `sourceTimezone`,
`publication`, `datasets`, and dataset `counts`. The publication revision equals
the artifact revision. WordPress's source timezone preserves the school-event
endpoint's upcoming cutoff when an unchanged snapshot is built on a later day.

Every required dataset is present, including genuinely empty arrays:

| Dataset | Public projection |
| --- | --- |
| `posts` | Published, non-password-protected stories; rendered Gutenberg HTML, timestamps, bylines, corrections, display settings and canonical embedded author/media/terms |
| `authors` | Canonical public directory/profile records, including explicitly public contact fields; never raw account objects |
| `guests` | Published guests with public profiles; byline-only guests remain in their stories |
| `categories`, `tags` | Canonical public term fields, including empty archives |
| `pages` | Published public/noindex Pages; operational/internal Pages are excluded |
| `corrections` | Public notices attached to included published stories |
| `coverages` | Public collections and their canonical public story projections |
| `schoolEvents` | Published canonical event records; upcoming filtering runs locally each build |
| `attachments` | Only referenced public attachment metadata needed for responsive media/attachment fallback; no binaries or full library dump |

Collectors use explicit field allowlists around canonical serializers and render
in anonymous user context, restoring the caller afterward. Attachment metadata
also passes Core anonymous read-permission checks (including private parents). Drafts,
protected content, private workflow state, staff notes/tasks, credentials, deploy
hooks, Discord secrets and admin fields do not enter the artifact. Tests seed
private sentinels in real WordPress and exercise the canonical Core serializers.

Artifacts live under `wp-content/uploads/byline-build-snapshots/`:

```text
snapshot-v1-r<revision>-<sha256>.json
```

The digest covers the **exact UTF-8 artifact bytes**. It and `bytes` are in the
small discovery pointer, avoiding a self-referential JSON digest. Temporary files
and the completed artifact are on the same filesystem, so rename is atomic.
Preparation reuses an existing artifact only for the exact schema/revision with
matching size and digest. The private completed-pointer option is never promoted
for a failed generation. The current artifact is protected from pruning; normally
four recent artifacts are retained, with a one-day reader grace and a bounded
burst allowance (at most 20 older artifacts). Old crashed temporary files are
removed after an hour. An evicted artifact produces a build failure, never a
partial site; rediscover/retry to consume the current completed revision.

`GET /wp-json/byline/v1/build-snapshot` only reads the completed pointer. It never
serializes publication content on demand. It returns 503 if the current revision
is not ready and always sends `Cache-Control: no-store, max-age=0`. The artifact
directory ships a narrowly scoped Apache immutable-cache rule. On Nginx/CDN
origins, configure `public, max-age=31536000, immutable` for completed
`snapshot-v*-r*-<digest>.json` files; never apply it to REST discovery.

## Frontend and media

The build wrapper downloads the tiny pointer and one artifact, validates byte
length/SHA-256/schema/revision/required datasets, and writes the verified local
input under `.byline-build`. Publication configuration comes from that artifact.
`BYLINE_EXPECTED_REVISION`, when supplied by an external pipeline, is a minimum;
a completed newer revision safely supersedes it. Cloudflare deploy hooks do not
forward the plugin's custom headers as build variables, so ordinary Workers
Builds consumes the fresh current completed pointer. The public manifest may not
claim a revision different from the verified snapshot.

All standard/public/headless loaders resolve from that local input, including
homepage, metadata, category/author views, Pages, coverage, search, feeds and
sitemaps. The renderer process blocks **every** CMS REST request and records
violations on disk, so even a caller swallowing an exception fails postbuild.
CI builds through a local pointer/artifact server and asserts exactly two requests
plus the complete existing verification and public browser suite.

Media work follows content acquisition. Discovery walks the complete dataset,
collects canonical URLs and attachment identities from render inputs (not unused
attachment-catalog derivatives), deduplicates sitewide, then
downloads with bounded concurrency (8 by default; `BYLINE_MEDIA_CONCURRENCY`,
clamped to 1–16). Each canonical URL has one download promise per build. Existing
deterministic paths, responsive variants, gallery originals, image sitemap
originals, profile images, presentation aliases, attachment fallback and explicit
missing-media fallback remain. Failed/non-image responses cannot become corrupt
image files. Snapshot attachment metadata replaces late CMS attachment requests.

Production clears the local media directory before materialization. **There is no
persistent media cache.** The install probe deleted a custom subdirectory under
`node_modules/.astro`; relying on it would be unsafe. Postbuild still copies only
the current manifest's closed set and verifies media, routes, assets and SEO.

## Incremental invalidation and reports

Astro 7.3.1 uses the official `experimental.incrementalBuild` flag. Concurrency
remains its default of one. Dynamic article, category, author, Page and coverage
routes return `cacheKey`; static routes, feeds, sitemaps and homepage still render.

`route-cache.ts` keys all public presentation configuration except the revision
counter itself, plus effective public site/CMS URL overrides, process timezone,
media mode and the local publication day (masthead date). Articles share
the renderer's actual presentation calculation: their own complete story,
resolved profiles, contributor coverage areas, selected related/more-by cards,
corrections, metadata inputs and primary-game input. An unrelated candidate's
body alone does not invalidate an article that never displays it. Archives include
the displayed story records, not just IDs. Pages/coverage include their own
rendered data. Global navigation, branding, URL, feature, theme and SEO inputs
invalidate affected routes. Astro independently hashes imported modules for code
changes and removes outputs no longer emitted by `getStaticPaths()`.

Reports in `apps/web/.byline-build/` include:

- `frontend-phases.json`: acquisition/download/parse, CMS request count, Workers
  identity, actual rendered/restored route paths from Astro's log.
- `media-phases.json`: discovery, bounded materialization and rewrite wall times.
- `route-cache-keys.json`: route → key → selected dependency identities.
- `performance.json`: end-to-end frontend time, postbuild time, output bytes and
  all phase metrics. Astro time minus media includes compilation, local input
  loading, indexing and prerendering; it is not labelled pure prerender CPU time.
- Existing expected route, snapshot timing, media manifest and verification reports.

A Workers build uses `WORKERS_CI_BUILD_UUID`, then `WORKERS_CI_COMMIT_SHA`, for a
stable request identity. `WORKERS_CI_BRANCH` is recorded. Older provider variables
remain supported; local builds get a UUID instead of a time-based cache identity.

## Rollout, recovery and force rebuild

Run WP-CLI as the WordPress filesystem user, or ensure the public snapshot
directory remains writable by both CLI and the web/cron process.

1. Install the updated WordPress plugin **before** the frontend cutover.
2. Run `wp byline build-snapshot prepare`, then `wp byline build-snapshot status`.
   Confirm discovery returns the same current revision, byte count and digest.
3. Enable the dashboard settings in the [Workers recipe](../examples/deployment/cloudflare-workers.md).
4. Retry the existing deployment job (`wp byline deployment retry`) and inspect
   the public manifest before calling it Live.

A cold Astro cache is always supported. Missing cache entries render normally.
To force a full render, from the repo root run:

```sh
npm run build --workspace @byline/web -- --force
```

To clear the local Astro cache, remove `apps/web/node_modules/.astro`; no CMS data
is lost. Cloudflare: Worker → Settings → Build → Build cache → Clear Cache.
Do not clear the immutable WordPress artifacts just to clear renderer output.

For 503 discovery, inspect `wp byline build-snapshot status`, the durable job's
`lastError`, upload-directory write permissions, active/orphan writer markers and
cron execution. Retry preparation/job after the writer finishes. For missing,
corrupt, stale or unsupported artifacts, fail the build, repair/regenerate the
current snapshot, then retry. Never substitute empty arrays. To diagnose a cached
route, compare its dependency report and Astro's restored/rendered log; use
`--force` to check the cold output and retain the failing reports.

`BYLINE_LEGACY_REST_BUILD=1` is an explicit temporary rollout/diagnostic escape
hatch for the old acquisition path. It is **not** a silent production fallback;
leave it unset in Workers. Local `astro dev` retains REST loading. Deterministic
fixtures retain `BYLINE_CONTENT_MODE` and `BYLINE_PUBLICATION_FILE`; a supplied
snapshot URL/file explicitly takes precedence. `BYLINE_BUILD_SNAPSHOT_FILE` is an
intentional offline fixture/benchmark input; production should use discovery.

Official APIs verified for this change:
[Astro incremental builds](https://docs.astro.build/en/reference/experimental-flags/incremental-build/),
[Workers build cache](https://developers.cloudflare.com/workers/ci-cd/builds/build-caching/),
[Workers variables](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/),
[watch paths](https://developers.cloudflare.com/workers/ci-cd/builds/build-watch-paths/).
