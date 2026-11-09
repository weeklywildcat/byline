# AGENTS.md — Story presentations

These instructions apply to work under `packages/story-presentations/`. This package is shared by the public site (Astro/Vite) and the newsroom's Live Preview (Next.js): never import `import.meta.glob`, `?inline` CSS or any other bundler-specific syntax here. A story's `styles.css` and `client.ts` stay in its folder; each host loads them on that story's page alone (`apps/web/lib/story-presentation-host.tsx`, `apps/newsroom/src/preview/story-assets.ts`).

This directory is the developer escape hatch for the occasional Weekly Wildcat story that needs a bespoke presentation. By default the Byline newsroom remains the source of truth for the journalism and the repository controls only presentation. The one deliberate exception is a **flagship visual story** (below), whose narrative lives here.

## When a writer asks for an immersive story

A request may be as informal as:

- "Make this article immersive."
- "Give this story a better opening."
- "Can you make this feel like a NYT feature?"
- "Put the headline over the photo."
- "I want a custom opening for this story."

Do not require the writer to understand this architecture.

Start by identifying the story and reading enough of it to understand what the presentation should emphasize. If the writer gives a public URL, slug, title, or Byline editor URL, resolve the Byline Story ID yourself when possible. Use the immutable post ID for repository overrides, never the slug or headline.

Then decide which of these paths fits the request:

1. **Built-in Immersive is enough.** If the request is only the standard fullscreen featured-image reveal with a bottom-left or centered headline, do not create a repository override. That treatment already exists as the Byline newsroom **Story presentation → Immersive** option.
2. **Bespoke presentation is warranted.** If the writer wants custom art direction, unusual typography, a different composition, story-specific graphics, custom transitions, or placement beyond the built-in Immersive treatment, create a repository override.
3. **A flagship visual story is warranted.** Only when the reporting, data, photography, graphics and scrolling must work together as one experience (scrollytelling, a sticky chart that changes with the text, a visual narrative) and mapping the Byline newsroom paragraphs to it would make the work worse. Create it with `--visual` (see below). Ask before choosing this for an ordinary story: it moves the narrative out of the Byline newsroom.

Use the Chart / Map block for supported hosted charts and maps. Use a Repository Interactive for a small custom interaction, and a flagship visual story for scrollytelling.

A repository override always wins over the Byline newsroom Standard/Immersive setting.

## Before designing

Inspect:

- `docs/custom-story-presentations.md`
- the target story's current content and featured image
- `src/registry.ts`
- an existing presentation, if one is relevant
- the shared article primitives in `@byline/ui`
- `HeroReveal` / `HeroRevealContent` if the opening uses the reveal behavior

Do not begin by copying an old custom story wholesale. Reuse shared primitives, but make the art direction appropriate to the story in front of you.

## Creating an override

Use the scaffold unless there is a concrete reason not to:

```sh
npm run story-presentation -- create <story-id> <kebab-case-name>
```

It creates the story component, isolated stylesheet, and registry entry.

For a flagship visual story:

```sh
npm run story-presentation -- create <story-id> <kebab-case-name> --visual
```

It also creates `client.ts` and registers `defineVisualStory({ name, Component })`. Never hand-convert a presentation into a visual story by other means; `defineVisualStory` is the opt-in.

Keep the generated structure unless changing it improves the design. A custom presentation receives only the normalized `ArticlePresentation` and standard article slots.

## Editorial source of truth

**Never hard-code the journalism into TSX or CSS.**

Do not type the article's:

- headline
- deck/excerpt
- byline
- caption
- photo credit
- body paragraphs
- correction text
- publish/update dates

Render those values from `presentation` through the shared article primitives.

The writer must be able to edit the story in the Byline newsroom after the custom presentation ships and see those edits appear automatically.

Decorative, non-editorial interface text may be coded when appropriate, but avoid inventing labels or chapter text that changes the meaning of the story.

Render the Byline newsroom body exactly once with `ArticleBody`.

## Flagship visual stories

In a visual story the narrative (text, figures, graphics, data) is written in the story folder as semantic JSX and **replaces** the Byline newsroom body on the page. Everything else above still applies: the headline, deck, byline, dates, lead image with its caption and credit, corrections, topics and series come from the Byline newsroom through `presentation` and are never typed.

