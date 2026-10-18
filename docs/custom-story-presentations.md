# Story presentations

How a story is laid out on the public site. There are three, chosen in this order:

```
WordPress post
      ↓
ArticlePresentation                   (apps/web/lib/article-presentation.ts)
      ↓
1. repo override registered for the post ID?  → custom TSX            (developers)
      ↓ no
2. author chose Immersive in WordPress?       → ImmersiveArticleView  (authors)
      ↓ no
3.                                            → ArticleView           (default)
```

A repository override always wins over the author's choice. `StoryArticle`
(`apps/web/story-presentations/StoryArticle.tsx`) makes this decision for both
article routes.

## The author option: Immersive

In the WordPress post editor's **Story presentation** panel (Document sidebar):

- **Standard** (default) is the normal article.
- **Immersive** opens the story on its featured image, full screen under the site
  header, with the category, headline and excerpt over it. Scrolling slides the
  article up over the pinned photograph. When chosen, **Headline position** is
  **Bottom left** (default) or **Center**.

There is nothing else to set: no colors, fonts, scrim or layout controls. The
featured image is the hero, so an Immersive story without one is shown as a
standard story (the panel says so). Everything else (byline, caption and credit,
body, corrections, poll, newsletter, related stories, the ending) is the normal
article's, just rearranged.

Under the hood these are two post meta values, `byline_story_presentation`
(`standard` | `immersive`) and `byline_story_immersive_alignment`
(`bottom-left` | `center`), registered in
`wordpress-plugin/includes/content/story-presentation.php` and sanitized to those
values. They are published as `presentation` and `immersiveAlignment` in the
existing post `byline` settings (and its `weeklyWildcat` alias), included in the
build snapshot, and carried as `storyPresentation` and `immersiveAlignment` on
`ArticlePresentation`. Stories from before the setting existed, and any missing or
unrecognized value, are Standard / Bottom left. Changing the choice changes the
post and so triggers the normal rebuild. `ImmersiveArticleView` lives in
`packages/ui` with its styles in `packages/ui/immersive-article.css`.

## The developer override

A repository-defined presentation override for selected WordPress posts. It is an
escape hatch for the occasional story that deserves a one-off layout, not the
normal publishing path.

### What stays in WordPress

Everything editorial: headline, excerpt/deck, contributors and bylines, featured
image with its caption and credit, the Gutenberg body (galleries, Visual
Chapters, scrollytelling, quotes), corrections, topics, publish and update
dates. Authors write, publish and correct exactly as they do now. There is no
checkbox, template, shortcode, block, tag or setting for this feature, and
WordPress does not know it exists.

### What stays in the repository

Layout, styling, animation and decorative assets: how the pieces above are
arranged. Structured data, metadata, Open Graph, breadcrumbs and the canonical
URL stay with the article route and are never part of a presentation.

## How a story is identified

By its **WordPress post ID**, never its slug or headline (those change; the ID
does not). It is the number in the editor URL (`post.php?post=384&action=edit`) or
`id` in `/wp-json/wp/v2/posts?slug=...`. `ArticlePresentation.id` carries it.

The registry, `apps/web/story-presentations/registry.ts`, is an explicit map:

```ts
export const storyPresentations: StoryPresentationRegistry = {
  384: NeedALift,
};
```

**Delete the line and the story is back on the author's choice (Immersive or
Standard) immediately.** A story that is not listed and is Standard renders through
`ArticleView` exactly as it always has.

## How the route resolves it

Both article routes (`src/pages/.../[articleSlug].astro` and the legacy
`views/.../page.tsx`) load the story, build `ArticlePresentation` and the slots as
usual and render `<StoryArticle>`. It looks the post ID up in the registry first.
For an override, structured-data scripts are
rendered by the route outside the custom component, so a presentation cannot omit
them.

A presentation receives `{ presentation, slots }` (`StoryPresentationProps`): the
normalized article model and the interactive slots (`shareActions`,
`primaryGame`, `poll`, `feedback`, `newsletter`). It never receives a raw
WordPress post.

## Creating one

```sh
npm run story-presentation -- create 384 need-a-lift
```

This creates `apps/web/story-presentations/stories/need-a-lift/` with `index.tsx`
and `styles.css`, imports the component in `registry.ts` and adds the
`384: NeedALift,` line. (If the registry has been reshaped and cannot be edited
safely, the command prints the two lines to add.) The generated component is a
working fullscreen-reveal layout built only from shared primitives. Edit its
composition and CSS.

By hand: add `stories/<name>/index.tsx` (default-export a `StoryPresentationComponent`),
add `styles.css`, and add the import and the `id: Component` entry to the registry.

### Building blocks (`@byline/ui`)

