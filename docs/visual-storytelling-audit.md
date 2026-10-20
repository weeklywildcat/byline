# Visual storytelling audit (Byline 0.3.24)

An audit of the tools introduced or touched by PRs #132, #135, #137, #141 and #142,
done against the real thing: a local WordPress 7.1 (wp-env), the built plugin, the
static Astro site built from that WordPress, and Playwright at 1440, 1100, 820, 768
and 390px. The demonstration article is "The lunch squeeze" (real photographs,
realistic text lengths, long captions, mixed credits); the compatibility corpus is the
block markup that 0.3.24 itself saved (`tests/fixtures/storytelling/`).

**Evidence grades.** *Verified* = reproduced in a browser or test and fixed or pinned
by a regression test. *Judgment* = a design opinion, stated with its reason.
*Suspected* = plausible, not reproduced.

## System-level findings

| # | Finding | Grade | Root cause | Severity | Action |
| --- | --- | --- | --- | --- | --- |
| S1 | Preview as Byline rendered a Standard article for an Immersive story | Verified | The preview mounted `ArticleView` directly; only the public route chose between Standard and Immersive | High | One shared `PresentedArticleView` used by both; preview loads the hero styles; says which presentation it shows; E2E pins it |
| S2 | Wide, full-bleed, Portrait + Text and Photo Essay photographs rendered as 300px thumbnails | Verified | `width: auto` on an image whose `sizes` is WordPress's `auto, ...`; the browser resolves it to the 300px placeholder | Critical | `width: 100%` + `object-fit: contain` (root cause, not an override) |
| S3 | Post editor canvas was a 1300px column, not the 760px article | Verified | The theme's template marks the root block list `alignfull` (inline `max-width: none`) and the plugin's rule lost to it; nothing tested the canvas width | High | Canvas owns its measure; wide / full blocks break out with the same math as the public page; geometry E2E at three widths |
| S4 | Page-editor CSS changed paragraph and list sizes in the Post editor | Verified | `page-blocks.css` selected every `.editor-styles-wrapper` and loaded on every editor screen | Medium | Scoped to `.post-type-page` |
| S5 | The 49KB shared stylesheet shipped 14 times (once per block) plus a 15th handle | Verified | Each block's `style.css` imported `newsroom-blocks.css` | Medium | One build entry, one handle, enqueued once |
| S6 | Photograph credits baked into saved markup: duplicated ("Photo: Photo courtesy of..."), creator ignored, stale after a correction, inconsistent with Core images | Verified | Blocks snapshotted only the credit line, with a literal prefix; Core images use the render-time resolver | High | Credits resolved from the attachment when the article renders (replaces baked lines in existing content) |
| S7 | Saved `srcset` snapshot with `sizes="(max-width: 1600px) 100vw, 1600px"` made every viewport fetch the largest file and went stale | Verified | `imageFromMedia` copied WordPress's generic sizes into the block | Medium | Responsive candidates resolved per block layout at render time; not saved |
| S8 | Editor instructions leaked to readers ("Choose both photographs...", "Annotated image pending.") and empty timeline events printed empty list items | Verified | Save functions render their own empty states | Medium | Unfinished blocks print nothing publicly (render filter) |
| S9 | A deprecated hook notice (`block_categories`) printed in the editor | Verified | A legacy filter kept "for older editors" below the supported minimum | Low | Removed |
| S10 | Astro's incremental build restored pages that referenced a CSS file that no longer existed, failing the build | Verified (locally) | Incremental build does not follow `@import`ed stylesheets | High if the cache persists between deploys (suspected) | The build wrapper fingerprints sources and styles and drops the incremental cache when they move |
| S11 | Five competing caption declarations (article.css, globals.css twice, newsroom CSS, editor canvas); photographs framed in a hairline in four places | Verified | Copy-and-patch across layers | Medium | `figure.css` owns captions, credits and labels; frames removed |
| S12 | The editor could not be trusted to show the final layout (widths, context boxes, margin notes) | Verified | S3 + S4 | High | Fixed; checked with screenshots |

