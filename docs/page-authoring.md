# Page authoring

Normal informational pages are authored in WordPress's native Page editor.
The public static export fetches published Pages from `wp/v2/pages`, generates
one route per page slug, and renders the API's `content.rendered` as the page
body. There is no TypeScript copy of the publication's About, Contact, policy,
or other normal-page prose.

## In WordPress

- Use the native Page editor for normal pages. The editor supports the native
  excerpt, which supplies the page deck and metadata description.
- Use the Byline Page document panel for the optional `_byline_page_eyebrow`
  label shown above the title. The same value is exposed by the compatible
  `bylinePage.eyebrow` REST field.
- Use `Byline → Page Section` for the common heading/body layout. Its heading
  level and wide alignment are editable, and its `Default` and `Featured`
  styles are presentation-only. Core paragraphs, headings, lists, images,
  quotes, embeds, tables, groups, columns, and buttons remain available inside
  the section.
- Use the generic Byline patterns when starting a page. Patterns contain
  editable blocks and placeholder copy; they are not publication-specific
  templates.

Studio remains the authoring surface for homepage composition and saved
homepage presentation. The post editor's editorial workflow remains for
stories. Neither replaces the native Page editor.

## Migration behavior

Migration version 2 converts fresh Weekly Wildcat installs to block markup. On
an existing legacy installation, a v1 page is converted in place only when its
stored `_byline_legacy_seed_hash` and current body still match the original
seed exactly. A page with changed content or a missing marker is editor-owned:
it is never overwritten or duplicated. Such pages remain readable through the
legacy compatibility styles and appear in the Byline health recommendation so
an editor can convert them manually.

## Static-export contract

The Pages endpoint is a required build input. If it cannot be fetched, the
build fails rather than silently restoring source-owned page content. The
sitemap includes every published WordPress Page with that page's own modified
date, excluding only URLs already owned by application routes.
