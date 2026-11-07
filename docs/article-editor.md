# The article editor

How a Byline story body is written, stored and drawn. This is the architecture
Byline keeps: one semantic body, one public visual language, one Payload/Lexical
document state.

```text
semantic article-body contract (@byline/article-body, "byline-v1")
        │
        ├── Payload/Lexical authoring adapter (@byline/editor) → Story → Write
        │
        └── @byline/ui rendering primitives and the ArticleBody renderer
                         │
                         ├── exact Live Preview (next phase)
                         └── Astro public site (later: structured stories)
```

There is no "editor block that imitates an Astro block", and Astro never reads
Payload or Lexical JSON. The editor draws the **same** primitives and the
**same** CSS the public page does; it only adds controls around them.

## Packages and what each owns

| Package | Owns | Never contains |
| --- | --- | --- |
| `@byline/article-body` | The `byline-v1` types, the block registry (type, label, description, aliases, family, icon), limits, readiness rules (`finalizeBlock`), credit resolution, a fixture story | Payload, Lexical, React, Next, Astro, WordPress, CSS classes, components, HTML |
| `@byline/ui` (`/article-body`, `article-body.css`, `newsroom/*.css`) | The article's measure, prose, block frames, the visual primitives (`StoryFigure`, `GalleryLayout`, `ReportedQuoteView`, `PullQuoteView`, `SupportingContext`, `DocumentFigure`, `TimelineList/Item`) and the canonical renderer | Payload or Lexical imports; editing state; "isEditing" branches |
| `@byline/editor` | Payload block configs, the Lexical feature setup, the block editors, the Add menu, `canvas.css` (editor chrome only), and the Payload Lexical → `byline-v1` normalizer | The public renderer |
| `apps/newsroom` | Wiring: the Story screen, the article canvas wrapper, the Media host adapter, the lead-image control | Block logic |

`@byline/article-body` is its own package because `@byline/content` already
depends on `@byline/ui`; putting the contract there would have made a cycle.

Imported WordPress stories are `legacy-html` and never pass through any of
this. `normalizePayloadStoryBody` returns their HTML untouched.

## One registry, no scattered switches

`ARTICLE_BLOCKS` in the contract is the one list. Everything else is keyed by
the same `type` through an exhaustive mapped type, so a new block type is a
compile error until it has a part in each adapter:

- Payload block config: `BYLINE_BODY_BLOCKS` (`@byline/editor/schema`)
- stored-field reader and mapping to the semantic block: `fields.ts`
- editor: `BLOCK_EDITORS` (`client/BylineStoryBlock.tsx`)
- public renderer: `ARTICLE_BLOCK_RENDERERS` (`@byline/ui/article-body`)

`packages/editor/tests/editor.test.ts` fails if any registered type lacks one.

## Lexical stays the authoritative state

The story body is Payload's native Lexical field with `BlocksFeature`. Every
Byline block uses one Payload `admin.components.Block` (`BylineStoryBlock`), so
Payload's generic block form never appears. A block editor reads its node with
`useBlockNode` and writes with `node.setFields(..., true)` inside an ordinary
Lexical update. That means:

- the Payload form sees every change, so autosave, drafts, versions, locking and
  publication state are unchanged and there is no second save path;
- Lexical history undoes block edits, insertions, moves and removals. Each
  field edit is its own history entry: Payload feeds its form from Lexical's
  `OnChangePlugin`, which skips updates tagged `history-merge`, so merging typing
  into one undo step would stop those edits reaching the form and autosave;
- the Story header's "Unsaved changes" stays honest: Payload only clears the
  form's `modified` flag after an autosave if nothing called `setModified` while
  the request ran, even a call that changed no data (a re-emitted editor state, a
  field re-announcing its value). `useSettleAutosave` (`ui/story/form.ts`) clears
  the flag when an autosave succeeded and the form's data equals what it started
  with; a real edit mid-save still differs, so it stays unsaved and autosaves
  next. The stray call itself was never traced; the check does not depend on it;
- when Payload marks the story read-only (another user holds the lock), every
  block field is `readOnly`, toolbars and Add controls are not rendered, and the
  article stays readable.

Payload's `+` handle is turned off (`hideAddBlockButton`); its drag handle stays
and moves whole blocks.

## Prose

Allowed: paragraph, H2, H3, bold, italic, web links, bulleted and numbered
lists, with Payload's inline toolbar for a selection. Links are web addresses
only (`LinkFeature({ enabledCollections: [] })`). Subscript, superscript and
inline code stay off: the legacy corpus has no reporting that needs them, and
enabling them is a reviewed decision, not a default. There is no font, size,
colour, background, alignment, indent, column, table, code, HTML or raw-embed
feature, and no permanent formatting toolbar.

## The eight block schemas

Semantic data (the contract; `packages/article-body/src/types.ts`):

