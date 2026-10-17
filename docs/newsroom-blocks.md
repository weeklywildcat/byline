# Newsroom blocks

Byline's newsroom library is a small set of publication-neutral Gutenberg
blocks for authored Pages and Posts. The blocks are stored as normal Gutenberg
comment markup, so an editor can move, copy, and revise them without creating a
second page or publishing system.

## Block set

- **Stories** reads published Posts from the latest, category, tag, author, or
  manual source. It supports a bounded count, grid/list/featured/related layouts, and
  optional image, excerpt, byline, and date fields.
- **People** reads public author profiles, with all/selected sources, the
  existing role field as an optional filter, and portrait-grid or compact-list
  layouts.
- **Sports Schedule** and **Game Score** remain registered for historical
  content. Sports records are a fixed archive in native Pages; these are not
  tools for creating new schedules or games (see `sports-archive.md`).
- **Events** reads upcoming canonical events, keeps the WordPress site timezone
  for comparisons and display, and optionally filters by the existing event
  type.
- **Poll** reads either the active poll or a selected published poll. The
  server-rendered payload is public-safe; the static Astro site hydrates open
  polls with the existing `/api/polls/active` and `/api/polls/vote` contract and
  its `ww_voter_id`/`ww_poll_voted_<pollId>` cookies.
- **Game Score** follows the article's Primary Game by default. A manual game
  is an explicit fallback, but the block never asks an editor to duplicate
  scores, status, location, or date data.
- **Correction Notice** is static content: type, date, and notice text are
  serialized in the post and do not create a database record.

Dynamic blocks use the same canonical WordPress data that powers the public REST
aliases. Editor previews request only public story, author, game, event, and
poll fields; private workflow data and low-count poll totals are not exposed.
Published-only filters, bounded limits, and server-side validation apply again
when content is rendered.

## Game-card compatibility

The older automatic article game card remains available for legacy content. A
structured `byline/game-score` block records its resolved game ID in the post
REST settings. The static article renderer suppresses the legacy card only when
that list contains the article Primary Game. If an editor deliberately chooses
a different manual game, both cards remain, making the choice deterministic and
visible. The legacy `ww_*` metadata, routes, cookies, and card markup remain
unchanged for existing consumers.

## Publication identity and styles

The `byline/publication` block-binding source exposes only safe public values:
publication name, short name, public site URL, masthead URL/alt text, and
contact URL. The source is feature-detected so older supported WordPress
installations continue to load the plugin.

The plugin registers reusable styles for groups, buttons, button groups,
quotes, pullquotes, separators, Details, tables, images, galleries, and lists.
They are presentation variants of Core blocks, not replacement block types.
The shared stylesheet is publication-neutral; a theme supplies its tokens.

Page and Post patterns are starter content, not a locked template system. Page
patterns cover information, mission, standards, recruiting, contact,
leadership, staff, special coverage, sports, events, photo-led, resources,
FAQ, two-column, CTA, facts, key numbers, quotes, related resources, and
corrections. Post patterns cover sports recap/preview, correction, fact box,
and quote callout. WordPress's Blank option remains available, and there is no
newsletter block or newsletter pattern in this library.

## Story presentation library

**Byline gives editors semantic newsroom presentation choices; it does not
expose arbitrary CSS/layout engineering to writers.** Press `+`, search for the
editor-facing name, and add content. Core retains its media library, alt text,
captions, crop/focal point, file controls, and video text tracks. These are
ordinary Gutenberg blocks; there is no second article format or layout builder.

| Editor-facing name | Underlying block | Intended use | Mobile behavior |
| --- | --- | --- | --- |
| Portrait + Text | `core/media-text` variation/style | A contained portrait beside reporting; wide, 40% media by default | Media first, then text below 700px |
| Photo Pair | `core/gallery` variation/style | Two photographs with individual captions; original proportions | Two columns until 540px, then one |
| Photo Gallery | `core/gallery` variation/style | A photo feature with readable credits and larger-image links | Three columns, two below 900px, one below 540px |
| Photo Essay (Patterns) | Wide `core/group` with Image and Paragraph blocks | An editable visual narrative; duplicate, reorder, or delete any block | Single-column narrative with prose measure preserved |
| Reported Quote | `core/quote`, existing `byline-source-quote` style | A source quotation with smaller attribution | Compact inset |
| Pull Quote | `core/pullquote`, existing `byline-feature-quote` style | Prominent left-aligned editorial quote between rules | Type scales down |
| Key Facts | `core/group` with Heading and List | Verified facts, links, and sources at normal prose width | Readable single column |
| Timeline | `byline/timeline` | Ordered chronology with display labels and inline reporting | Always vertical |
| Document Viewer | `core/file` variation/style | PDF preview, direct file link, and optional download | Inline preview hidden below 540px; file link and download remain |
| Related Coverage | Existing `byline/stories`, `related` layout | Up to three selected published stories, compact thumbnails/titles | Compact stacked list |
| Story Audio | `core/audio` variation/style | Native controls and caption; metadata preload, no autoplay/loop | Full-width controls |
| Story Video | `core/video` variation/style | Self-hosted video with native controls/text tracks; no autoplay | Intrinsic proportions, including portrait |

