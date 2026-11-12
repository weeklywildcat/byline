# Story openings and Site navigation

Two separate, small choices answer "how should this story begin?" without asking a reporter to
design a page. Both live in the newsroom's **Story opening** control (Story details → Appearance),
a `SettingsSurface`: a Popover with a mouse, a bottom Sheet on touch or a narrow screen.

## Opening

| Opening | For | What it is |
| --- | --- | --- |
| Standard | Most daily stories | Headline, deck, byline, lead photo at article width. Unchanged. |
| Feature | Profiles, enterprise, narrative | Headline package on the page; a substantially larger photograph below it (**Wide** or **Full**); caption and credit inset. Phone: photograph edge to edge, headline inset. |
| Immersive | A story with one great photograph | The photograph fills the first screen (`svh`) with the headline over it (**Bottom left** or **Center**), over a fixed scrim. The article rises over the pinned photograph. |
| Split | Profiles and visual features | Desktop: photograph on the left or right (slightly more than half), headline package on the other side. Below 1024px: stacked, headline package then an edge-to-edge photograph. The DOM order is always the headline package first. |

Feature, Immersive and Split need a lead image and are not used for video stories; otherwise the
story opens Standard and the control says why. There are no color, scrim or font controls:
contrast is the design's job.

### Data model

`presentation` is `standard | feature | immersive | split`. The first two existed before, so
every published story reads unchanged (`standard` stays Standard, `immersive` plus
`immersiveAlignment` stays Immersive Bottom left / Center). Sibling settings, each shown only
for its opening: `featureWidth` (`wide`|`full`), `splitImageSide` (`left`|`right`),
`immersiveAlignment`. Repository presentations are keyed by story ID in the registry and never
use these fields, so they override them exactly as before (`resolveStoryPresentation`).

The snapshot gains optional `featureWidth`, `splitImageSide`, `siteNavigation` and the wider
`presentation` enum (v2 and v3 story records; the JSON schemas are updated). A build that reads
them must ship with the producer that writes them.

### Rendering

One contract, three hosts: `resolveBuiltInPresentation` (`@byline/content/story`) decides,
`StoryArticle` renders `PresentedArticleView` (`@byline/ui`), and the public Astro route, the
newsroom's Live Preview and the fixtures all go through it. The lead photograph is a `<picture>`
with the editor's explicit **portrait** (phone) and **standard** (tablet) crops when they exist
(`ArticleImageView.sources`, built in `buildArticlePresentation`). Live Preview has no prepared
crops, so it shows the focal-point framing; check phone crops on the public page.

## Site navigation

`siteNavigation` is `standard` (default) or `minimal`, chosen independently of the opening:
changing the opening never changes it.

- **Standard**: the publication header, unchanged.
- **Minimal**: no utility strip, date, donate, masthead or section row. Only menu (left), logo
  (centre) and search (right) over the opening, on a transparent bar. The logo is one dark asset
  inverted to white with `mix-blend-mode: difference` (an `<img>` and a filter, because a mask
  image must be CORS-readable and Live Preview shows the public site's artwork). Blending fails on
  midtones, so Immersive and a wide Split carry a soft top veil, and the menu and search icons are
  bare dark icons with a white halo (no disc). Hit targets are 44px. On a wide screen a **Split**
  opening puts the logo at the left, beside the menu, because its seam is mid-viewport.
- The menu is a native modal `<dialog>` laid out as a left sheet: focus trap, Escape, inert page,
  focus restored to the menu button, safe-area padding. Its sections are `getNavigation("header")`
  plus the footer's "About" group; search is the existing `/search/`.
- The bar turns from transparent to a publication surface (one CSS transition, off under
  `prefers-reduced-motion`) once the opening is gone, driven by one IntersectionObserver
  (`startStoryNavigation`), never a scroll listener. Without script it stays solid.

The layout decides before rendering: `getStoryChrome` / `resolveStoryChrome` (a repository entry
keeps Standard) feed `BaseLayout chrome=...`, which renders `SiteHeader mode="story-overlay"`.
Live Preview resolves the same way and draws the same `StoryNavigation`. A minimal page sets
`viewport-fit=cover` and clears the insets itself; other pages do not.

## Tests

- `apps/web/tests/story-openings.test.tsx`: resolution, markup, order, navigation markup.
- `apps/web/tests/browser/story-openings.spec.ts`: 390 / 768 / 1024 / 1440px, overflow, centring,
  menu, Escape and focus, search, sticky transition, reduced motion, 200% text, control legibility.
- `apps/newsroom/tests/story-opening-preview.test.ts`: vocabulary, Preview navigation, crops.