| Block | Data |
| --- | --- |
| `photo` | `{ media, caption, altOverride?, placement: "column" \| "wide" \| "full" }` |
| `gallery` | `{ items: [{ id, media, caption, altOverride? }], fit: "natural" \| "crop" }` (2–24) |
| `reportedQuote` | `{ text, attribution }` |
| `pullQuote` | `{ text, attribution? }` |
| `keyFacts` | `{ heading, facts: [{ id, text }] }` (≤12) |
| `context` | `{ heading, body: paragraph[] }` |
| `document` | `{ media, title?, context?, source?, pages: [{ id, page, label }] }` (≤12) |
| `timeline` | `{ items: [{ id, label, title, body, current }] }` (2–25) |

`label` is editorial text ("Fall 2026"), not a date. Gallery columns are not
stored: two photographs pair, larger galleries use the responsive grid by
container width. Photo placement is a fixed choice, never a pixel width.

Stored in Lexical, a block keeps the same fields plus Payload's `id`, `blockType`
and `blockName`; the normalizer copies only allowlisted fields, so `blockName`,
form state and populated Media documents never reach `byline-v1`.

### Context body

The body is stored as plain text with blank lines between paragraphs and edited
as paragraphs in the article's own paragraph slots. Payload's nested rich text
inside a block would have raced with the direct node writes this editor relies
on (focus, autosave and the inline toolbar all belong to the outer editor). The
cost: no links inside Context for now. If links are needed later, add them with a
proper bounded representation rather than nesting an editor.

## Media: the asset owns the facts, the block owns the use

Media owns the file, default alt text, creator, credit, copyright, license,
source, focal point and art direction. A block owns which asset, this story's
caption, an optional alt override and placement. **No credit is stored in a
block**, and a test enforces it. The editor shows the credit resolved from Media
(creator, then credit line, without a "Photo by" lead-in) as read-only text, and
when an asset has none it says so and links to Media; correcting a credit there
fixes every story that uses it.

Choosing, replacing and uploading media uses Byline's `MediaPickerDialog` and
upload endpoint through a host adapter (`BylineEditorHost`, supplied by
`apps/newsroom/src/ui/story/editor-host.tsx`). Payload's raw Media picker is
never shown. The Story's lead image uses the same experience and still writes
the real `featuredMedia` field.

## Insertion

- **Slash.** Payload's native slash menu, unchanged. It matches a query against
  an item's label and its keywords (`block`, `blocks`, the slug), ignoring
  spaces, hyphens and underscores. `/photo` finds Photo and Photo Gallery,
  `/gallery` Photo Gallery, `/quote` Reported Quote and Pull Quote, `/facts` Key
  Facts, `/context` Context, `/doc` and `/pdf` Document (PDF), `/timeline`
  Timeline. The Document block's label contains "PDF" on purpose: Payload 3.92.1
  gives no supported way to add aliases to BlocksFeature items without
  duplicating entries. A slash query cannot contain a space, so `/heading 2`
  does not work; `/h2` does.
- **Add menu.** A shadcn `Command` over the registry, grouped by editorial task
  (Media, Explain, Tell the story) and searchable by the registry's aliases. A
  `+` appears beside the paragraph being written (pointer devices), and an
  always-visible Add bar sits under the story. On touch or narrow screens the
  same content opens in a bottom `Sheet`. It inserts through Payload's own
  `INSERT_BLOCK_COMMAND`, the command the slash menu runs, so both paths create
  identical nodes.

A newly inserted block takes focus in its first field. Until it appears,
Payload fetches its form state from the server first, so the canvas clears the
caret on insertion; text typed in that gap no longer lands in the paragraph
below.

## Selected-block controls

A selected block gets a small toolbar over the margin (never over content),
showing the block's name and its actions, and a More menu:

- `ButtonGroup`: related actions (Replace, Add event, Page reference).
- `ToggleGroup`: exclusive choices (Column/Wide/Full, Whole/Even grid).
- `DropdownMenu`: Move up, Move down, Remove, and the Context heading choices.
- `Popover` on a pointer, `Sheet` on touch: secondary settings (alt text).
- `Tooltip`: icon labels. `Empty`: unfinished media. `Attachment`: the chosen PDF.
- `Badge`: "Not published yet" / "Left out" beside a calm one-line reason.

There is no permanent inspector. Everything needed to finish a block is typed
where the reader sees it: the caption under the photograph, the quote in the
quote, the attribution under it, the heading in the heading, each fact in its
row, each timeline event in the timeline, the document's title, context and page
references beside the file. Removing a block is a document edit with an Undo
toast, not a confirmation dialog.

### Incomplete blocks

Drafting is forgiving; publishing is strict. Unfinished blocks save, autosave
and stay editable, with a short note under the selected block. When the body is
normalized, `finalizeBlock` leaves out anything incomplete and reports why: a
Photo without a photograph, a Gallery under two usable photographs, a quote
without text (or, for a Reported Quote, without a source), empty fact rows, a
Document that is not a PDF, timeline events with only a date label. An
unfinished block never becomes malformed public output.

## Timeline interaction

Carried over from the WordPress Timeline (interaction, not storage): Enter moves
label → headline → explanation → the next event, and adds one after the last (up
to 25); add above and below; duplicate; move earlier and later (toolbar and
Alt+Shift+↑/↓); remove; mark the single Latest event; live-region announcements;
focus follows the changed event. No drag-and-drop is required. Gallery photos and
Key Facts rows reorder with buttons and Alt+Shift+arrows too.