Photo Pair is intended for two images; Core still permits adding/removing them.
Photo Gallery defaults to media links. On the public article, a small lazy-loaded
native dialog enhances image-file links in galleries only: Previous/Next,
arrow keys, Escape, Close, and restored focus. Without JavaScript, those links
still open the files. Captions and alt text remain separate. Unrelated image
links are not enhanced. Private preview keeps reader actions disabled.

Timeline starts with two entries, permits up to 25, and provides inline Add,
Remove, Move up/down controls with focus following the changed entry. Its date
labels are editorial text (such as “Fall 2026”), not fabricated machine dates.
Only this content model requires a new custom block; saved output is an ordered
list and requires no reader JavaScript.

Related Coverage reuses the existing selector and PHP renderer. The selector
requests published Posts; the server checks visibility again, excludes the
current story, caps output at three, and omits excerpts/bylines. Automatic
end-of-story Related Stories remains separate and unchanged.

Existing News Grid, Feature Grid, source/feature quote styles, and Fact Box
patterns retain their names and remain valid. No content migration is needed.

## Shared rendering and widths

Astro owns a minimal compatibility layer for the Core Gutenberg markup it
publishes because it does not load a normal WordPress theme frontend. That
structure and authored block design live in
`packages/ui/src/newsroom-blocks.css`, imported by `BaseLayout.astro`, emitted
through the plugin's existing block assets, and imported by
`wordpress-plugin/src/article-preview.tsx`. `article.css` owns the article
shell and typography, not a separate set of authored block layouts.

Normal prose uses `--article-width` (760px). Direct `.alignwide` blocks can
break out to 1040px, centered within the article shell's available width. The
editor canvas establishes the equivalent width container, including in its
iframe. Media shrink naturally; portrait photographs are contained rather
than cropped unless the editor deliberately chooses Core's crop/image-fill
controls. Photo Essay paragraphs retain prose measure inside its wide Group.

Uploaded videos retain intrinsic proportions. Only Core embeds with explicit
aspect-ratio classes receive ratio-based frames. PDF objects/iframes never
inherit a blanket video ratio. File links remain available even if embedding
fails, and non-PDF files render without an empty viewer.

The repository targets WordPress 7.1 and legacy 6.6. The presets use the Core
schemas supported there and filter defaults against each installed block's
registered attributes. Newer optional attributes are omitted when unavailable;
Core remains responsible for serialization. Variations load in Gutenberg only.
WordPress 7.1 marks PDF objects hidden pending its frontend Interactivity API;
the shared CSS explicitly displays those objects on larger screens because
Astro does not run that runtime. Private preview converts PDF objects to
sandboxed frames and preserves embed geometry while keeping actions disabled.
Preview frames retain their selected 1200/768/390px viewport even when the admin
window is smaller; the frame scales to fit instead of changing its breakpoint.

## Validation

`npm test` includes preset/state/serialization tests and PHP registration,
patterns, and public-story visibility checks. The opt-in Gutenberg test
`story-presentations.spec.ts` verifies discoverability, valid save/reopen,
Timeline focus/reordering, and Preview as Byline at 1200/768/390px. It runs in
both supported WordPress environments.

`tests/fixtures/story-presentations-blocks.json` defines the representative
Gutenberg story. The browser spec can refresh its saved and REST-rendered HTML in `story-presentations.json`
with `BYLINE_UPDATE_STORY_FIXTURE=1` when run against the primary environment.
The public fixture build publishes that WordPress-rendered content through the
actual Astro article route. Public geometry checks cover 1440, 1200, 768, 390,
and 320px, plus keyboard lightbox behavior and no-JavaScript file links.

## Static-site and accessibility rules

The public Astro application stays static. WordPress renders dynamic block
HTML during the content fetch; Astro imports the same shared CSS. Polls use
the existing hydration layer and gallery enlargement is progressively enhanced. Empty results use a
plain explanatory state, malformed dates are ignored, scores are shown only
when the canonical record supplies them, and upcoming games never display
invented scores or live status. Lists, headings, forms, labels, time values,
focus states, and responsive layouts are part of the shared contract.
