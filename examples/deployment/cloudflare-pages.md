# Cloudflare Pages

This recipe deploys the Byline static export with the Cloudflare Pages Git
integration. It assumes the repository is connected to a Pages project and that
the public site is served from the project domain or a configured custom domain.

Official references: [Pages build configuration](https://developers.cloudflare.com/pages/configuration/build-configuration/),
[Pages build image](https://developers.cloudflare.com/pages/configuration/build-image/),
and [Pages Deploy Hooks](https://developers.cloudflare.com/pages/configuration/deploy-hooks/).

## Pages build settings

In **Workers & Pages**, open the Pages project and set:

| Setting | Value |
| --- | --- |
| Production branch | The branch that represents the live publication, for example `main` |
| Root directory | Repository root |
| Build command | `npm run build:frontend` |
| Build output directory | `apps/web/out` |
| Node.js version | `24` |

Set `NODE_VERSION=24` in **Settings → Environment variables** if the project
does not otherwise pin Node 24. The repository's root `package.json` requires
Node 24 or newer.

Set these build variables in the Pages environment. They are public endpoint
identifiers, not secrets:

```env
NEXT_PUBLIC_WP_API_URL=https://cms.example.edu/wp-json/wp/v2
NEXT_PUBLIC_SITE_URL=https://news.example.edu
BYLINE_PUBLICATION_URL=https://cms.example.edu/wp-json/byline/v1/publication
```

Cloudflare Pages supplies `CF_PAGES_COMMIT_SHA`, which the build wrapper can use
for its WordPress fetch cache key. If repeated deploy-hook builds of the same
commit still receive cached CMS responses, set `WORDPRESS_FETCH_CACHE_KEY` to a
unique value in the Pages build command.

Deploy once from the connected branch before creating the hook. Confirm that
the public domain serves `/_byline/manifest.json`.

## Create the Pages hook

In the Pages project, open **Settings → Builds → Add deploy hook**. Name it
something generic such as `byline-production`, select the production branch,
and copy the generated URL. Do not put the URL in this repository. Save it in
WordPress as described in the [shared hook setup](README.md#shared-contract).

Pages Deploy Hooks accept an HTTP POST and do not need a request body. Byline's
revision/idempotency headers are useful for logging but Pages only needs the
hook request to arrive.

## Polls and the included Worker

Pages-only hosting is complete for a publication that does not enable polls.
The static export cannot execute `/api/polls/active` or `/api/polls/vote` by
itself.

If polls are enabled, deploy the included Cloudflare Worker as the public
same-origin host. Its configuration is `apps/web/wrangler.jsonc`; it serves the
static `out/` directory and proxies only the two poll routes to WordPress. From
the repository root, a separate Worker deployment can be run after the build:

```sh
npm run build:frontend
cd apps/web
npx wrangler deploy --config wrangler.jsonc
```

The Worker reads `urls.cms` from `/_byline/publication.json`, so no Worker CMS
variable is required when that publication value is correct. To override the
origin, store it as a Worker secret:

```sh
npx wrangler secret put BYLINE_CMS_URL
```

If the CMS is protected, use Wrangler's secret store for
`BYLINE_CMS_ACCESS_CLIENT_ID` plus `BYLINE_CMS_ACCESS_CLIENT_SECRET`, or for
`BYLINE_CMS_AUTH_HEADER` plus `BYLINE_CMS_AUTH_VALUE`. A matching
`BYLINE_POLL_PROXY_SECRET` can restrict WordPress poll routes to the Worker;
configure the same value in WordPress as a server-side constant or environment
variable. Never put any of these values in the static build or a public Pages
variable.

A Pages Deploy Hook does not automatically run `wrangler deploy`. If the Worker
is part of the production path, point the WordPress hook at the private pipeline
that builds and deploys the Worker, or otherwise arrange for both the static
assets and Worker to be updated together. Verify the final public manifest and a
same-origin poll request after every cutover.
