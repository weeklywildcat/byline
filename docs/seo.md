# Search and social metadata

The public Astro site is the only source of search and social metadata. Everything
below is generated at build time and checked by `apps/web/scripts/verify-seo.mjs`
(part of `postbuild`), so a regression fails the build.

## Where it lives

| Concern | Code |
| --- | --- |
| Page metadata, JSON-LD, social images | `apps/web/lib/seo.ts` |
| `<meta>` serialization | `apps/web/lib/metadata.ts`, `src/layouts/BaseLayout.astro` |
| Publication date → ISO timestamps | `apps/web/lib/dates.ts` |
| Image alt fallbacks | `apps/web/lib/image-alt.ts` |
| `sitemap.xml` | `apps/web/lib/sitemap.ts`, `views/sitemap.ts` |
| `news-sitemap.xml` | `apps/web/lib/news-sitemap.ts` |
| `video-sitemap.xml`, video `VideoObject` | `apps/web/lib/video-sitemap.ts`, `apps/web/lib/story-video.ts` |
| `feed.xml` (RSS 2.0) | `apps/web/lib/feed.ts`, `src/pages/feed.xml.ts` |
| Build audit | `apps/web/scripts/seo-audit.mts`, `scripts/verify-seo.mjs` |

## Rules the build enforces

- Every social image URL (`og:image`, `twitter:image`) is absolute. Prepared media
  lives at `/_byline/media/...` and is resolved against the public origin.
- Dates in JSON-LD, Open Graph, the sitemaps and the feed come from the published and modified instants in Snapshot v2. Readers still see dates in
  `America/New_York`.
- Article pages do not render the masthead's build date (`<time>`); the homepage and
  other pages keep it.
- `article:author` is the author's canonical `/author/<slug>/` URL. One-off guests
  without a profile page are named in JSON-LD only.
- Public contributor pages and article bylines share one stable Person entity at
  `/author/<slug>/#person`. Profile pages identify their canonical portrait as
  `#profile-image` and list recent authored stories via `hasPart`.
- Images reused only for presentation (author avatars outside the person's own
  profile, story cards outside the story itself) use
  `/_byline/presentation-media/`. Those files contain the same bytes as their
  mirrored `/_wordpress-media/` source but are excluded in `robots.txt`, so
  card/avatar copies do not compete with the page that owns the image's canonical
  search context.
- The presentation-only rule also applies to homepage package art, article photos
  reused on About or the Media Kit, and coverage artwork on the coverage index.
  The detail/article/profile page keeps the canonical media URL.
- The default Open Graph image is a link-preview fallback only. An article with no
  featured image omits `NewsArticle.image` rather than claiming the publication's
  generic share card as story photography.
- The publication is one `NewsMediaOrganization` (`/#organization`), described in full
  on the homepage and referenced by `@id` (with name and logo) as each article's
  publisher. The `WebSite` entity (`/#website`) is named "Weekly Wildcat".
- The homepage title is "Weekly Wildcat, Ninety Six High School's Official Student Newspaper"
  (the site name plus the publication tagline, unless the CMS sets a custom default title) and
  the masthead is the page's single `h1`.
- Image alt text is the editor's alt text, or an attachment title only if it reads like
  a description. Filename-like titles never become alt text.
- Section descriptions come from `publication.sections[].description`; a
  section description overrides them only when it is a real sentence.
- The sitemap lists only canonical, indexable pages. Redirect sources, search, the 404
  page, internal CMS pages and `noindex` pages are never listed. Authors without
  published stories and sections without stories are not listed.
- The news sitemap keeps Google News's two-day window.

## Video stories

A video story is an Story whose **Format** is Video and which has one primary YouTube video.
There is no video post type or category. Writers set Format and paste a YouTube
link, in the Story Workspace's Details or the editor's Format panel; nothing else.
A YouTube embed in an ordinary article's body never makes it a video story.

- The newsroom normalizes the YouTube URL and stores its video facts. Readiness blocks publication without a valid video.
- Snapshot v2 carries the story format and video metadata.
  `packages/core/src/story-video.ts` is the one parser/validator both sides use.
- The story's own URL is the watch page. `ArticleView` renders a real YouTube
  `<iframe>` (`https://www.youtube.com/embed/<id>`) in place of the lead photo,
  above the body, at the wide measure; no click-to-load poster. Immersive does not
  apply to video stories.
- The article's JSON-LD becomes one `@graph`: the unchanged `NewsArticle` (with
  `video` → `#video`) and a `VideoObject` (`#video`). `name` is the YouTube title,
  else the headline; `description` the deck, else YouTube's description, else the
  opening of the story; `thumbnailUrl` YouTube's best thumbnail; `uploadDate`
  YouTube's publication time, else the story's; `duration` only when YouTube
  reported one. The video sitemap repeats exactly these values and the same
  player URL, and is advertised in `robots.txt`.
- `/watch/` lists every video story (noindex while there are none). It is a hub,
  not a watch page, and never a canonical URL for a story.
- The build audit fails when a video page's player iframe, `VideoObject` and
  video sitemap entry disagree, or a required `VideoObject` field is invalid.

## Page indexing

CMS Pages are public by default. In the Byline Page panel, **Search engines** can set a
page to *Hidden* (published, `noindex`, not in the sitemap) or *Internal* (not published
on the public site). The "CMS Notice" page and slug `78-2` are always internal.

## Retired URLs

`/media-assets/` (two logo downloads that the Media Kit already offers) redirects to
`/media-kit/`. Add further retired page slugs to `REDIRECTED_PAGE_SLUGS`.

The staff directory lives at `/staff/`; its former URL `/authors/` is a 301 in the generated
`_redirects` file (an edge redirect in the route manifest). Individual profiles stay at
`/author/<slug>/`.

## Preferred sources

The newsletter block links to Google's no-JavaScript preferred-source deeplink
(`lib/preferred-source.ts`). Google lists the link as optional; see
<https://developers.google.com/search/docs/appearance/preferred-sources>.

## Article image variants

`NewsArticle.image` lists the original and one image in each of Google's 16:9, 4:3
and 1:1 ratios. An editor's crop for that ratio (Wide, Standard, Square) wins.
The public snapshot names the exact prepared files; see [publication media](publication-media.md).

Open Graph and X cards use the editor's 1200×630 social crop when the featured image
has art direction, and the original photo otherwise.
