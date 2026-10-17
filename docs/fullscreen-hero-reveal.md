# Fullscreen hero reveal

A page opens on a full-screen image with one centered statement. Scrolling slides
the rest of the page up over the image, which stays pinned behind it until it is
covered. The effect is plain HTML and CSS plus one tiny inline script, so it fits
the static Astro export.

It currently lives on the Diversity & Inclusion page:

- `apps/web/views/diversity-inclusion/page.tsx` — markup
- `apps/web/views/globals.css` — the `.di-hero*` and `.di-content` rules
- `apps/web/public/diversity-inclusion/` — `hero-960.jpg`, `hero-1600.jpg`, `hero-2400.jpg`

## How it works

Two stacked layers inside one `<main>`:

1. **The hero** is `position: sticky; top: 0` with a fixed height. It holds the
   image, a dark scrim and the centered copy.
2. **The content wrapper** (`.di-content`) follows the hero in normal flow, has an
   opaque `background: var(--paper)` and `z-index: 1`. As the user scrolls it rides
   up over the hero, which stays stuck at the top.

Details that make it behave:

- **Layer order inside the hero.** Image `z-index: 0`, scrim (`.di-hero::before`)
  `1`, text and scroll cue `2`. Without explicit z-indexes the absolutely
  positioned image paints over the scrim and the text loses its contrast.
- **Fitting under the site header.** `.site-header` is in normal flow, not fixed,
  so a plain `100vh` hero would push its bottom edge below the fold. An inline
  script sets `--di-header-h` to the header's measured height (on load, on resize
  and through `ResizeObserver`), and the hero height is
  `calc(100svh - var(--di-header-h, 150px))`. Header plus hero then fill the
  first screen exactly.
- **No gap while scrolling.** The hero only starts sticking once the header has
  scrolled away, and the content wrapper always starts directly below the hero's
  natural position, so nothing shows between them.

The scrim is `rgba(14, 17, 22, 0.66)` over a busy illustration. The statement is an
Erode headline at weight 600, `clamp(1.25rem, 2.4vw, 2rem)`, centered with flexbox.

## Reusing it on another page

The classes are namespaced `di-`. Before a second page uses the pattern, rename
them to a generic prefix (for example `hero-reveal`) in `globals.css` and the
Diversity & Inclusion page in one change, and ideally lift the markup into a shared
`HeroReveal` component that takes `title`, `statement`, `image` and `alt` props.

### 1. Prepare the image

Crop-safe artwork works best, because `object-fit: cover` crops it on every screen
shape. Export three widths into `apps/web/public/<page>/`:

```sh
for w in 960 1600 2400; do
  sips -s format jpeg -s formatOptions 72 --resampleWidth $w source.jpg --out hero-$w.jpg
done
```

### 2. Markup

The hero goes first in `<main>`; the existing page body is wrapped in `.di-content`.

```tsx
<script id="hero-fit" dangerouslySetInnerHTML={{ __html: HERO_FIT_SCRIPT }} />
<header className="di-hero">
  <img className="di-hero-image" src="/page/hero-1600.jpg"
       srcSet="/page/hero-960.jpg 960w, /page/hero-1600.jpg 1600w, /page/hero-2400.jpg 2400w"
       sizes="100vw" width={2400} height={2400} alt="" fetchPriority="high" />
  <div className="di-hero-copy">
    <h1 className="di-hero-kicker">Page title</h1>
    <p className="di-hero-statement">The one statement.</p>
  </div>
  <a className="di-hero-scroll" href="#content"><span>Scroll</span>{/* chevron svg */}</a>
</header>
<div className="di-content" id="content">
  <div className="about-page">{/* existing sections */}</div>
</div>
```

The header-fit script is the same on every page:

```js
(function(){var h=document.querySelector('.site-header');if(!h)return;
var r=document.documentElement;
function f(){r.style.setProperty('--di-header-h',h.getBoundingClientRect().height+'px')}
f();addEventListener('resize',f);
if(window.ResizeObserver)new ResizeObserver(f).observe(h)})()
```

### 3. Styles

The core of the pattern, from `globals.css`:

```css
.di-hero {
  background: #1f2328; color: #fff;
  height: calc(100svh - var(--di-header-h, 150px));
  min-height: 420px; overflow: hidden;
  position: sticky; top: 0; z-index: 0;
}
.di-hero-image { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; z-index: 0; }
.di-hero::before { content: ""; position: absolute; inset: 0; background: rgba(14,17,22,.66); z-index: 1; }
.di-hero-copy { position: absolute; inset: 0; z-index: 2; display: flex; flex-direction: column;
  align-items: center; justify-content: center; text-align: center; padding: 0 24px; }
.di-content { position: relative; z-index: 1; background: var(--paper); }
```

Typography, the scroll cue and the reduced-motion rule sit in the same block of
`globals.css`; copy them with the rest.

### Checklist for a new page

- [ ] Hero image exported at three widths and committed under `public/`
- [ ] Statement is one or two sentences; the page `<h1>` stays as the small label above it
- [ ] Page body sits inside an opaque wrapper with a higher z-index than the hero
- [ ] Checked at about 1440x900 and at phone width

## Gotchas

- **Legibility.** Colorful or pastel art needs the scrim. A 0.5 scrim looked muddy
  on the silhouettes image and too thin on the hands image; tune the alpha per page.
- **Accessibility.** The image is decorative (`alt=""`); the statement carries the
  meaning. Keep exactly one `<h1>` per page, which is the small uppercase label in
  the hero. The "Scroll" cue is a real link to the content wrapper, so keyboard
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
- **Sticky ancestors.** Sticky positioning breaks if any ancestor between the hero
  and `<main>` sets `overflow: hidden` or `overflow: auto`. Keep the hero a direct
  child of `<main>`.
- **Image licensing.** Confirm the license and credit line before shipping any new
  hero image.
