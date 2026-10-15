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
