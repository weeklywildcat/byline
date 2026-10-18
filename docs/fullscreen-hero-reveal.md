# Fullscreen hero reveal

A page opens on a full-screen image with one centered statement. Scrolling slides
the rest of the page up over the image, which stays pinned behind it until it is
covered. The effect is plain HTML and CSS plus one tiny inline script, so it fits
the static Astro export.

It is the shared `HeroReveal` and `HeroRevealContent` components, used by the
Diversity & Inclusion page and available to any page or custom story
presentation (see [custom-story-presentations.md](custom-story-presentations.md)):

- `packages/ui/src/HeroReveal.tsx` — the components and the header-fit script
- `packages/ui/hero-reveal.css` — the `.hero-reveal*` rules (`@byline/ui/hero-reveal.css`, loaded by `BaseLayout.astro`)
- `apps/web/views/diversity-inclusion/page.tsx` — a page using it
- `apps/web/public/diversity-inclusion/` — `hero-960.jpg`, `hero-1600.jpg`, `hero-2400.jpg`

## How it works

Two stacked layers inside one `<main>`:

1. **The hero** (`.hero-reveal`) is `position: sticky; top: 0` with a fixed height.
   It holds the image, a dark scrim and the copy.
2. **The content wrapper** (`.hero-reveal-content`) follows the hero in normal
   flow, has an opaque `background: var(--paper)` and `z-index: 1`. As the user
   scrolls it rides up over the hero, which stays stuck at the top.

Details that make it behave:

- **Layer order inside the hero.** Image `z-index: 0`, scrim (`.hero-reveal::before`)
  `1`, copy and scroll cue `2`. Without explicit z-indexes the absolutely
  positioned image paints over the scrim and the text loses its contrast.
- **Fitting under the site header.** The header is in normal flow, not fixed, so a
  plain `100vh` hero would push its bottom edge below the fold. An inline script
  sets `--hero-reveal-header-h` to the space above the hero (on load, on resize and
  through a `ResizeObserver` on `<body>`), and the hero height is
  `calc(100svh - var(--hero-reveal-header-h, 150px))`. Header plus hero then fill
  the first screen exactly. The script measures a zero-height
  `.hero-reveal-anchor` placed just before the hero, not `.site-header`: article
  pages lay the header out with `display: contents`, which has no box to measure.
- **No gap while scrolling.** The hero only starts sticking once the header has
  scrolled away, and the content wrapper always starts directly below the hero's
  natural position, so nothing shows between them.

The default scrim is `rgba(14, 17, 22, 0.66)` (`scrim` prop, 0 to 1).

## Using it

```tsx
<main>
  <HeroReveal
    target="content"
    image={{ src: "/page/hero-1600.jpg", srcSet: "/page/hero-960.jpg 960w, /page/hero-1600.jpg 1600w, /page/hero-2400.jpg 2400w", alt: "", width: 2400, height: 2400 }}
  >
    <h1>Page title</h1>
    <p>The one statement.</p>
  </HeroReveal>
  <HeroRevealContent id="content">{/* the page */}</HeroRevealContent>
</main>
```

`HeroReveal` props: `image` (`src`, `srcSet`, `sizes` defaulting to `100vw`, `alt`,
`width`, `height`), `imagePosition` (CSS `object-position`, for the focal point),
`scrim`, `align` (`"center"` or `"end"` for bottom-left copy), `target` (the id of the
`HeroRevealContent` the scroll cue jumps to), `scrollLabel` and `className`. The
children are the words over the image, and should include the page's `<h1>`.

### Prepare the image

Crop-safe artwork works best, because `object-fit: cover` crops it on every screen
shape. For a page-owned image, export three widths into `apps/web/public/<page>/`:

```sh
for w in 960 1600 2400; do
  sips -s format jpeg -s formatOptions 72 --resampleWidth $w source.jpg --out hero-$w.jpg
done
```

A story presentation reuses the story's WordPress featured image instead (see
below); it is the same file as the story's `NewsArticle` image, used once.

### Checklist for a new page

- [ ] Hero image exported at three widths and committed under `public/`
- [ ] Statement is one or two sentences; the page `<h1>` stays as the small label above it
- [ ] Page body sits in `HeroRevealContent`, a direct sibling of the hero
- [ ] Checked at about 1440x900 and at phone width (`tests/browser/hero-reveal.spec.ts` covers the geometry)

## Gotchas

- **Legibility.** Colorful or pastel art needs the scrim. A 0.5 scrim looked muddy
  on the silhouettes image and too thin on the hands image; tune the alpha per page.
- **Accessibility.** A decorative image takes `alt=""` and the statement carries the
  meaning; an editorial photograph keeps its real alt text. Keep exactly one `<h1>`
  per page, in the hero. The "Scroll" cue is a real link to the content wrapper, so keyboard
  users can skip past the hero.
- **Motion.** The chevron bobs; the `prefers-reduced-motion` rule turns that off. Do
  not add scroll-linked JavaScript animation without the same guard.
- **First paint.** The hero background is `#1f2328`, so the page is dark for a
  moment until the image loads. Use `fetchPriority="high"` and a 1600px default; do
  not lazy-load this image, and leave off `decoding="async"`, which made the large
  image paint a beat after the page in testing.
- **Static export.** Plain HTML, CSS and one inline script, consistent with the
  `output: "export"` rule in `AGENTS.md`. Do not move the header-fit logic into a
  client framework hook.
- **Article pages.** The docked logo bar (`.sticky-logo-bar`) covers the top 65px of
  the viewport once the reader scrolls, so the pinned hero's top edge sits behind
  it. Keep important parts of the photograph and copy out of that strip. The scroll
  cue lands the content just beneath the bar through the page's
  `scroll-padding-top`.
- **Sticky ancestors.** Sticky positioning breaks if any ancestor between the hero
  and `<main>` sets `overflow: hidden` or `overflow: auto`. Keep the hero a direct
  child of `<main>`.
- **Image licensing.** Confirm the license and credit line before shipping any new
  hero image.
