# Search and social metadata

The public Astro site is the only source of search and social metadata. Everything
below is generated at build time and checked by `apps/web/scripts/verify-seo.mjs`
(part of `postbuild`), so a regression fails the build.

## Where it lives

| Concern | Code |
| --- | --- |
| Page metadata, JSON-LD, social images | `apps/web/lib/seo.ts` |
| `<meta>` serialization | `apps/web/lib/metadata.ts`, `src/layouts/BaseLayout.astro` |
| WordPress date → ISO timestamps | `apps/web/lib/dates.ts` |
| Image alt fallbacks | `apps/web/lib/image-alt.ts` |
| `sitemap.xml` | `apps/web/lib/sitemap.ts`, `views/sitemap.ts` |
| `news-sitemap.xml` | `apps/web/lib/news-sitemap.ts` |
| `feed.xml` (RSS 2.0) | `apps/web/lib/feed.ts`, `src/pages/feed.xml.ts` |
| Build audit | `apps/web/scripts/seo-audit.mts`, `scripts/verify-seo.mjs` |

## Rules the build enforces

- Every social image URL (`og:image`, `twitter:image`) is absolute. Mirrored media
  lives at `/_wordpress-media/...` and is resolved against the public origin.
- Dates in JSON-LD, Open Graph, the sitemaps and the feed come from WordPress's
  GMT fields (`date_gmt`, `modified_gmt`) as ISO 8601 UTC. A post with only local
  dates is read in the publication timezone. Readers still see dates in
  `America/New_York`.
- Article pages do not render the masthead's build date (`<time>`); the homepage and
  other pages keep it.
- `article:author` is the author's canonical `/author/<slug>/` URL. One-off guests
  without a profile page are named in JSON-LD only.
- The publication is one `NewsMediaOrganization` (`/#organization`), described in full
  on the homepage and referenced by `@id` (with name and logo) as each article's
  publisher. The `WebSite` entity (`/#website`) is named "Weekly Wildcat".
- The homepage title is "Weekly Wildcat, Ninety Six High School's Official Student Newspaper"
  (the site name plus the publication tagline, unless the CMS sets a custom default title) and
  the masthead is the page's single `h1`.
- Image alt text is the editor's alt text, or an attachment title only if it reads like
  a description. Filename-like titles never become alt text.
- Section descriptions come from `publication.sections[].description`; a WordPress
  category description overrides them only when it is a real sentence.
- The sitemap lists only canonical, indexable pages. Redirect sources, search, the 404
  page, internal CMS pages and `noindex` pages are never listed. Authors without
  published stories and sections without stories are not listed.
- The news sitemap keeps Google News's two-day window.

## Page indexing

CMS Pages are public by default. In the Byline Page panel, **Search engines** can set a
page to *Hidden* (published, `noindex`, not in the sitemap) or *Internal* (not published
on the public site). The "CMS Notice" page and slug `78-2` are always internal.

## Retired URLs

`/media-assets/` (two logo downloads that the Media Kit already offers) redirects to
`/media-kit/`. Add further retired page slugs to `REDIRECTED_PAGE_SLUGS`.

## Preferred sources

The newsletter block links to Google's no-JavaScript preferred-source deeplink
(`lib/preferred-source.ts`). Google lists the link as optional; see
<https://developers.google.com/search/docs/appearance/preferred-sources>.

## Article image variants

`NewsArticle.image` lists the original and, where the upload already has one, the
largest size in each of Google's 16:9, 4:3 and 1:1 ratios. WordPress sizes keep the
photo's own proportions, so no crops are generated. Registering cropped sizes in the
plugin would add real 16:9/4:3/1:1 variants for new uploads; it is left as follow-up
work because every size is mirrored into the static export.
