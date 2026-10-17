# October 2026 build-performance measurements

Measured October 17, 2026 against current `main`
`e99a17b3af59f30a854e61ff7f4748661955b0c4` and this implementation. Node 26.7.0,
npm 11.19.0, Astro 7.3.1, same macOS machine. These are local build measurements,
not hosted Cloudflare queue/install/upload/deployment latency measurements.
[Machine-readable results](build-performance-2026-10.json) include actual route
render/restore paths and phase data. The [September migration benchmark](astro-benchmark.md)
is historical and is not reused as the baseline.

The audit started at `3444049`; `main` advanced during the task with immersive
storytelling and the 0.3.16 release. This branch was rebased, the new Gutenberg
paths audited, and the final controlled comparison/validation rerun on `e99a17b`.
The new blocks use canonical rendered HTML and local enhancement scripts, with no
additional public build dataset. Initial live-network observations below remain
labelled separately.

## Dataset and correctness

Fresh live responses contained 21 stories, 10 authors, 6 categories, 23 embedded
tags and 21 raw Pages (19 after existing public-page filtering), with no current
coverage/corrections/events. The verified artifact has 70 routes, 66 HTML documents,
316 mirrored files and one known missing-media fallback. The manifest also includes
336 edge redirects; those are not counted as prerendered routes.

The complete public responses and the exact media bytes from the verified baseline
were captured locally, then replayed for a controlled comparison. This preserves
canonical source URLs and the deployed media bytes. Every scenario deletes the
frontend media directory. Only `apps/web/node_modules/.astro` survives warm builds.
The snapshot JSON is 1,544,938 bytes before compression in this captured-response
fixture. The real WordPress producer additionally strips REST links/unneeded fields;
this payload number is the measured conservative fixture, not a claimed production
producer payload measurement.

All **66 HTML documents are byte-for-byte identical** between baseline and cold
snapshot output. Route inventories have zero additions/removals and semantic SEO
comparison has zero differences. HTML is 2,810,880 B, JS 257,716 B, CSS 207,933 B,
and mirrored media 100,581,917 B in both. Overall output is about 140.6 MiB;
small differences are diagnostic JSON/manifest timestamps and media timing records.
No route, SEO, asset, media, or static compatibility check was removed.

## Controlled comparison

The baseline uses the original code, replayed public REST responses and the same
media bytes over loopback HTTP. The optimized runs use a tiny discovery pointer
and one immutable artifact, plus the same media transport. Every binary is still
downloaded/materialized in each build; this is not a warm media-cache measurement.

<!-- BENCHMARK_TABLE -->
| Scenario | Complete command wall | Acquisition | Media discovery + materialization + rewrite | Astro excluding media | Postbuild | CMS acquisition requests | Rendered / restored |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Baseline cold | 2.830 s | Legacy overlap; see below | Legacy overlap; see below | 1.897 s wrapper including content/media | Included in total | 10 | 70 / 0 |
| Snapshot cold | 3.059 s | 0.051 s | 0.273 s | 1.658 s | 0.769 s | 2 | 70 / 0 |
| Warm no-op | 2.413 s | 0.052 s | 0.296 s | 1.051 s | 0.753 s | 2 | 18 / 52 |
| Single article edit | 2.379 s | 0.047 s | 0.248 s | 1.039 s | 0.800 s | 2 | 34 / 36 |
| Global change | 2.679 s | 0.049 s | 0.314 s | 1.213 s | 0.837 s | 2 | 70 / 0 |
| Unpublish | 2.433 s | 0.058 s | 0.230 s | 1.097 s | 0.738 s | 2 | 33 / 36 |
<!-- END_BENCHMARK_TABLE -->

Acquisition includes discovery, download, integrity/shape checks and parse. The
cold artifact download was 8.98 ms and validation/parse 15.06 ms. All content is
local thereafter; the renderer's attempted CMS REST request count is zero. Astro
excluding media includes compilation, local snapshot loading/indexing and rendering,
not just prerender CPU time. Postbuild includes compatibility materialization,
closed-set copying, redirects, manifests and all existing verification. Complete command wall is measured around the same `npm run build` in `apps/web`
for both versions, including npm startup and reporting. Internal `totalFrontendMs`
starts in the wrapper, so it is reported separately in JSON. Concurrent/network
phases overlap and columns do not sum exactly to command wall.

The controlled cold command is slightly slower (3.06 s versus 2.83 s); snapshot
validation and populating the incremental cache have a cost. The warm single-story
command is 2.38 s and restores 36 routes. No cold replay speedup is claimed.

The baseline did not have separate phase boundaries: its snapshot loader spent
449.11 ms acquiring content **and** mirroring media, inside a 1896.92 ms Astro
wrapper. Transport instrumentation measured 10 CMS requests (123 ms combined busy
wall time; 292 ms summed overlapping request durations), including 11 ms publication
bootstrap; 318 media attempts occupied 269 ms busy wall time (8135 ms summed
parallel durations). These overlap and must not be added as sequential phases.
The new named boundaries remove that ambiguity.

The edited story was `9544`,
`/2026/10/16/sports/in-photos-wildcats-c-team-football-undefeated-season/`.
Its title, excerpt and body changed together. Exactly 16 of 52 dynamic keys changed:
the story itself, 13 articles displaying its selected related/more-by card,
`/category/sports/` and `/author/gibson/`. The remaining 36 dynamic routes restored.
The other 18 routes render every build by design. A publication tagline edit
invalidated all 52 dynamic routes. Unpublish removed the article output and Astro
pruned the stale cache entry; verification rejected neither missing assets nor
stale routes. The benchmark additionally asserts that media outcomes do not change
between comparable scenarios, so more fallbacks cannot masquerade as an improvement.

