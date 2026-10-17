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
Photo Gallery defaults to media links.

### Photo Gallery media delivery

One photograph plays several roles, and each layer does one job:

| Layer | Markup | Job |
| --- | --- | --- |
| Visible page | `<img src>` | An ordinary crawlable image and browser fallback |
| Responsive delivery | `srcset` + `sizes` | Lets the browser pick a candidate for the rendered size and screen density |
| Full media link | `<a href="FULL">` | Direct access and no-JavaScript enlargement for new galleries |
| Byline metadata | `data-byline-full-url` | A reliable full-size source for the progressive lightbox |
| Image sitemap | `<image:loc>FULL</image:loc>` in `/sitemap.xml` | Tells Google about the high-resolution editorial photograph |
| Existing SEO | `NewsArticle.image`, Open Graph | Identifies the representative article image (unchanged) |

**Why the inline image is not the full original.** The article uses responsive
candidates (300, 768, 1024, 1536, 2048px as WordPress generates them) so a
three-column gallery does not download several multi-megabyte photographs.
Byline exposes the canonical original separately, to the lightbox and to the
image sitemap. "Full" is whatever `wp_get_attachment_image_url($id, 'full')`
returns (WordPress's `-scaled` file for very large uploads); filenames are never
edited to guess an original.

- **Responsive inline images.** WordPress supplies `src`, `srcset`, `width` and
  `height`. Byline adds a `sizes` hint matching the grid (one column to 540px,
  two to 900px, then the configured columns inside the 1040px measure), so a
  ~335px cell on a 2x screen gets a 768px candidate, not the original. Photo
  Pair gets the same hint for two columns.
- **Full link and lightbox source.** At render time (saved content is never
  rewritten), every attachment image gets `data-byline-full-url`. In a Photo
  Gallery, a media link that points at another size of the same attachment is
  rewritten to the full URL; custom links, attachment pages and unlinked images
  are left alone. The attribute is deliberately not named `...-src`: core's
  `wp_filter_content_tags()` finds an image's source with the unanchored pattern
  `/src="([^"]+)"/`, and an attribute ending in `src` ahead of `src` makes it
  compute `width`, `height` and `srcset` from the original.
- **Enlargement.** Every image in a Photo Gallery enlarges with JavaScript,
  linked or not. Linked images keep their ordinary link (modified clicks still
  open normally). Unlinked images are wrapped in a generated button with
  `aria-haspopup="dialog"`, an accessible name, keyboard activation and focus
  styling. Other galleries keep the earlier rule: only images already linked to
  an image file are enhanced. A link to anything other than an image file is the
  writer's choice and is left alone.
- **Lazy loading.** Nothing larger than the inline candidate loads with the
  article. Opening a photograph loads its source in this order: the validated
  `data-byline-full-url`, a full media link, the widest `srcset` candidate,
  `currentSrc`, `src`. Only after the dialog opens are the previous and next
  photographs warmed.
- **No JavaScript.** Linked gallery images open the full file. Legacy unlinked
  images simply stay images; new Photo Galleries default to media links.
- **Google Images.** Do not rely on `data-*` attributes for discovery. The page
  keeps normal `<img src>`, `srcset`, alt text and captions, and `/sitemap.xml`
  carries `<image:image>` entries (`xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"`)
  for each article: the featured image, then every editorial image in the body,
  once, as the full mirrored URL. Related-story thumbnails, logos and other page
  furniture are excluded, up to Google's 1,000 images per page. Only images on
  the site's own origin are listed (a failed media mirror is left out). The build
  fails if a listed image, a full-size source or a media link names a file that is
  not in the export.
- **Image CSS.** WordPress marks lazy images `sizes="auto, ..."`, which browsers
  lay out as a 300x150 placeholder unless the image has a definite width. Gallery
  images therefore do not set `width: auto` or `aspect-ratio: auto`; the
  `width`/`height` attributes give the width cap and the aspect ratio.

Timeline starts with two entries, permits up to 25, and provides inline Add,
Remove, Move up/down controls with focus following the changed entry. Its date
labels are editorial text (such as “Fall 2026”), not fabricated machine dates.
Timeline uses a custom content model; its saved output is an ordered list
and requires no reader JavaScript.

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
break out to `--article-wide-width` (1040px); `.alignfull` uses
`--article-full-width` (1440px). Both center within the shell’s available canvas. The
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
actual Astro article route. Regenerate the fixture whenever block markup or the
definitions change: `BYLINE_UPDATE_STORY_FIXTURE=1 npm run test:e2e:primary --workspace @byline/wordpress-plugin -- story-presentations.spec.ts -g "newsroom presets"`
(never edit the rendered HTML by hand). Public geometry checks cover 1600, 1440,
1200, 768, 390 and 320px, plus keyboard lightbox behavior and no-JavaScript file links.
`apps/web/tests/browser/gallery-media.spec.ts` covers real JPEG galleries (srcset/sizes,
Retina, lazy originals, navigation, sitemap); `wordpress-plugin/tests/e2e/gallery-media.spec.ts`
covers WordPress rendering for new and existing galleries.

## Static-site and accessibility rules

The public Astro application stays static. WordPress renders dynamic block
HTML during the content fetch; Astro imports the same shared CSS. Polls use
the existing hydration layer and gallery enlargement is progressively enhanced. Empty results use a
plain explanatory state, malformed dates are ignored, scores are shown only
when the canonical record supplies them, and upcoming games never display
invented scores or live status. Lists, headings, forms, labels, time values,
focus states, and responsive layouts are part of the shared contract.

## Immersive reporting tools

The Story Presentation Library also supports investigations, explainers and
visual features. Core presets remain ordinary editable Gutenberg blocks.
Patterns are unlocked starters; they are not article formats or templates.

| Editor-facing name | Underlying block | Model | Intended use | Reader interaction | Mobile | Without JavaScript |
| --- | --- | --- | --- | --- | --- | --- |
| Visual Chapter | `core/cover` | Core style/variation | Chapter divider with image/video, H2 and optional dek | None | 320–520px minimum height; text can grow | Complete chapter |
| Wide Photo / Full-Bleed Photo | `core/image` | Core variations | 1040px / 1440px photography | Ordinary media links | Contained intrinsic image | Complete image and caption |
| Full-Bleed Video | `core/video` | Core variation | Large native video, including portrait | Native controls/tracks | Intrinsic ratio | Native playback |
| Context / Why It Matters / What's Next / How We Know / Editor's Note | `core/group` | Core variations/styles | Background and reporting context | Ordinary links | Inline aside | Complete reporting |
| Margin Note | `core/group` | Core variation/style | Supporting context beside following prose | Ordinary links | Inline below 1100px canvas | Complete note |
| Data Table / Comparison Table | `core/table` | Core variations/styles | Numbers, budgets, surveys, comparisons | Local horizontal scroll | Table scrolls within article | Complete semantic table |
| Footnotes | `core/footnotes` and native Footnote format | Core | References, sources and backlinks | Local anchors | Long URLs wrap | Complete references/backlinks |
| Read More / Methodology / Full Statement | `core/details` | Core variations/styles | Supporting reporting and statements | Native disclosure | One column | Native disclosure |
| Comparison / Main + Aside / Three Key Numbers | `core/columns` | Core presets; existing Key Numbers pattern reused | Curated editable column arrangements | None | Stack at 700px | Complete DOM order |
| Q&A / Interview | Group, Heading, Paragraph | Pattern | Interviews | Ordinary links | One column | Complete interview |
| What We Know / What We Don't Know; Pros / Cons | Columns, Heading, Paragraph | Patterns | Reported comparisons | None | Stack at 700px | Complete reporting |
| Three Things to Know | Heading, List | Pattern | Short explainer | Ordinary links | One column | Complete list |
| Source Highlight / Document Evidence | Group, Quote, Paragraph; existing Document Viewer or Image | Patterns | Evidence with citation and context | Ordinary source/document links | Inline | Complete source and context |
| Chart / Data Visualization; Map | `byline/visualization` | Custom block and Map variation | Supported provider embed or static exported graphic | Lazy iframe where validated | Full available width | Image, title/dek, source/notes and direct link |
| In This Story | `byline/table-of-contents` | Dynamic custom block | H2/H3 contents navigation | Local anchors | One column | Complete nav |
| Annotated Image | `byline/annotated-image` | Custom | Plans/photos with up to 12 stable annotation records | Marker/list synchronization, keyboard focus | List below image | Marker anchors and complete annotation list |
| Before / After | `byline/before-after` | Custom | Two photographs showing change | Drag the divider on the photograph (mouse, touch) or use the arrow keys | Same control, 48px handle | Both complete labeled images and the caption |
| Scrollytelling / Story Step | `byline/scrolly`, `byline/scrolly-step` | Custom parent/child system | Linear image-based visual narrative | Sticky decorative image switches as each step crosses a fixed reading line | Linear under 900px; reduced motion always linear | Every image, caption and text in sequence |

### Authoring

- **Footnotes:** Place the cursor after a claim, open the text toolbar's More
  menu and choose Footnote. Type the source in Core's generated Footnotes area.
  Core owns the reference IDs, post `footnotes` metadata and backlinks. Both
  WordPress 7.1 and 6.6 render an ordered `.wp-block-footnotes` list with note
  IDs and `#ID-link` backlinks. No extra heading is inserted by Byline.
- **Visual Chapter:** Search Visual Chapter; select media with Core's library.
  Use Core's focal point, overlay and content-position controls; Byline's
  structural CSS never overrides them (the inline `object-position`, overlay
  opacity, minimum height and the nine content positions all apply to images
  and to video backgrounds). Keep text concise and check contrast against the
  selected photograph. A chapter heading is normally H2. A video background is
  Core's muted, looping, inline `<video autoplay>`; it has no sound but is not
  paused for reduced-motion readers, so prefer a still image where motion would
  distract.
- **Visualization:** Search Chart / Data Visualization or Map. Choose embed or
  static. For embeds paste an HTTPS Datawrapper/Flourish share or embed URL, a
  Google Maps embed URL, or an OpenStreetMap export/embed URL. Select Compact,
  Standard, Tall or Map height. Add title, description, fallback graphic with
  separate alt text, source, notes and credit. Static graphics use the normal
  media library and require no reader JavaScript. Private preview shows the
  same fallback and width, without third-party loading.
- **In This Story:** Add H2/H3 headings anywhere in Groups/Columns. The editor
  assigns unique native anchors only to eligible headings lacking anchors.
  Existing anchors remain stable after text edits. Two valid saved heading
  anchors are required for a public nav; malformed/duplicate anchors are skipped.
  Core 6.6 may store the anchor only in the saved heading HTML; Byline reads
  those real IDs as well as newer Core comment attributes.
- **Annotated Image:** Select the image in the media library. Add an annotation
  by button or by clicking the canvas; new markers step across the image rather
  than stacking. Everything can be done without a pointer: type the title and
  explanation, set precise X/Y percentages (0-100, clamped) with the range or
  number controls, or focus a marker and nudge it with the arrow keys (Shift for
  10%). Move annotations up/down or remove them; focus follows the note you
  acted on. IDs stay stable while numbering follows order. Duplicating, pasting
  or inserting a copy of an annotation block gives the copy distinct IDs.
- **Before / After:** Choose both photographs and write separate alt text and
  labels. Similar framing works best. Different proportions produce a warning
  and use contained images, preserving the complete evidence in the fallback.
  Readers drag the divider on the photograph, or tab to it and use the arrow
  keys (see the interaction contracts below).
- **Scrollytelling:** Start with two Story Steps. Each has one image, optional
  caption and ordinary text blocks. Add/reorder steps through normal block
  controls or List View. Choose complete-image or explicit crop/fill for the
  sticky stage. There are no scroll locks or interactive iframes in the stage.
  Text fields in the new blocks keep what is typed locally, so fast typing never
  loses characters while the editor catches up.

**Photo credits on body images.** Core's Image and Media & Text blocks do not
print credit, so `wordpress-plugin/includes/content/photo-credits.php` adds
`<p class="photo-credit">Photo: Name</p>` to the figure's caption at render time
(never to saved content). The name is the attachment's Image Creator, then its
credit line, the same order as the lead image. Because it runs in WordPress, the
static export, REST `content.rendered` and Preview as Byline all agree.
Image-fill Portrait + Text blocks are backgrounds and carry no credit line.

Media retain attachment IDs plus stable image snapshots (URL, dimensions,
responsive sources, alt and canonical photo credit). Credit comes from the
existing Byline attachment metadata resolver, also used by Preview as Byline.
Captions are never copied into alt text.

Document Evidence intentionally starts with explanatory text rather than an
unselected File block: insert the existing Document Viewer or Image into its
unlocked Group and select the source. Social/oEmbed markup retains its direct
links and explicit aspect-ratio classes; Byline does not execute arbitrary
saved script tags to hydrate unsupported social providers.

The public test harness intercepts provider URLs. CI never requires live
Datawrapper, Flourish, Google Maps or OpenStreetMap responses. Production URL
validation is unchanged by fixture configuration.

### Interaction and layout contracts

These are enforced by `apps/web/tests/browser/immersive-*.spec.ts`,
`story-presentations.spec.ts`, the jsdom suites in `wordpress-plugin/tests-js/`
and the WordPress E2E specs `story-presentations.spec.ts` and
`annotated-image.spec.ts`.

**One shared enhancer.** `@byline/ui/article-enhancements` is the only
progressive-enhancement layer for the public article and the private preview.
It is framework-free, scoped to the article root, idempotent and returns a
cleanup that restores the saved markup. The Photo Gallery lightbox inside it is
the #137 implementation and its contract is unchanged: `data-byline-full-url`;
Photo Gallery images get a generated, labelled `<button>` when unlinked, linked
images keep their link, and custom or non-image links are left alone; the full
source is `data-byline-full-url`, then an image media link, the widest `srcset`
candidate, `currentSrc`, `src`; originals load only after opening, and only the
two neighbours are warmed after the opened photograph has loaded; native
`<dialog>`, captions, alt text, arrow keys, Escape, focus return and modified
link clicks are preserved. `wordpress-plugin/tests-js/gallery-enhancement.test.ts`
pins each of these.

**Before / After.** The control is one native `<input type="range">` (0-100,
default 50, `aria-label="Compare Before and After"`, `aria-valuetext`) laid over
the photograph, so the browser supplies mouse and touch dragging, pointer
capture, arrow/Home/End keys and slider semantics. The enhancer only mirrors its
value into `--comparison-position` (percent) and `--comparison-ratio` (0-1).
The thumb is the 48px handle; its centre travels from half its width to half
its width short of the far edge, and the divider line and the revealed edge use
the same `--comparison-edge`, so all three always agree. `touch-action: pan-y`
leaves vertical scrolling alone. Focus draws a 3px outline around the
comparison and on the handle. Both complete images, the Before/After labels and
the caption stay in the DOM and are visible without JavaScript.

**Scrollytelling.** A step is active while it covers a fixed reading line
`SCROLLY_ACTIVATION_LINE` (40) percent from the top of the viewport; the stage
exposes it as `data-activation-line`. One `IntersectionObserver` watches a 1%
band at that line (measured against the article document, so the private preview
iframe behaves the same). The largest-visible-area rule is deliberately not
used: a long previous step must not outvote a step that has reached the line.
No scroll handlers, no scroll-jacking; the sticky, `aria-hidden` stage exists
only at 900px and wider without reduced motion, and the linear story is never
altered.

**Width contract.** Prose is 760px, `alignwide` 1040px and `alignfull` 1440px,
each capped by the article canvas: the content box of the `byline-content`
shell, which is what `100cqw` resolves against. Blocks are centered in that
canvas, post-article sections stay at or under 1040px, and nothing causes
horizontal overflow. The window is not the authority: `html` uses
`scrollbar-gutter: stable`, so a classic 15px scrollbar (or Linux CI's reserved
but invisible gutter) makes the layout viewport narrower than
`documentElement.clientWidth`. The geometry tests derive the canvas from the
shell's rectangle and padding, and run every width (1600, 1440, 1200, 768, 390,
320) with the platform default, with a reserved 15px gutter, and with a drawn
classic scrollbar. Tolerances stay at 1-2px.

**Preview as Byline.** The preview uses the same CSS and enhancer inside its
iframe at 1200, 768 and 390px of real layout width. Disclosures, the comparison
range, annotation selection and scrolly stepping work; outgoing navigation is
blocked and third-party embeds show their fallback.

**Intentional limitations.** Four allowlisted embed providers; the private
preview never loads third-party frames; scrolly stages show images (reporting
blocks stay in the linear story); Core Cover video backgrounds autoplay muted
as Core defines them. Astro remains static, with no migration, new article
format, homepage editor or frontend server.