- `presentation.body` is empty for a visual story. Never render `ArticleBody` in one.
- Keep the narrative in the server-rendered JSX. Every word must be in the built HTML; `client.ts` only enhances what is already there and must never inject reporting.
- Design the scroll experience for the story in front of you: sticky graphics, changing charts, maps, photography, scroll-triggered states. The scaffold's sticky chart is an example, not a schema. Use ordinary document scrolling (IntersectionObserver, CSS `position: sticky`), no `scroll` listeners that move the reader, no scroll-jacking.
- Under `prefers-reduced-motion`, show each state without animation; the story must make sense without motion and without JavaScript.
- Give graphics a text equivalent (`role="img"` with a `<title>`, or a table) and photographs real alt text and credited captions.
- Import assets and data from the story folder so they ship with that story only.
- Put a text edition or summary in the Byline newsroom body; it feeds RSS, site search and the fallback if the registry line is removed. Pass `readingTime` to `defineVisualStory` when the Byline newsroom body does not reflect the narrative's length.
- A correction to the narrative is a code change: the editor records it in the Byline newsroom (the notice prints on the story) and you fix the text here.

The route omits `articleBody` from the structured data for visual stories automatically; do not touch SEO.

## Required article systems

A bespoke opening is not permission to drop the rest of the article.

Unless the design deliberately relocates them, preserve:

- category
- one and only one `ArticleHeadline` / `<h1>`
- excerpt/deck when present
- byline and contributor avatars
- published/updated information
- reading time
- share actions
- featured-image caption and photo credit
- the Byline newsroom body
- primary-game placement when applicable
- corrections
- poll
- topics
- update notice
- newsletter
- author information
- related stories
- more-by-author
- newsroom tip

Prefer `ArticleStoryFooter` and `ArticleStandardEnding` instead of rebuilding these systems.

Do not move SEO, canonical URLs, Open Graph, NewsArticle JSON-LD, breadcrumbs, or route logic into a presentation. Those remain owned by the article route.

## Visual direction

Treat these as editorial feature pages, not landing-page templates.

Aim for:

- strong hierarchy
- restrained motion
- intentional whitespace
- typography that fits the reporting
- a clear relationship between the lead image and headline
- fewer, stronger visual ideas instead of many effects
- a design that still feels like Weekly Wildcat even when it is distinctive

Avoid generic "AI-designed" effects: excessive gradients, glassmorphism, gratuitous animation, arbitrary rounded cards, glowing text, decorative blobs, or motion that exists only to look technical.

The article itself should remain comfortable to read after the opening.

### Typography and custom fonts

A custom presentation may freely change font family, size, weight, tracking, line height, and placement.

Prefer the font families and CSS variables already loaded by Byline when they fit the story.

A story may use a new font only when the font asset is appropriately licensed and the repository's normal font-loading approach can support it. Do not hotlink a random webfont or add a third-party font CDN just for one story. Do not silently substitute a new font across the whole site.

If a new font is story-specific, scope its use to that presentation and avoid making every article download it.

## Images

The lead image must remain a real responsive `<img>`, not a CSS `background-image`.

Preserve:

- alt text
- intrinsic dimensions
- responsive `srcset` / sizes behavior
- the high-resolution source used by Byline
- caption and credit
- image discoverability for search engines

Do not render a second hidden or duplicate copy of the featured image merely to achieve the layout.

Use `object-fit`, `object-position`, absolute positioning, clipping, masks, and overlays around the real image as needed.

When the editor set a focal point, `presentation.image.objectPosition` carries it (e.g. `"30% 20%"`); apply it to any cover-cropped lead image rather than hard-coding a position.

If text sits over photography, ensure it remains readable against both bright and dark parts of the actual image. Use a restrained scrim/gradient when necessary.

## Responsive requirements

Every custom presentation must be intentionally designed for both desktop and mobile. Do not treat mobile as a compressed desktop layout.

At minimum inspect the result around:

- 1440 × 900 desktop
- 1280 × 800 laptop
- 390 × 844 phone

Also sanity-check narrower phone widths when the headline is long.

On mobile:

- the headline must not run off-screen
- important image subjects should not be accidentally cropped away
- text should not sit under navigation or browser-safe areas
- the opening should not require hover
- tap targets must remain usable
- no horizontal scrolling
- body copy should fall back to the normal readable article measure
- full/wide article blocks must continue to work

Use `svh`/modern viewport units where the shared reveal already does. Do not add fixed pixel viewport assumptions.

