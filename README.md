# Byline Frontend

Static Next.js publication frontend for the open-source Byline platform.
Publication identity, theme tokens, navigation, feature availability, SEO, and
published design revisions come from the versioned WordPress `/byline/v1` API.
Weekly Wildcat defaults preserve existing deployments while other publications
can supply their own configuration.

## Local Development

Copy `.env.example` to `.env.local` and set the CMS and public site URL:

```txt
NEXT_PUBLIC_WP_API_URL=https://cms.example.edu/wp-json/wp/v2
NEXT_PUBLIC_SITE_URL=https://news.example.edu
```

The build derives `/byline/v1/publication` from the CMS URL, then loads the
public publication contract and published Studio designs before Next.js runs.
`BYLINE_PUBLICATION_URL`, `BYLINE_PUBLICATION_FILE`, and
`BYLINE_PUBLICATION_JSON` are explicit overrides for hosted, fixture, or CI
builds. Sections, navigation, branding, SEO, modules, and theme selection are
all publication data; the Weekly Wildcat fixture is only the rolling-upgrade
fallback.

Run the site locally:

```sh
npm run dev
```

Build the static export:

```sh
npm run build
```

The exported site is written to `out/`.

For the isolated second-publication acceptance build (identity, content, design, disabled modules, and theme), run:

```sh
npm run test:second-publication
```

That command builds North Star News from local fixtures and scans every public HTML/JSON/XML artifact for Weekly Wildcat identity leakage, forced sports/Discord/polls, Adobe Typekit, and the legacy newsletter integration.

The export includes `_byline/publication.json`, `_byline/designs.json`, and a
small compatibility manifest. It contains no Next.js server route handlers;
interactive modules call separately deployed public APIs.

First-party shared contracts and themes live under `packages/`. Trusted theme
and block authors should follow [the Level 3 extension contract](docs/extensions.md)
so Studio and production use the same namespaced renderer package.
