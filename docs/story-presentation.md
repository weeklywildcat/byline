# Story presentation

How a writer decides how strongly a piece of a story interrupts or expands the reading column, without Byline becoming a page builder.

> Byline stores journalism semantics and a small number of editorial presentation choices, never page-builder instructions. A Photo remains a Photo, a Pull Quote a Pull Quote, a Chapter a Chapter. The writer chooses how strongly it should interrupt the reading; the publication still looks like one newspaper.

There are no margins, font sizes, colours, spacers or freeform canvases. Each visual block has a few newsroom-designed **presets**, stored as semantic words (`"bleed"`, `"spotlight"`, `"half"`), never as CSS. Code: `packages/article-body/src/presentation.ts` (vocabulary, defaults, which choices apply), `packages/ui/src/article-body/` (the shared primitives and renderer), `packages/ui/src/newsroom/story-presentation.css` (all geometry), `packages/editor/src/client/blocks/presentation.tsx` (the editor surface).

## The presets

| Block | Choice | Presets | Absent means |
| --- | --- | --- | --- |
| Photo | Width | Reading column, Wide, Full width | (required) |
| | On phones (`phone`) | Auto, Inset, Edge to edge | Auto: column photos inset; wide and full photos edge to edge |
| Feature Media (`portraitText`) | Layout (`presentation`) | Split, Breakout, Spotlight, Sticky | Split (the original Portrait + Text) |
| | On wide screens (`side`) | Photo left, Photo right | (required; not offered for Spotlight) |
| | On phones, first (`phoneOrder`) | Photo first, Text first | Photo first (Split only) |
| | Photo on phones (`phone`) | Auto, Inset, Edge to edge | Auto: Breakout and Spotlight bleed; Split and Sticky stay inset |
| | Words on the photo (`tone`), Behind the words (`scrim`) | Light text, Dark text; Subtle, Standard, Strong | Light text on a Standard scrim (Spotlight only) |
| Chapter (`visualChapter`) | Chapter (`kind`) | Photo, Text, Split | Photo (the original Visual Chapter) |
| | Height (`height`) | Short, Half screen, Full screen | The original proportion (between Half and Full) |
| | Width (`placement`) | Wide, Full width | (required) |
| | Heading (`align`) | Bottom left, Centered | (required) |
| | Words (`tone`) | Light text, Dark text (photo); On the page, Dark band (text and split) | Light over a photo; dark on the page |
| | Behind the words (`scrim`) | Subtle, Standard, Strong | Standard (photo chapters only) |
| Pull Quote | Presentation | Standard, Breakout, Full | Standard |
| Photo Gallery | Layout, Photographs | Grid, Photo Essay, Featured; Whole, Even grid | Grid, Whole |

Every new field is optional and **absent means the block's original look**, so stories saved before presets existed render as they did, and finalizing writes a preset only when it differs from its default (`finalizeBlock`): a legacy body serializes byte-for-byte as before. No migration: the fields live inside the Story's Lexical JSON. The Payload selects have no `defaultValue` on purpose, because Payload fills a default into every block whose form it builds, which would quietly restyle old stories. A newly inserted block gets its recommended preset instead (`NEW_BLOCK_FIELDS` in `packages/editor/src/fields.ts`, applied to every insertion path): a new Chapter is Half screen.

A choice exists only where it applies (`featureMediaChoices`, `chapterChoices`): the editor shows only those, finalizing keeps only those, and the closed validator refuses a stray one (a scrim on a Split, a photograph on a text Chapter).

## What a reader gets