## Accessibility

A custom presentation must:

- have exactly one article `<h1>`
- preserve logical DOM reading order even when CSS visually repositions elements
- preserve meaningful image alt text
- preserve captions and credits
- maintain readable contrast
- keep controls keyboard reachable
- show visible focus states
- avoid keyboard or scroll traps
- not depend on hover for essential information
- respect `prefers-reduced-motion`
- remain understandable with motion disabled
- avoid autoplaying audio or other surprising media behavior

Animation should be progressive enhancement, not required to reveal the article.

Do not implement scroll-jacking.

## Performance and static-site constraints

Byline is a static Astro site.

Keep bespoke presentations compatible with static rendering.

Prefer HTML and CSS. Add client JavaScript only when the requested interaction genuinely needs it, and keep it narrowly scoped. Do not introduce a sitewide client framework dependency for a one-off presentation.

Story-specific CSS belongs in the story folder as `styles.css`; each host prints or loads it with that story only, so unrelated articles do not download it. Do not import it from the story's `index.tsx`.

Namespace every story-specific selector beneath `.story-<name>`. Do not scatter one-off story selectors through global stylesheets.

Decorative assets should also be story-scoped where practical.

## Reusing the fullscreen reveal

For the common "photo fills the screen and article rises over it" treatment, use `HeroReveal` and `HeroRevealContent`.

Do not recreate sticky/reveal geometry from scratch.

The shared reveal already handles the global header relationship, viewport sizing, scroll cue, layering, and reduced-motion expectations.

The built-in `ImmersiveArticleView` is also a useful reference. If the requested design differs only slightly from it, keep the override small rather than forking the entire article renderer.

## Quality bar

Before considering a bespoke presentation finished, view the actual story, not only a fixture with short placeholder content.

Check especially:

- a long headline
- a missing excerpt
- the actual lead-photo crop
- caption and credit length
- contributor/byline wrapping
- the transition from the custom opening to normal article body
- full-width and wide article blocks
- corrections and after-story modules
- desktop and mobile
- reduced motion

The custom opening should feel deliberate with the real reporting and real photography.

If the requested visual idea produces a worse crop, poor readability, or fragile behavior on mobile, adapt the design instead of mechanically following the first layout idea.

## Tests

For a normal bespoke presentation change, run the focused checks first:

```sh
npm run typecheck:frontend
npm run test:frontend
```

Run the browser suite when changing reveal geometry, responsive behavior, navigation interaction, or anything that needs real layout verification:

```sh
npm run test:frontend:browser
```

Run broader repository checks when shared primitives or cross-package behavior change:

```sh
npm run typecheck
npm test
```

Add a regression test for story-specific behavior that is important enough to break later.

Do not weaken existing tests simply to accommodate the design.

## Completion checklist

Before handing the work back, verify:

- [ ] Correct Byline Story ID is registered.
- [ ] No editorial copy is hard-coded (visual stories: only the narrative is, never the headline, deck, byline, dates or lead-image caption).
- [ ] A visual story never renders `ArticleBody`, and its narrative reads completely with JavaScript off and with reduced motion.
- [ ] the Byline newsroom remains editable after the override.
- [ ] Exactly one H1 exists.
- [ ] Featured image remains a real responsive image.
- [ ] Caption and credit remain present.
- [ ] Article body renders once.
- [ ] Standard article systems are preserved.
- [ ] Story-specific CSS is isolated and namespaced.
- [ ] Desktop layout looks intentional.
- [ ] Mobile layout looks intentionally designed, not merely shrunken.
- [ ] No horizontal overflow.
- [ ] Keyboard/focus behavior works.
- [ ] Reduced motion works.
- [ ] SEO/structured-data infrastructure remains untouched.
- [ ] Focused tests pass.

## What to tell the writer when finished

Keep the handoff simple. Writers do not need an architecture tour.

Tell them:

- the story now has a custom presentation
- the Byline newsroom is still where they edit all story content (for a visual story: the headline, deck, byline, photo and corrections; the narrative itself changes in the repository, so send narrative edits to a developer)
- later the Byline newsroom edits will continue to appear in the custom presentation
- the custom design is tied to that story's post ID
- removing the repository override returns it to the normal editor-selected presentation

If the writer only wanted the standard fullscreen treatment, point them to **Story presentation → Immersive** in the Byline newsroom instead of creating an override.
