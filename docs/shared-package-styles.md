# Shared publication styles

The fixed homepage uses the renderers in `packages/ui` and the canonical stylesheet `@byline/theme-weekly-wildcat/styles.css`. Public homepage packages mount inside `.byline-publication-preview`; shared CSS is scoped to that root so WordPress admin styles remain independent.

`apps/web/src/layouts/BaseLayout.astro` loads the stylesheet and Weekly Wildcat fonts. WordPress uses the same theme tokens and fonts for the authenticated article preview.

`themeTokensToCssVariables` maps the canonical tokens to CSS variables. Layout and theme changes belong in source code; there are no runtime theme overrides or layout editor.

Run `node scripts/verify-shared-style-contracts.mjs` to check CSS ownership, scoping, frontend loading, and package empty states.
