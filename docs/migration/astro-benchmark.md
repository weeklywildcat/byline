# Astro migration benchmark

Measurements were taken against the same live Weekly Wildcat CMS snapshot on
September 6, 2026, using Node 26 on the same local machine. Next was measured
before cutover; Astro was measured after a cold `.byline-build` reset. Network
and CMS latency make wall times directional rather than laboratory results.

| Metric | Next 16.3.2 | Plain Astro 7.3.1 | Astro incremental warm |
|---|---:|---:|---:|
| Cold build wall time | 50.67 s | 34.65 s | Not tested; not enabled |
| No-op/warm build | Not tested | Not tested | Not tested; not enabled |
| Edit/publish/unpublish one article | Not tested | Full cold build | Not tested; not enabled |
| WordPress snapshot time | Not instrumented | 26.84 s | Not tested |
| Sports input time | Not instrumented | 26.37 s | Not tested |
| Media materialization observations | Not instrumented | 2.82 s aggregate | Not tested |
| Index/digest/route discovery | Not instrumented | 0.45 s | Not tested |
| Remaining render/build time | Not isolated | about 7.81 s | Not tested |
| Public routes | 404 | 404 | Not tested |
| HTML documents | 403 | 401 | Not tested |
| Total output | 100.73 MiB | 49.36 MiB | Not tested |
| HTML bytes | 22.18 MiB | 10.29 MiB | Not tested |
| Total generated JS | 644.4 KiB | 243.9 KiB | Not tested |
| Mirrored media | 35.46 MiB | 35.11 MiB | Not tested |
| Homepage linked JS | 587.3 KiB | 3.9 KiB | Not tested |
| Interactive article linked JS | 592.0 KiB | 8.7 KiB | Not tested |
| Category archive linked JS | 574.1 KiB | 0 | Not tested |
| Sports team linked JS | 574.7 KiB | 0 | Not tested |
| Search linked JS | 585.2 KiB | 13.3 KiB | Not tested |

Linked-JS figures count unique local JavaScript assets referenced by each HTML
document, including Astro island component and renderer URLs. Inline script
payloads and CSS are reported separately in the checked-in
`migration/*-page-assets.json` files. One CMS image URL returned 404 during both
builds; Astro records that known source as an explicit external fallback while
verifying all 161 successfully mirrored sources. The Astro postbuild copies only
the current manifest's closed media set, so stale download-cache entries do not
inflate or contaminate the deployment artifact.

The route inventories have zero additions and zero removals. The semantic SEO
comparison has zero differences across title, description, canonical, and Open
Graph URL. The two fewer Astro HTML documents are internal Next implementation
pages (`/_not-found/` and the empty coverage static-params placeholder), not
public routes; Astro creates both public 404 output forms directly.

Qualitatively, Astro removes the public-site dependency on a runtime application
framework and lets static pages ship no client React at all. WordPress fetching,
relationships, route identities, and media identities now have named,
testable boundaries. Cloudflare deployment is unchanged because the artifact is
still `apps/web/out`. Debugging is more direct because route, SEO, asset, media,
and per-dataset timing reports are generated on every build.

Incremental rendering remains a follow-up. The versioned dependency digests are
in place, but enabling an experimental cache before validating every mutation in
the benchmark matrix would weaken the cold-build guarantee. Image transformation
was also deliberately left unchanged so its quality/performance tradeoff can be
benchmarked separately.