| Piece | Renders |
| --- | --- |
| `ArticleShell` | The `byline-article-view` theme scope and the `byline-content` container the wide/full-bleed blocks measure against. `ArticleBody` must sit inside one. |
| `ArticleCategory`, `ArticleHeadline` (the only `<h1>`), `ArticleExcerpt`, `ArticleAthleteMeta` | The header pieces. All accept a `className`. |
| `ArticleMeta` | Avatars, byline, published/updated times, reading time and the share actions slot. |
| `ArticleFeaturedImage` | The lead image as a captioned figure. |
| `ArticleImageCaption` | Only the caption and "Photo: credit", for layouts that paint the image another way. |
| `ArticleBody` | The WordPress body (with the legacy primary-game card ahead of it) or the empty state. |
| `ArticleStoryFooter` | Corrections, poll, topics, update notice, feedback and newsletter, in the standard order. |
| `ArticleCorrections`, `ArticleTopics`, `ArticleUpdateNotice` | The individual pieces of the footer. |
| `ArticleStandardEnding` | About the writers, related stories, more by the author and the newsroom tip. Or compose `ArticleAuthors`, `ArticleRelatedStories`, `ArticleMoreByAuthor`, `ArticleTipCallout`. |
| `HeroReveal`, `HeroRevealContent` | The fullscreen reveal (see [fullscreen-hero-reveal.md](fullscreen-hero-reveal.md)). |
| `ImmersiveArticleView` | The whole Immersive article. An override that only wants a different look can start from its source. |

`ArticleView` is only a composition of these, so a change to a piece reaches every
story, custom or not.

### Styles

Put CSS in the story's own `styles.css`, import it with `?inline` and print it with
`<StoryStyles id="need-a-lift" css={css} />` (the template does this). Then it ships
only inside that story's page, not in the sitewide bundle every article loads.
Namespace every selector under `.story-<name>`; add no one-off selectors to
`globals.css`. Shared behaviour such as the reveal lives in shared CSS
(`packages/ui/hero-reveal.css`).

The headline, category and excerpt are not inside `.byline-article-view`, so style
them yourself. The body, byline and ending are, and inherit the normal article
styles. Wide and full-bleed blocks in the WordPress body work because the body
sits in an `ArticleShell`.

## Rules (for overrides)

- **Never hard-code article reporting.** No headline, deck, byline, caption or
  paragraph in a presentation. Render `presentation` through the primitives; if
  WordPress is edited, the page must change with it. (The framework test fails on
  JSX text in the example.)
- **Do not duplicate the article body.** Render it once with `ArticleBody`.
- **Preserve the standard article systems:** corrections, the update notice,
  topics, authors, share actions, the poll, reader feedback, the newsletter,
  related stories and the newsroom tip. Omit one only deliberately.
- **Keep exactly one `<h1>`** (`ArticleHeadline`), in reading order, with real
  alt text, a captioned and credited lead image, keyboard-reachable controls, no
  scroll trapping, and `prefers-reduced-motion` honoured. Do not make the opening
  depend on JavaScript.
- **Keep the lead image a real `<img>`** with its `srcset` and dimensions, used
  once. Do not paint it as a CSS background or add a second copy of it; that
  would change what search engines index as the story's image.
- **Do not fork SEO or routing** into a presentation.
- **It is an escape hatch.** Prefer improving the shared article. There is no
  WordPress preview of a custom presentation: view it through the public route
  (a local `npm run dev` or build). The editor canvas keeps showing the content,
  not the custom layout.

## Example request for a coding agent

> Create a bespoke presentation for WordPress post 384. Do not hard-code editorial
> content. Use the existing ArticlePresentation data. Make the featured image fill
> the first viewport beneath the site header. Place the category, headline and
> excerpt over the photograph. Keep the photograph pinned while an off-white
> article surface rises over it as the reader scrolls. Put the byline,
> publication information, share actions and image caption at the top of the
> article surface. Render the WordPress article body normally after that and use
> the standard Byline article ending.

Run `npm run story-presentation -- create 384 <name>`; the generated component is
already that layout, so the work is the typography, spacing and any decoration.

## Tests and the fixtures

The fixture build (`BYLINE_CONTENT_MODE=weekly-wildcat-fixture`) marks fixture posts
8 (bottom left), 7 (centered) and 6 as Immersive in WordPress. Post 6 also has the
fixture-only override `stories/override-fixture/`, registered in
`fixtureStoryPresentations`, so production can never match it. Coverage:

- `apps/web/tests/story-presentations.test.tsx`: registry resolution; the standard
  article unchanged; the settings normalized and carried into the model; both
  headline positions with the live WordPress content, one `<h1>`, caption and
  credit, corrections, authors, slots and structured data; and the override
  winning over Immersive.
- `apps/web/tests/browser/hero-reveal.spec.ts`: the reveal geometry at desktop and
  phone width for both alignments, headline placement, reduced motion, the scroll
  cue, no horizontal overflow, the override winning, and the Diversity & Inclusion
  page using the same reveal.
- `wordpress-plugin/tests/story-presentation-regression.php` (meta, defaults,
  sanitizing, REST schema), `tests-js/story-presentation-settings.test.ts` (the
  editor controls' model), and the build-snapshot integration test (the choice
  reaches the snapshot).
- `scripts/story-presentation.test.mjs`: the scaffold command.

When you add a real override, add a test for anything specific to it.

## Known limits

- The registry is code, so adding or removing a presentation is a deploy. A
  changed presentation or registry changes modules the shared article route
  imports, and Astro's incremental build hashes imported modules, so expect article
  pages to be re-rendered (not restored) after such a change.
- The Story presentation panel is in the block editor only. The classic editor
  keeps whatever was saved. "Preview as Byline" still renders the standard article.
- Presentations are static HTML. Anything interactive needs its own island, as the
  existing slots do.