## Shared CSS, not copied CSS

`packages/ui/article-body.css` holds the article shell (the `byline-content`
container every breakout measures against), the 760px story column, prose
typography and the block frame. `article.css` imports it for the public site and
Preview as Byline; the newsroom imports it for the Story canvas. The feature
partials (`figure.css`, `context.css`, `story-base.css`, `timeline.css`,
`document.css`) style the provider-neutral classes (`.byline-photo`,
`.byline-gallery`, `.byline-reported-quote`, `.byline-pull-quote`,
`.byline-key-facts`, `.byline-context`, `.byline-document`, `.byline-timeline`)
beside the legacy `.wp-block-*` selectors at the same specificity, so existing
WordPress content renders as before while `legacy-html` exists.

`packages/editor/src/canvas.css` does only two things: cancels Payload's own
editor styling where it would change the article (its Lexical theme sizes,
colours and list indents), and draws editor chrome (selection, toolbars, inline
fields, notes, insertion). If a rule there changes how published content looks,
it belongs in the shared CSS instead.

The newsroom compiles `rem` to `px` for its Byline stylesheets, because Payload
pins the admin root font to 13px; that is how the canvas reaches the public
site's sizes. The site's font files are served from
`apps/newsroom/public/fonts` (a symlink to `apps/web/public/fonts`).

## Accessibility and touch

Every pointer action has a keyboard path; every icon control has a name; edits
are announced through one polite live region; focus rings and reduced-motion and
forced-colors rules are explicit. At touch or phone widths the toolbar sits in
the flow with 44px targets, row and item actions are always visible for the row
being edited, and the Add bar is sticky, so nothing depends on hover or `/`.

## The Story form and nested forms

The Story screen lives inside Payload's document `<form>`. The existing
`keepSubmitsInByline` guard stays on the Story root, every button is
`type="button"`, Enter in single-line fields is handled, and the Media picker is
mounted by the shell in its own layer. The browser suite watches for any
non-autosave write to the story.

## Why Payload Views are not foundational

Payload 3.92.1's Views are experimental. The contract between editor and
renderer is Byline's `byline-v1` plus shared primitives and CSS, so removing or
changing Views could never change stored data or public rendering. Astro does
not depend on Payload Views, JSX converters or node maps.

## Why Scrollytelling is not a block

The WordPress Scrollytelling blocks were removed on purpose. Scroll-driven
stories are repository visual stories (`packages/story-presentations/src/`). No
Scrollytelling block exists in the registry, and the normalizer reports an
unknown block type instead of dropping it silently. Interactive is not part of
this slice; when it comes, it keeps the uploaded-document, sandboxed,
text-alternative, role-restricted model and does not shape the ordinary block
model.

## Normalization boundary

`normalizePayloadArticleBody(state, { media })` turns stored Lexical state into
a canonical `ArticleBody`: it maps allowed prose, the eight blocks and their
Media references in order, finalizes every block, and returns `issues` for
anything it does not know (unsupported nodes and formats, unsafe links, left-out
blocks) rather than dropping it silently. `collectMediaIds` lists the assets to
resolve first; `articleMediaFromPayload` builds the media record from a Media
document (the host chooses `src`). Media references stay provider-neutral here. Public same-origin static URLs are
assigned later when the Astro build materializes referenced prepared renditions
into its Cloudflare asset bundle.

## What exact Live Preview consumes next

```text
unsaved Payload Story form
          ↓
Payload Story normalizer        (normalizePayloadStoryBody, plus story fields)
          ↓
canonical PublicStory + ArticleBody
          ↓
@byline/story-presentations
          ↓
custom override → Immersive → Standard
          ↓
exact private preview iframe
```

The body from this slice drops straight into that path: the renderer reads only
`ArticleBody`, and there is no preview-only block renderer.

## Out of this slice

Live Preview, presentation extraction, public snapshot v1/v2, the importer,
public static-media materialization, and the rest of the block library (portrait +
text, visual chapter, video/audio, expandable, footnotes, chart/map, data table,
comparison, key numbers, annotated image, before/after, related coverage, poll,
margin and editor's notes, Repository Interactive). Retired WordPress concepts do
not come over: Photo Essay (Photo + prose + Gallery), Photo Pair (a Gallery with
two photographs), Why It Matters / What's Next / How We Know (Context headings),
Story Audio / Story Video variations, arbitrary Columns, Main + Aside.

## Testing

```sh
npm run test:article-body       # contract, readiness, boundary
npm run test:editor             # registry completeness, round trip, normalizer, slash lookups
npm run test:frontend           # includes the ArticleBody renderer tests
npm run test:browser --workspace @byline/newsroom   # needs a running newsroom
```

The browser suite (`apps/newsroom/tests/browser`) authors a full story through
the UI. It runs against a live newsroom and database with the local editor
account, so it is not part of `npm test`; set `BYLINE_EDITOR_E2E_URL` and, to use
installed Chrome, `BYLINE_PLAYWRIGHT_CHANNEL=chrome`.