## Live-network observations and limitations

The initial fresh live baseline at `3444049` was **24.53 s**, with 10 CMS requests, a 417 ms
publication fetch, and 20.54 s in the old combined content/media snapshot loader.
A first complete snapshot-backed live-media replay matrix measured 21.33 s cold,
18.45 s no-op, 17.38 s single-story, and 18.85 s global; every one retained the same
316 successful mirrors and one known fallback. Snapshot discovery/artifact were
replayed locally, so these are not real hosted snapshot-download timings.

A later repetition encountered upstream timeouts: one run took 155.67 s and fell
back for 134 images; subsequent runs failed more media. Those numbers are excluded
from performance comparisons because the output media set changed. This motivated
the controlled full-byte replay and the benchmark's media-comparability assertion.
Network variance and cold media dominate the live critical path; no universal
speedup or hosted publish-to-live SLA is claimed. The architectural result is
measured directly: two acquisition requests and reuse of unaffected Astro routes.

WordPress preparation was separately exercised through real Core controllers in
both supported environments, including public stories/Pages, authors, guests,
terms, corrections, coverage, events and referenced attachments. Idempotence,
private sentinels, active writers, revision changes during serialization and the
no-hook-on-failure gate are tested. An otherwise small local fixture preparation
measured 34.21 ms; that is not a production-scale WordPress generation claim.

## Dependency and cache probes

| Probe | Wall time | Result |
| --- | ---: | --- |
| Original root `npm ci` | 18.56 s | Baseline full workspace graph |
| Root `npm ci` with pinned Wrangler | 20.20 s | Full workspace graph |
| `npm ci --workspace @byline/web --include-workspace-root=false` | 14.58 s | Internal packages resolve; custom Astro-cache sentinel was deleted |

The scoped install is smaller/faster locally but removes restored custom cache
content. Its complete hosted install/cache ordering and dependency-resolution
parity were not established. Leave automatic install enabled and leave
`SKIP_DEPENDENCY_INSTALL` unset. No custom media cache is placed under Astro's
cache, and there is no unsupported persistent-cache assumption in the build.

## Reproduction

For a real current plugin artifact, run `wp byline build-snapshot prepare`, obtain
the artifact URL from `wp byline build-snapshot status`, and save its **public** JSON.
Then, from the repo root:

```sh
node apps/web/scripts/benchmark-snapshot-builds.mjs /absolute/public-snapshot.json /absolute/results
```

This runs cold, warm no-op, single-story, global and unpublish cases with full
verification and exactly pointer + artifact acquisition. It logs every rendered/
restored path, keys/dependencies, phase timing, media outcomes and output size.
Use a stable media fixture server when repeatedly exercising a large media set;
do not hammer the live origin to manufacture a favorable timing run.

For controlled full-byte replay, preserve a verified baseline `out` directory and
public REST responses. Preload `apps/web/scripts/benchmark-record-network.mjs`
with `NODE_OPTIONS=--import=<absolute-path>` and set
`BYLINE_BENCHMARK_RECORD_DIRECTORY=<absolute-directory>` when recording an anonymous
baseline build (or the explicit legacy acquisition mode). `requests.ndjson` contains `{url,status,name}` for each
saved JSON response; `name` points to its JSON body file. Start:

```sh
node apps/web/scripts/benchmark-replay-server.mjs /absolute/public-responses /absolute/verified-out 8894
BYLINE_BENCHMARK_REPLAY_ORIGIN=http://127.0.0.1:8894 \
  node apps/web/scripts/benchmark-snapshot-builds.mjs /absolute/public-snapshot.json /absolute/results
```

To run the original baseline in a separate checkout of the measured commit,
use the same installed dependency versions, clear its media/cache, set
`BYLINE_BENCHMARK_REPLAY_ORIGIN`, and preload
`apps/web/scripts/benchmark-replay-network.mjs` with `NODE_OPTIONS=--import=<absolute-path>`.
`BYLINE_BENCHMARK_TRACE_FILE=<absolute-ndjson-file>` records request intervals.
The replay scripts are benchmark-only and are never imported by production code.

## Validation and behavioral corrections

Validation covers TypeScript/Astro, all workspace unit/PHP tests, plugin build and
ZIP validation, static/SEO closure, public Chromium tests, both WordPress E2E suites,
and a pinned-Wrangler dry run using `apps/web/wrangler.jsonc`. CI explicitly builds
through snapshot discovery and then runs public browser tests against that output.

Two pre-existing correctness issues found during the audit are fixed: duplicate
story deployment hooks advanced/scheduled the same publication twice, and the
registered correction-text sanitizer accepted Core's metadata key as its optional
integer length argument, causing a TypeError when saving a real correction. The
callback now forwards only the value. Public output on the measured live dataset
is unchanged. Snapshot collection also removes legacy public-list endpoint limits
rather than truncating larger publications at 50/100 guests/coverage/corrections.

Required dashboard actions are in the prominent **Cloudflare settings to change
after merge** section of the [Workers deployment recipe](../../examples/deployment/cloudflare-workers.md).
