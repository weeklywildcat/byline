# Shared publication styles

The fixed homepage uses the renderers in `packages/ui` and the canonical stylesheet `@byline/theme-weekly-wildcat/styles.css`. Public homepage packages mount inside `.byline-publication-preview`; shared CSS is scoped to that root so WordPress admin styles remain independent.

`apps/web/src/layouts/BaseLayout.astro` loads the stylesheet and Weekly Wildcat fonts. WordPress uses the same theme tokens and fonts for the authenticated article preview.

`themeTokensToCssVariables` maps the canonical tokens to CSS variables. Layout and theme changes belong in source code; there are no runtime theme overrides or layout editor.

Run `node scripts/verify-shared-style-contracts.mjs` to check CSS ownership, scoping, frontend loading, and package empty states.

## WordPress editing canvas

The Post editor in WordPress is styled to look like the public article (Erode headline, Newsreader body, the article measure). That presentation lives only in the plugin, `wordpress-plugin/src/editor-canvas/`, so the Astro site and `packages/` carry no editor-specific code.

It stays in step through three things rather than copies:

- **Tokens:** `editor-canvas/theme-css.ts` turns `@byline/theme-weekly-wildcat` tokens into the canvas's CSS variables with the same `themeTokensToCssVariables` the site uses.
- **Fonts:** `apps/web/views/fonts.css` is imported directly. `wordpress-plugin/loaders/site-font-urls.js` rewrites its `/fonts/` URLs to the files in `apps/web/public/fonts` during the plugin build, so a font added for the site reaches the editor automatically.
- **Typography:** `scripts/verify-editor-canvas-contract.mjs` (part of `npm run verify:contracts`) compares the editor's sizes, spacing and weights with `packages/ui/article.css`. When article typography changes it fails and names the rule to update in `editor-canvas.css`.

`includes/content/editor-canvas.php` loads it for the block editor on Posts only. The byline row, dates and share icons are not blocks, so they appear in the Article Preview screen, not on the canvas.

## Authored story blocks

`packages/ui/src/newsroom-blocks.css` owns the minimal Core markup compatibility
and semantic newsroom presentation shared by Astro, Gutenberg, and Preview as
Byline. It is emitted by the existing block asset pipeline and imported directly
by the authenticated preview entry. The article shell establishes a 1440px editorial canvas around the 760px
prose measure and 1040px wide measure; the editor establishes the same
container contract. See `newsroom-blocks.md` for presets and breakpoints.


## Editorial width and progressive interaction contracts

The shared width variables are `--article-width: 760px`,
`--article-wide-width: 1040px` and `--article-full-width: 1440px`. `article.css`
owns the article shell and typography. `newsroom-blocks.css` owns authored Core
compatibility and story elements. The Post editor supplies the same variables
on its canvas; editor-only controls remain under `src/editor-canvas/`.

Direct authored `alignwide` and `alignfull` blocks use container-query units
and centered margins, shrinking to the shell's available width without `100vw`
overflow. The header/byline and prose stay at 760px. Post-article sections stay
at 1040px. Nested columns do not escape their own layout context. Wide/full
blocks clear floated margin notes. Tables scroll inside their own figure.

`@byline/ui/article-enhancements` exports `enhanceArticleStory(root, options)`.
Astro imports it only when the article contains something that matches
`articleEnhancementSelector` (`@byline/ui/article-enhancement-selector`, a
dependency-free module): any `.wp-block-gallery img` (Photo Gallery images may be
unlinked), an embedded visualization, annotated image, comparison or scrolly
system. Static graphics, Core tables, chapters and prose need no enhancement
JavaScript, and a text-only story downloads none. The module is
framework-free and idempotent, returns cleanup for iframe/unmount hosts, and
uses the root's owning document/window for preview breakpoint and event parity.

The authenticated preview mounts the same enhancer after ArticleView commits
inside its real 1200/768/390px iframe. Local range/disclosure/annotation and
scrolly interactions work; outgoing navigation and gallery actions remain
blocked. Third-party graphics use their authored fallback in private preview.

The Photo Gallery lightbox (`gallery.ts`, the behaviour introduced in #137),
source/origin-validated provider resize listeners, annotation synchronization,
the on-image comparison range (`before-after.ts`) and the reading-line scrolly
stage (`scrolly.ts`) share this lifecycle. Flourish uses its documented `?auto=1` and JSON
`Flourish` / `iframe.resize` messages; Datawrapper uses `datawrapper-height`.
Both require the registered iframe's exact source and origin, matching chart
identity where supplied, and a numeric height between 100 and 2400px. The
shared `visualization.ts` allowlist runs both during saving and before browser
iframe construction. No third-party scripts are serialized into content.

This is progressive enhancement of semantic WordPress HTML, not a React article
runtime. Images, reporting, annotations, source links and linear scrolly steps
remain useful if the enhancer fails. Sticky duplicate visuals are decorative;
original step media stays in accessibility order. Reduced-motion and narrow
screens use the linear story. Astro remains a static export.