| Preset | Wide screens | Phones |
| --- | --- | --- |
| Photo, Edge to edge | Its width (column, wide, full) | Reaches both screen edges; caption and credit return to the gutter and clear the safe areas |
| Split | Photo beside the passage, 40/60, on its side | One column; photo first unless Text first; photo inset unless Edge to edge |
| Breakout | Photo about 70% of a wide frame, the passage attached at its foot | Photo edge to edge, the passage below it |
| Spotlight | A big photo with a few words over its lower edge on a scrim; the caption stays under the photo | Photo, caption, then the words on the page: words never sit on a portrait crop |
| Sticky | Photo stays in view (CSS `position: sticky`, below the site header) while a longer passage beside it scrolls | No sticking: an ordinary photo-then-passage sequence |
| Photo Chapter | The heading over the photograph at Short, Half or Full screen height (`svh`, so a phone's browser bars never make it jump) | Edge to edge, portrait-friendly; the heading low and clear of the photo credit |
| Text Chapter | A double rule, a kicker and a large heading aligned with the reading column; or a dark band | The same, in the column; a dark band reaches the edges |
| Split Chapter | Photograph and heading side by side | Photograph, credit, then the heading |
| Pull Quote, Breakout / Full | Larger type with more room; Breakout reaches past the column, Full spans the article and is centred | In the column, with room, at a readable size (type is clamped) |
| Photo Essay / Featured | As before; Featured's lead has more room after it | Essay photographs and the Featured lead bleed; captions inset. An even grid keeps two tiles per row, whole photographs one per row |

Breakpoints are the **article canvas** (the `byline-content` container), never the viewport, so the editor canvas, Live Preview and the public page agree at any size. Layout follows width, never pointer type: a wide iPad with touch gets the wide-screen presentation (`presentation-presets.spec.ts` checks it). Edge to edge escapes exactly the shell's side padding (`--byline-article-gutter`) below a 600px canvas.

There is no script in any preset, no scroll listener and no scroll hijacking. Sticky is plain CSS, and every preset reads in source order on a phone: the markup is the phone's order, and wider layouts place the photo with the grid. Data tables still scroll sideways only when their columns do not fit.

## Text over a photograph

Only Spotlight (on wide screens) and photo Chapters set words over a photograph, and only in publication-safe tones: Light text on a darkened scrim or Dark text on a lightened one, Subtle, Standard or Strong. Never a colour. Subtle is for calm photographs with an even area behind the words; Strong for busy or bright ones. The scrim is darkest where the words sit; light words also get a faint shadow. In forced-colors mode the words sit on `Canvas`. The editor warns when Spotlight is given a tall photograph (it becomes a wide band on large screens) and when Split or Sticky is given a very wide one.

## Art direction

Presets use Media's existing art direction (`docs/publication-media.md`), never a second crop system:

- Every photograph that fills a frame uses the Media **focal point** as `object-position`.
- A photo Chapter asks the host for the editor's explicit **Portrait** crop for phones and **Wide** crop for wide screens; Spotlight asks for **Wide** on wide screens. The renderer's `imageSources(asset, sizes, shape)` returns a crop only when the editor drew one in Media → Crops; otherwise the natural files at the focal point serve. The public host serves the prepared crop renditions (`apps/web/lib/native-article.ts`). Nothing new is stored on the story.
- The Presentation surface links straight to **Crops and focal point** wherever a preset crops a photograph.

Each preset has its own responsive `sizes` (`FEATURE_MEDIA_SIZES` in `render.tsx`), so the browser picks the right rendition.

## The editor

Selected-block chrome stays an annotation around the real article: the block name, immediate actions (Replace, Crops, Flip sides, the gallery layout), **Presentation**, Alt text, More. Presentation (`SlidersHorizontal`) is one compact surface per block: a Popover with a mouse, a bottom Sheet on touch or a narrow screen (`SettingsSurface`). It holds labelled groups of presets with small schematic previews; the chosen preset is pressed (`aria-pressed`), heavier and underlined, and described in words below the group, so nothing depends on colour or hover. Arrow keys move within a group, Escape closes the surface, and targets are 44px on a coarse pointer. A short note says what a phone reader will get, and the surface reminds the writer to check it in Preview.

The editor draws the same primitives with the same frame classes (`articleBlockFrameClassNameOf` reads the stored fields), so a preset looks in the canvas as it will publish.

**Feature Media** is the Add menu's name for `portraitText` and **Chapter** for `visualChapter`; the stored slugs never change. A Chapter without a photograph offers "Make it a text chapter" right in its placeholder.

## Preview

Preview is a direct button in the Story header, beside the save status and the main actions, never in the overflow menu. It reads **Preview** (eye) when closed and **Close preview** (X, the filled secondary button) when open; on a narrow header it is icon-only and keeps its name in `aria-label`. It is one button that changes name, so focus stays on it. `useStoryPreview()` exposes `open`, `close` and `toggle` over Payload's own Live Preview state, so when Payload opens or closes the pane (or reopens it from its remembered preference) the button follows. Payload owns the pane, iframe, device sizes (Phone 390, Tablet 820, Desktop 1440), zoom and pop-out.

## Testing

- Contract: `packages/article-body/tests/presentation.test.ts` (defaults, legacy stability, invalid values, which choices apply, the closed validator, Add-menu language).
- Adapter: `packages/editor/tests/presentation-editor.test.ts` (stored fields, Lexical round trip of every preset, Payload selects without defaults, new-block presets); `presentation-surface.test.tsx` (Popover vs bottom Sheet, pressed state, keyboard, Escape).
- Renderer: `apps/web/tests/article-body-presentation.test.tsx` (structure, frame classes, data attributes, source order, `sizes`, art-directed `<picture>` sources, editor/public frame parity).
- Browser, public: `apps/web/tests/browser/presentation-presets.spec.ts` on the feature fixture story (fixture presentation 93, `FIXTURE_FEATURE_STORY_BODY`): no horizontal overflow at 390, 768, 1024 and 1440px, edge-to-edge geometry, Split and Sticky fallbacks, chapter heights, quote widths, galleries, and a wide iPad with touch.
- Browser, newsroom: `apps/newsroom/tests/browser/story-presentation.spec.ts` (Presentation in the real editor, the bottom Sheet on a phone, Add-menu search, new Chapter defaults, and Preview / Close preview).

To look at the presets yourself, build the browser fixture (`BYLINE_CONTENT_MODE=weekly-wildcat-browser-fixture npm run build:frontend`) and open `/2026/07/01/news/weekly-wildcat-feature-rhythm-fixture/` at phone, tablet and desktop widths (the browser tests serve its photographs from `tests/fixtures/story-media`).
