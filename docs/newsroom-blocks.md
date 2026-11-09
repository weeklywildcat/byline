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

## Story tools

**Byline gives editors semantic newsroom tools; it does not expose arbitrary
CSS/layout engineering to writers.** Press `+`, search for the tool by what you
want to do ("timeline", "compare", "context", "map") and add content. Core keeps
its media library, alt text, captions, crop/focal point, file controls and video
text tracks. Tools are ordinary Gutenberg blocks, block styles or variations;
there is no second article format or layout builder. The visual language every
tool shares is in [`editorial-design-system.md`](editorial-design-system.md); how
the tools were chosen is in [`visual-storytelling-audit.md`](visual-storytelling-audit.md).

The tools are organised around what a reporter is trying to do:

| Task | Tools |
| --- | --- |
| Present photographs and video | Photo Gallery, Portrait + Text, Visual Chapter, and Core's Image (Wide / Full width in the alignment toolbar), Video and Audio |
| Explain the reporting and the evidence | Reported Quote, Pull Quote, Key Facts, Context Box, Margin Note, Editor's Note, Expandable Section, Document Viewer, Footnotes |
| Show data, maps and comparisons | Chart / Map, Interactive, Data Table, Comparison, Three Key Numbers, Before / After, Annotated Image |
| Build visual narratives and chronological stories | Timeline, Visual Chapter, Photo Essay (pattern); scrollytelling and other scroll-driven features are flagship visual stories built in the repository ([custom-story-presentations.md](custom-story-presentations.md#flagship-visual-stories)) |
| Provide supporting context and related coverage | Related Coverage, In This Story, Context Box, Margin Note |

| Editor-facing name | Underlying block | Intended use | Mobile behavior |
| --- | --- | --- | --- |
| Portrait + Text | `core/media-text` variation/style | A contained portrait beside reporting; wide, 40% media by default | Media first, then text below 700px |
| Photo Gallery | `core/gallery` variation/style | A photo feature with readable credits and larger-image links; set 2 columns for a pair | Three columns, two below 900px, one below 540px |
| Photo Essay (Patterns) | Wide `core/group` with Image and Paragraph blocks | An editable visual narrative; duplicate, reorder, or delete any block | Single-column narrative with prose measure preserved |
| Reported Quote | `core/quote`, `byline-source-quote` style | A source quotation with smaller attribution | Compact inset |
| Pull Quote | `core/pullquote`, `byline-feature-quote` style | A line lifted from the story between rules, in the headline face | Type scales down |
| Key Facts | `core/group` with Heading and List | Verified facts, one per ruled row | Readable single column |
| Document Viewer | `core/file` variation/style | PDF preview, direct file link, and optional download | Inline preview hidden below 540px; file link and download remain |
| Related Coverage | Existing `byline/stories`, `related` layout | Up to three selected published stories, compact thumbnails/titles | Compact stacked list |

Wide and full-bleed photographs and video use Core's own alignment control, and
audio and video use Core's defaults (native controls, no autoplay or loop); the
`Story Audio`, `Story Video`, `Wide Photo`, `Full-Bleed Photo` and `Full-Bleed
Video` presets are no longer offered in the inserter because they only set those
defaults, and their classes still render for published stories. Photo Pair was
folded into Photo Gallery (set Columns to 2).

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

## Staff guide to the visual tools

All of these edit on the canvas: type captions, titles and explanations where they
appear; the block toolbar holds the actions; the sidebar holds alt text and options.
Credits are filled in from the media library, never typed into a block. A block that
is not finished (no photograph, no text) is not published.

- **Annotated Image.** Choose a photograph, then click it (or use *Add marker*) to
  place numbered markers. Drag a marker, or focus it and use the arrow keys (Shift
  moves 10%); `[` and `]` reorder, Delete removes, Enter jumps to its text. Select a
  marker to type its title and explanation in the list; exact X/Y and alt text are in
  the sidebar. Up to 12 markers. Readers get the photo with the notes beside it (below
  on narrow screens); markers are links, so it works without script.
- **Before / After.** Drop a photograph into each zone, then drag the divider on the
  canvas to judge the framing. Type the left and right labels on the photo; Replace
  Before, Replace After and Swap are in the toolbar. If the photographs are different
  shapes, choose between cropping the right-hand one and showing both complete. Before
  is always on the left, After on the right.
- **Timeline.** Click into any event and type a date label, a headline and an
  explanation; Enter moves on and, after the last explanation, adds the next event.
  The toolbar adds, duplicates, moves and removes the event you are in; *Latest* marks
  the most recent event. Up to 25 events; events with only a date are not published.
- **Chart / Map.** Choose *Interactive chart or map* (paste only the address: Datawrapper,
  Flourish, Google Maps embed or OpenStreetMap embed) or *Static graphic* (upload an
  image). Add a fallback graphic with alt text: readers see it if the interactive version
  cannot load, without JavaScript, and in search. The canvas shows the fallback with a
  "Preview" badge; the editor and Preview as Byline never load the provider. Pick
  Compact (320px), Standard (480), Tall (680) or Map (560). Write the title as the
  takeaway and the dek as the precise measure, then source, notes and credit.
- **Interactive** (editors and administrators). For a small interactive that no chart
  tool makes: a calculator, quiz, custom chart, map or data explorer. Ask Claude (or
  another coding agent) for *one self-contained HTML file*, upload it, then write a
  title and a description of what it shows for readers who cannot use it. See
  [Interactive](#interactive) below.
- **Preview as Byline** shows the Standard or Immersive opening you chose. A one-off
  layout a developer built for a single story is not previewed.
- **Photo crops.** *Story presentation → Crops & placements* opens the featured
  image. Click the most important part of the photo (usually a face) to set its
  **focal point**; every card, list and the Immersive opening keep it in view. For a
  shape that still looks wrong, open its tab (Wide 16:9, Card 3:2, Standard 4:3,
  Square 1:1, Portrait 4:5, Social 1.91:1) and drag or zoom to draw your own crop;
  *Reset to focal point* undoes it. The right-hand side redraws every placement as you
  work, including the social card and a search result. Crops belong to the photo, so
  every story that uses it agrees. The pre-publish checks flag photos that are too
  small, and tall or panoramic photos with no focal point.

### Interactive

The Interactive block (`byline/interactive`) shows one uploaded HTML file inside
the article, isolated from it. It is for small self-contained pieces; use Chart /
Map for Datawrapper, Flourish and map embeds, and a [flagship visual
story](custom-story-presentations.md#flagship-visual-stories) for anything that
must share the page's layout or scrolling.

**Writer workflow.** Ask a coding agent for the interactive as *a single HTML file
with its CSS and JavaScript inline* (libraries may load from a CDN such as
cdnjs or jsDelivr). An editor inserts **Interactive**, chooses *Upload HTML file*,
and types a title and a description; the canvas runs the file in the same sandbox
readers get. There is no code editor: to change the interactive, upload a new file
(*Replace file* in the toolbar). Credit and starting height (the Chart / Map
presets) are optional.

**What the file can do.** It runs in an iframe whose `srcdoc` is the file,
sandboxed with `allow-scripts` and nothing else. Its origin is opaque, so it
cannot read or change the article, its cookies or storage (`localStorage` throws),
navigate the page, open windows or popups, submit forms (handle input with
JavaScript events instead) or show `alert` dialogs. It can fetch public data and
scripts. A small reporter appended to the file posts its height, and the article
(`article-enhancements/interactive.ts`) accepts that one message, clamped to
120-4000px, only from that frame's own window.

**Who can add one.** Only users with `unfiltered_html` (editors and administrators)
see the block in the inserter. On every save, `wp_insert_post_data` drops any
interactive that is new or whose file changed when the user lacks that capability;
an interactive already in the post survives anyone's edits, including revisions and
autosaves (checked against the parent post). The file is stored base64-encoded in
the block's `document` attribute so that kses, which filters block attributes for
those users, cannot silently strip its scripts.

**Rendering.** A dynamic block: `includes/content/interactive-block.php` prints a
figure with the title (`h3`), the description (which names the frame through
`aria-describedby`), the frame (`title`, lazy, no referrer), a `<noscript>` note and
the credit. The file is escaped into `srcdoc` without collapsing entities, with
shortcode brackets made inert. A block with no valid file, title or description
prints nothing. Files over 512 KB, or that are not UTF-8 HTML, are refused in the
editor and ignored at render. The static site prints WordPress's rendering as it
does any body block; nothing is hosted separately.

**Tests.** `wordpress-plugin/tests/interactive-block-regression.php` (render,
escaping, sandbox, unfinished blocks, the save guard, the fixture matching the
renderer), `wordpress-plugin/tests-js/interactive.test.ts` (PHP/TypeScript contract,
storage, height messages, the enhancer) and
`apps/web/tests/browser/interactive.spec.ts` (isolation in a real browser,
resizing, accessibility, no-JavaScript and phone layout).

### Photo crops: how they reach the site

`packages/core/src/image-crops.ts` defines the shapes and the crop math; the PHP copy
in `includes/content/image-art-direction.php` is kept identical by
`tests/image-art-direction-regression.php`. The attachment stores
`_byline_image_focal`, `_byline_image_crops` and `_byline_image_renditions`
(`GET|POST /byline/v1/media/<id>/art-direction`, `upload_files` + `edit_post`).

- A **focal point** is applied as CSS `object-position`. The "Auto" crop is defined
  by the same rule, so the editor preview and the page always agree. No files are
  made.
- A **custom crop** gets real cropped files for that shape only, at the widths in the
  shape table and never upscaled. **Social** always gets one 1200×630 file once a
  photo has art direction. These files live in their own meta, never in
  `_wp_attachment_metadata`, so Core's srcset never mixes a cropped file into a
  normal photograph. Older files are deleted when the crop changes or the attachment
  is deleted.
- Each placement asks for its shape: list teasers (lead wide, standard 4:3, compact
  square), homepage cards (`storyCardImageShape()`), the athlete spotlight
  (portrait), related stories at the end of an article (square), and Related
  Coverage (standard). It uses the cropped files when there are some and the focal
  point otherwise. The Immersive hero, the article lead and collection artwork use
  the focal point only. Open Graph, X and Discord use the social file. `NewsArticle.image`
  prefers the editor's 16:9, 4:3 and 1:1 crops.

## Payload semantic blocks (`byline-v1`)

The Gutenberg blocks in this document are the WordPress implementation and keep
rendering existing content. New stories in the Payload newsroom store a
semantic body instead, never Gutenberg markup. The registry is `ARTICLE_BLOCKS`
in `@byline/article-body` and [article-editor.md](article-editor.md) is the
reference. There are 28 tools, in four Add-menu groups, plus two inline
references: footnotes and Source references.

| Group | Tool (`type`) | Data and rules |
| --- | --- | --- |
| Media | Photo (`photo`) | media, caption, alt override, `placement`: column / wide / full; credit from Media |
| | Photo Gallery (`gallery`) | 2–24 photographs; `layout` Grid / Photo Essay (one photograph per row, captions between) / Featured (the first photograph leads; any photograph can be made featured); "Whole photographs" or "Even grid"; no column count |
| | Portrait + Text (`portraitText`) | portrait, heading, passage, caption, `side` left / right; stacks portrait-first when narrow; warns (does not block) on a very wide photograph |
| | Video (`video`) | YouTube only, via the canonical parser; stores `videoId`, title, caption, optional transcript and ≤20 chapters (time, label); the editor's `captionsConfirmed` flag gates publishing and never reaches the public body; privacy-enhanced lazy iframe, no autoplay or loop, watch link; chapters are a list of links that seek the player when it is loaded |
| | Audio (`audio`) | Media audio file, title, context, **transcript required** (≤40k characters), ≤20 chapters; native `<audio controls preload="metadata">`, transcript in a native `<details>`; chapter links seek the player |
| | Social Post (`socialPost`) | a validated public Instagram, Threads, Facebook, TikTok, X or Bluesky permalink plus an optional caption; see [Social Post](#social-post-stores-a-permalink) |
| Explain | Reported Quote (`reportedQuote`) | quote, attribution, optional public source label and web address (a link under the attribution) |
| | Pull Quote (`pullQuote`) | as before |
| | Key Facts (`keyFacts`) | as before, with a Standard or Compact treatment |
| | Context (`context`) | Why it matters / What's next / How we know as heading choices; a bounded body of paragraphs with bold, italic and web links only (no headings, lists or blocks) |
| | Editor's Note (`editorsNote`) | editors and administrators only; always labelled "Editor's note" |
| | Margin Note (`marginNote`) | optional heading; sits in the margin on wide layouts, in order on narrow ones |
| | Expandable (`expandable`) | required heading, body; native `<details>`, closed, no script |
| | Document (`document`) | PDF, title, context, source, ≤12 page references, each a page number, what is on that page and an optional excerpt; the public page links straight to that PDF page (`#page=`) |
| Data & visual | Chart / Map (`chartMap`) | three modes: **Create chart** (native Bar / Line / Dot drawn by Byline from a small table, 2–40 rows, ≤4 series, TSV paste through the Data Table grid code; static HTML and CSS with the numbers in a `<details>` table, no chart library or script), interactive embed (Datawrapper, Flourish, Google Maps embed, OpenStreetMap embed only) or static graphic; title and visible summary required; source, notes, credit; height preset; direct provider link always printed for an embed |
| | Data Table (`dataTable`) | 2–8 columns, ≤40 rows, ≤500 characters per cell; real `<table>` with caption, `scope` headers; Standard or Comparison treatment; TSV paste, Tab / Shift+Tab / Enter navigation |
| | Comparison (`comparison`) | exactly two sides (label, title, passage); Swap sides |
| | Key Numbers (`keyNumbers`) | 2–4 figures (value, label, context), optional heading and shared source |
| | Final Score (`finalScore`) | two teams, two scores, how it ended (Final / Final in overtime / Tie / Forfeit), optional sport, date, place and note; see [Final Score](#final-score-is-article-content) |
| | Annotated Image (`annotatedImage`) | photograph, ≤12 markers (x, y, title, note); markers are links to an always-visible ordered list |
| | Before / After (`beforeAfter`) | two photographs, labels, `fit` cover / contain, caption; native range input; Before is always left |
| Structure & interact | Visual Chapter (`visualChapter`) | photograph, eyebrow, heading (an H2 of the story), dek, wide / full, bottom-left / centred |
| | Timeline (`timeline`) | 2–25 events, each optionally with one photograph, one web link and one PDF (with a page) as evidence |
| | Related Coverage (`relatedCoverage`) | 1–3 published Stories; the picker's Suggested tab ranks candidates with the same related-story ranking the public site uses, and Search finds any published Story; nothing is ever added automatically, and only the relationship is stored |
| | Event (`event`) | one published Event record; only the relationship is stored, and the block shows the record's canonical title, time, place, description and status (a canceled event says so) |
| | Poll (`poll`) | a Poll record; only the relationship is stored |
| | Repository Interactive (`repositoryInteractive`) | editors and administrators only; a registered key plus title and text alternative; never HTML, script, CSS or a URL |
| | Repository Tracker (`repositoryTracker`) | editors and administrators only; a registered tracker key plus title and text alternative; see [Repository Tracker](#repository-tracker) |

**Footnotes** are an inline block, not a card. Insert one from the selection
toolbar or `/` (Footnote); a Popover (a bottom Sheet on touch) opens for the
note. The stored reference is `{ id, text }`; the visible number is derived from
document order, so moving or deleting a reference renumbers the rest. The
public page prints a superscript link, and one `Footnotes` ordered list at the
end with a backlink for each note, with no script.

**Source references** are a second inline block, for public evidence: select
the claim (or put the caret after it) and choose Source in the selection
toolbar. The words stay; the reference goes after them and its Popover opens.
A Source is either a **web page** (an http(s) address) or a **document** from
Media (a PDF, with an optional page), with a short title and an optional note.
They number in reading order apart from footnotes, so moving or deleting one
renumbers the rest, and the public page prints a bracketed link to one
`Sources` ordered list at the end (the two lists coexist and never share
numbers). Source references are public evidence only. They are entirely
separate from the newsroom's private `sources` records (the story-scoped
reporting targets on a Story's Plan): a reference never names, links to or reads one,
and nothing from a private source record reaches a body, a snapshot or Live
Preview.

**Deliberately not blocks:** Photo Essay (prose + Photo + Gallery), In This Story
(derived from H2s and Visual Chapters, `articleOutline`), Correction Notice
(canonical correction records), Game Score / Sports Schedule (legacy only; a
result inside an article is the Final Score block),
Stories / People / Events grids (page concepts), Scrollytelling (repository
visual stories), generic Interactive / HTML (retired; Repository Interactive is
the only custom-code path), Button / CTA / Divider / Columns / Spacer.

### Related stories and Polls travel as references

A block stores only the relationship ID. Normalization resolves public-safe facts
into the body's optional `references` table (`stories`: headline, href, section,
`publishedAt`, thumbnail Media key; `polls`: public key, question, answers,
`votingOpen`, counts only for a closed poll whose results were released), so
Live Preview and snapshots use one model and the renderer never calls the CMS.
Private or draft records resolve to nothing and the block is dropped or omitted
with an issue.

### Repository Interactive registry

`@byline/story-presentations` holds `repositoryInteractives` (empty until a
developer builds one for a real story) and a fixture-only registry
(`fixture-lunch-line`, enabled by `BYLINE_STORY_PRESENTATION_FIXTURES=1`, never in
production). An entry is plain data plus one server-rendered `Fallback`
component and an optional `client.ts` enhancement loaded by the host's bundler
only when a story that places it is shown. The renderer takes the fallback
through `ArticleRenderHost.renderInteractive`; it never imports the registry. A
key that is not registered is a publication error, never a blank frame.

### Social Post stores a permalink

A Social Post stores the post's canonical permalink (and the provider and post
ID the one parser, `parseSocialPostUrl`, derived from it), never provider HTML,
an `<iframe>`, a `<blockquote>` embed or a script. Pasted embed code is not
accepted. The parser allows only public post, video and reel addresses on each
provider's exact hosts; profile pages, share and short links, look-alike hosts
(`instagram.com.example`), credentials and ports are refused with a reason,
and YouTube is sent to the Video block. The editor shows Byline's facade with
the permalink and never loads the provider. The public page prints the same
facade and a direct link, so it works without JavaScript and the static build
makes no provider request. A reader's click on "Load … post" is the only thing
that loads the provider's official embed, for that one post; a failure or
timeout restores the facade, and the permalink is never removed.

### Repository Tracker

A Repository Tracker is a progress tracker (a project's phases, a count, a
status board) that a developer builds and updates in the repository, like a
Repository Interactive. It is repo-owned: its content, data and design live in
`packages/story-presentations/src/trackers/<key>/` and change only with a
deploy. An article stores only the tracker key, a title and a text alternative,
and editors choose a key from the registry; there is no Trackers collection and
no tracker data in Payload. Each tracker server-renders meaningful fallback HTML
(the static page is complete without JavaScript) and may add an optional
`client.ts` enhancement that the public page loads only when a story places that
tracker. `repositoryTrackers` is empty until a real story needs one;
`fixture-sidewalk-project` exists only with `BYLINE_STORY_PRESENTATION_FIXTURES=1`.
Scaffold a new one with `npm run tracker -- create <kebab-case-key>` (add
`--client` for an enhancement). A key that is not registered is a publication
error, never a blank frame.

### Final Score is article content

Final Score is a lightweight block for one result in a story: two team names
and two scores typed by the reporter, how the game ended, and optional sport,
date, place and note. The winner is derived from the scores (never stored), a
zero is a score, a forfeit may have no scores, and Swap teams changes which is
listed first. It is not sports management: there are no team, game, season,
roster or schedule records behind it, it does not read the retired Sports Hub
or game records, and it never brings them back (see
[sports-archive.md](sports-archive.md)).

### Readiness: omitted versus dropped

`finalizeBlock` returns issues with `effect: "omitted"` (the whole block is left
out) or `"dropped"` (one part is). Drafts keep everything. Publishing is refused
(`requireCompleteBody`, one message per block) for any omitted block and for
drops that would lose substantive content (`isBlockingIssue`: an unavailable
story, photograph, fallback graphic, or a half-written number). Empty markers,
table rows and page references are dropped without blocking. Examples: Video
without captions confirmed, Audio without a transcript, Chart / Map without a
title or summary, Data Table without headers or data, Before / After missing a
side, a Poll that is a draft, an unregistered interactive or tracker, an Event
that is unpublished or missing, a Social Post address the parser refuses, a
Final Score whose scores do not match how it ended, and a Source without a
title or without its address or document.

### Who may write what

Editor's Note, Repository Interactive and Repository Tracker are
editor/administrator only. The
inserter hides them and the blocks render read-only for staff, but the rule is
enforced on the server (`guardPrivilegedBlocks`, `enforcePrivilegedBlocks`): for
a non-editor, a privileged block that was added is removed, one that was changed
or removed is restored in place, and the rest of the save is kept. An unchanged
privileged block always survives an unrelated edit. Account-less system writes
(scripts, jobs, import) are trusted.

Not carried over: Story Audio / Story Video variations as separate blocks, Columns,
Main + Aside, arbitrary Core style variations, Scrollytelling.

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
| Context Box / Editor's Note / Source Highlight | `core/group` | Core variations/styles | Background, transparency and evidence: a rule and a label, no box. Rename a Context Box's heading to Context, Why it matters, What's next or How we know | Ordinary links | Inline aside | Complete reporting |
| Margin Note | `core/group` | Core variation/style | Supporting context beside following prose | Ordinary links | Inline below 1100px canvas | Complete note |
| Data Table | `core/table` | Core variation/style (a Comparison Table style remains for published stories) | Numbers, budgets, surveys, comparisons | Local horizontal scroll | Table scrolls within article | Complete semantic table |
| Footnotes | `core/footnotes` and native Footnote format | Core | References, sources and backlinks | Local anchors | Long URLs wrap | Complete references/backlinks |
| Expandable Section | `core/details` | Core variation/style | Methodology, a full statement or extra reporting; rename the summary | Native disclosure | One column | Native disclosure |
| Comparison / Three Key Numbers | `core/columns` | Core presets; existing Key Numbers pattern reused | Curated editable column arrangements (Main + Aside was retired: use a Margin Note) | None | Stack at 700px | Complete DOM order |
| Q&A / Interview | Group, Heading, Paragraph | Pattern | Interviews | Ordinary links | One column | Complete interview |
| What We Know / What We Don't Know; Pros / Cons | Columns, Heading, Paragraph | Patterns | Reported comparisons | None | Stack at 700px | Complete reporting |
| Three Things to Know | Heading, List | Pattern | Short explainer | Ordinary links | One column | Complete list |
| Source Highlight / Document Evidence | Group, Quote, Paragraph; existing Document Viewer or Image | Patterns | Evidence with citation and context | Ordinary source/document links | Inline | Complete source and context |
| Chart / Data Visualization; Map | `byline/visualization` | Custom block and Map variation | Supported provider embed or static exported graphic | Lazy iframe where validated | Full available width | Image, title/dek, source/notes and direct link |
| In This Story | `byline/table-of-contents` | Dynamic custom block | H2/H3 contents navigation | Local anchors | One column | Complete nav |
| Annotated Image | `byline/annotated-image` | Custom | Plans/photos with up to 12 stable annotation records | Marker/list synchronization, keyboard focus | List below image | Marker anchors and complete annotation list |
| Before / After | `byline/before-after` | Custom | Two photographs showing change | Drag the divider on the photograph (mouse, touch) or use the arrow keys | Same control, 48px handle | Both complete labeled images and the caption |

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

Text fields in these blocks keep what is typed locally, so fast typing never
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
range and annotation selection work; outgoing navigation is
blocked and third-party embeds show their fallback.

**Intentional limitations.** Four allowlisted embed providers; the private
preview never loads third-party frames; Core Cover video backgrounds autoplay muted
as Core defines them. Astro remains static, with no migration, new article
format, homepage editor or frontend server.
