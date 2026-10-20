# Editorial design system for story tools

One recognizable language for everything a story can show: serif reporting,
sans-serif labels, ink and hairlines, one accent. A dramatic photograph and a
contextual note differ in **weight**, never in **dialect**. The rules below are
implemented once, in `packages/ui/src/newsroom/figure.css` (tokens, captions,
credits, labels) and the per-feature partials beside it, and they apply
identically on the public article, in the Gutenberg canvas and in Preview as
Byline.

## Three weights

| Weight | What it is | How it looks |
| --- | --- | --- |
| **Prose** | Paragraphs, headings, lists | 760px measure, Newsreader body, Erode headings |
| **Supporting context** | Key facts, margin notes, Context boxes, tables, timelines, footnotes, related coverage | A hairline rule on top and a small-caps label. No box, no background, no shadow. Body text one step smaller (1rem). Sits in the prose measure, or beside it at wide widths. |
| **Major visual moment** | Wide and full-bleed photographs, galleries, annotated images, comparisons, scrollytelling, charts and maps, Visual Chapters | Breaks out to 1040px (`alignwide`) or the full canvas (`alignfull`), with `--story-moment-space` (2.25-3.5rem) above and below. No frame or border around photographs. |

Widths stay 760 / 1040 / 1440. A feature earns `alignwide` when seeing it large
changes what the reader understands (a photograph, a comparison, a map); it
stays at 760 when it is reading (a timeline, a table of facts).

## Figure language

- **Caption** says what is shown: Newsreader, 0.9rem, muted, left-aligned under the
  left edge of the media (under a full-bleed figure it joins the 760px reading column).
- **Credit** says who made it: Mona Sans (`--font-ui`), 0.78rem, soft muted, on its
  own line (`<p class="photo-credit">Photo: Name</p>`). The credit is **never saved
  in block markup**: WordPress resolves it from the attachment when the article
  renders (creator, then credit line, as for Core images), so a corrected credit
  reaches every story and the same photograph is never credited two ways.
- **Source and notes** (charts, maps, documents) use the same two lines: a source
  line in the caption voice, notes below it, then a credit.
- **Label** (`.byline-kicker`): Mona Sans, 0.72rem, 700, 0.08em tracking, uppercase.
  Used for dates, numbering and the name of a context box. At most one label per
  element; the accent colour is for the one thing the reader should find first
  (the active marker, the current timeline entry), never decoration.
- **Alt text** describes the photograph; the caption never doubles as alt text.

## Tokens (defined in `figure.css`, available to every partial)

`--story-sans`, `--story-serif`, `--story-headline`, `--story-rule`,
`--story-rule-strong`, `--story-muted`, `--story-soft`, `--story-accent`,
`--story-space` (1.6em, inline material), `--story-moment-space`,
`--story-media-gap` (10px, media to caption), `--story-motion` (160ms ease-out,
zeroed under `prefers-reduced-motion`). Use these instead of new literals.

## Restraint

- Square photographs; no rounded corners except circular markers and handles.
- No borders around photographs. A hairline is allowed around a white-background
  static graphic (a chart export), where it defines the edge.
- No gradients except the scrim that keeps overlaid headline text legible.
- No cards: separate with space and a hairline, not a bordered, tinted box.
- Colour: ink, muted ink, hairline, and the accent. Nothing else.

## Motion

Motion explains, it does not decorate. The only motion in a story is: the
Before / After divider following the pointer, the scrollytelling stage changing
photograph (a 160ms crossfade, instant under reduced motion), and focus and
selection changes. Nothing animates on scroll except the sticky stage. Under
`prefers-reduced-motion` the sticky stage is not built and the story is read
linearly. Nothing hijacks scrolling.

## CSS rules for contributors

1. Scope Core-markup selectors with `:where(.byline-article-view .article-body, .editor-styles-wrapper .is-root-container, .byline-page-content)`. Zero specificity means a later rule never needs `!important` or a longer selector to win. Byline's own classes (`.byline-timeline`) need no scope.
2. One owner per feature: `packages/ui/src/newsroom/<feature>.css`. Do not restate caption, credit or label typography; extend `figure.css`.
3. Layout is container-based (`100cqw`, `@container byline-content`), not viewport-based, so the editor canvas, the preview iframe and the public page agree.
4. Every interactive element has a visible `:focus-visible` outline (`2px solid var(--story-accent)`, 3px offset) and a 44px minimum target.
5. Forced-colors and reduced-motion each get an explicit rule where they matter.

## Authoring contract

The block canvas is the editor. A writer should be able to build and revise any
story tool without opening the sidebar.

1. **Empty state.** Gutenberg's own `MediaPlaceholder` (upload, library, drag
   and drop) with one sentence saying what the block is for. No custom upload buttons.
2. **Selected state.** The canvas shows the block as readers will see it, using
   the real public CSS. Controls appear on the canvas, next to what they change:
   captions, titles and explanations are typed where they appear.
3. **Toolbar.** Contextual actions: replace photograph (`MediaReplaceFlow`),
   add / duplicate / move / remove an item, switch a mode. Icon buttons with labels.
4. **Sidebar (Inspector).** Secondary settings only: alt text, image fit, labels,
   advanced options. Nothing needed to finish the block lives only in the sidebar.
5. **Items** (markers, steps, events) are selected on the canvas; the selected
   item shows a compact editor (popover or inline), never every field of every item.
   Reordering is a toolbar button and a keyboard shortcut as well as dragging.
6. **No lost work.** Text fields keep what is typed locally (`StoryTextControl`,
   `StoryCaption`); stale responses never overwrite typing; a removed attachment
   shows a warning, not a silent blank.
7. **Defaults are finished sentences.** Placeholder copy tells the writer what to
   write, not what the block is.
8. **Accessible by default.** Keyboard operation for every pointer action, labels
   on every control, live-region announcements for add / move / remove.

## Compatibility contract

- Saved markup of Byline 0.3.24 and earlier must keep validating. If a block's
  `save()` changes, keep the previous `save` in the block's `deprecated.ts` with
  its attributes and a `migrate`. `wordpress-plugin/tests-js/legacy-story-markup.test.ts`
  parses a corpus of real 0.3.24 content (`tests/fixtures/storytelling/`) and fails
  on any block that no longer validates.
- Attribute names and stable IDs (annotation IDs, etc.) never change meaning.
- Public rendering fixes that can be done when the article renders go in
  `includes/content/story-blocks.php` (credits, responsive `srcset`/`sizes`,
  hiding unfinished blocks), not in saved markup.
