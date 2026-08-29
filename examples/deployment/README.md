# Byline deployment recipes

These recipes are maintained against the repository's current build contract.
They cover the static public site and the WordPress Generic Deploy Hook. Start
with [the canonical getting-started guide](../../docs/getting-started.md) for
the full installation and revision-verification flow.

## Shared contract

Run every build from the repository root—the directory containing the root
`package.json` and `package-lock.json`:

```sh
npm ci
npm run build:frontend
```

Publish exactly:

```text
apps/web/out/
```

The build requires Node.js 24 or newer and these public build variables:

```env
NEXT_PUBLIC_WP_API_URL=https://cms.example.edu/wp-json/wp/v2
NEXT_PUBLIC_SITE_URL=https://news.example.edu
BYLINE_PUBLICATION_URL=https://cms.example.edu/wp-json/byline/v1/publication
```

`BYLINE_PUBLICATION_URL` can be omitted when the wrapper can derive it from
`NEXT_PUBLIC_WP_API_URL`. The CMS must expose the public WordPress and Byline
REST contracts to the build runner. Do not put authorization credentials in
these variables.

The wrapper automatically uses provider commit metadata as a WordPress fetch
cache key when the host supplies it (`VERCEL_GIT_COMMIT_SHA`,
`CF_PAGES_COMMIT_SHA`, or `NETLIFY_COMMIT_REF`). If a provider reuses that value
for multiple CMS-triggered builds and its cache serves old API responses, set
`WORDPRESS_FETCH_CACHE_KEY` to a unique per-build ID in that provider's build
command.

All four providers use the same WordPress hook setup:

1. Create one production hook for the branch that publishes the public site.
2. Copy the provider's unique HTTPS hook URL.
3. In WordPress, open **Byline → Integrations → Deployment**.
4. Leave **Generic Deploy Hook** selected, paste the URL into **Private
   deploy-hook URL**, and choose **Save deployment**.
5. Use **Trigger now** for the first request, then verify
   `<public-url>/_byline/manifest.json` against
   `byline_deployment_expected_revision`.

The hook URL is a credential-like value. It belongs only in protected WordPress
options or a private relay. No recipe contains a real hook, API token, or CMS
credential.

## Choose a recipe

- [Cloudflare Pages](cloudflare-pages.md) — static Pages deployment, with the
  included Cloudflare Worker caveat for polls.
- [Netlify](netlify.md) — monorepo build settings and Netlify build hook.
- [Vercel](vercel.md) — static output settings and Vercel Deploy Hook.
- [GitHub Actions and GitHub Pages](github-actions.md) — copy the workflow
  example and use a private relay for the WordPress-to-GitHub event.

The static export does not provide a runtime API. Polls use the relative
`/api/polls/*` contract. The repository includes a Cloudflare Worker for that
same-origin proxy; Netlify, Vercel, and GitHub Pages require an equivalent
same-origin runtime if the publication enables polls. See
[`docs/polls.md`](../../docs/polls.md).

## Maintenance rule

When the root scripts, `apps/web/next.config.ts`, `apps/web/.env.example`, or
the provider hook contract changes, update this index and the affected recipe in
the same change. Keep placeholders generic and invalid for real credentials.