## Feature inventory

Severity is for a public launch. "Retire" means removed from the inserter for new
content; existing published content keeps rendering and editing.

| Feature | Works? | Editing experience | Public visual | Severity | Action |
| --- | --- | --- | --- | --- | --- |
| Visual Chapter (Cover) | Yes | Core's own; discoverable | Good | Low | Keep |
| Wide / Full-bleed Photo, Full-bleed Video | Broken (S2) | Variations only set alignment | Broken | Critical | Fix S2; retire the three variations (Core's alignment control does the same) |
| Photo Gallery / Photo Pair | Yes (#137 delivery is sound) | Core's | Good | Low | Keep Photo Gallery; fold Pair into it (columns control); keep the Pair style for old content |
| Portrait + Text | Broken image width (S2) | Core's | Fixed | High | Keep |
| Photo Essay | Broken image width (S2) | Pattern | Fixed | Medium | Keep |
| Annotated Image | Works | Forms: every annotation shows every field and two sliders; photo upload UI above the picture | Plain; list needs hierarchy | High | Redesigned (see the worker report in `docs/newsroom-blocks.md`) |
| Before / After | Works; label order reversed (After left, Before right) | Two upload fields, no preview | Right idea, wrong order; leaked instructions (S8) | High | Redesigned |
| Scrollytelling + Story Step | Works | Nested blocks only; no overview of the sequence | Caption and credit run together; no stage proportions | High | Redesigned |
| Timeline | Works | A stack of text fields with three buttons per row | A list with a rule and dots | High | Redesigned |
| Chart / Map | Static graphic rendered at 300px; blank fallbacks | One long form | Three undifferentiated lines of source, notes, credit | High | Redesigned |
| In This Story | Works | Fine | Fine | Low | Keep |
| Document Viewer | Works (PDF object geometry sound) | Core's | Fine | Low | Keep |
| Story Audio / Story Video | Works | Variations equal Core's defaults | Fine | Low | Retire the variations; keep the styles |
| Related Coverage | Works | Fine | Fine | Low | Keep |
| Key Facts, Reported Quote, Pull Quote | Works | Fine | Boxed, double borders, three competing rule styles | Medium | One supporting-context family |
| Context, Why It Matters, What's Next, How We Know, Editor's Note, Margin Note | Works | Six near-identical variations | Fine | Medium | Context Box (renamable heading), Editor's Note, Margin Note |
| Read More, Methodology, Full Statement | Works | Three variations of one `<details>` | Fine | Low | One Expandable Section |
| Data Table, Comparison Table | Works | Two variations | Fine | Low | One Data Table (Comparison style kept) |
| Comparison, Main + Aside, Three Key Numbers | Works | Main + Aside duplicates Margin Note | Fine | Low | Retire Main + Aside |
| Immersive hero (Standard / Immersive option) | Public yes; preview no (S1) | Clear two-choice panel | Strong | High | Fixed S1 |
| Custom per-story presentations (#141) | Public yes | Developer-only | n/a | Low | Documented; the preview says it cannot preview them |

## Design judgments (not defects)

- A story tool earns `alignwide` when seeing it large changes what the reader
  understands; reading material stays in the 760px column.
- Supporting context is set apart by a rule and a label, never a card.
- The Weekly Wildcat accent colour marks one thing at a time.
- Motion is limited to the Before / After divider, the scrollytelling stage and focus.

## Limits of this audit

- The browser pass used real photographs derived from three newsroom images and
  tiny placeholder PDF / audio / video files; real recordings were not available.
- Third-party embeds (Datawrapper, Flourish, Google Maps, OpenStreetMap) are
  intercepted by the test harness; production providers were not loaded.
- Screen-reader behavior was checked through roles, names and live regions, not
  with a screen reader.
