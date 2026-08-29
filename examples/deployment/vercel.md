# Vercel

This recipe uses a Vercel project connected to the Byline repository. It keeps
Vercel in static-file mode: the build produces `apps/web/out`, and Vercel
serves those files rather than running a Next.js server.

Official references: [Vercel project configuration](https://vercel.com/docs/project-configuration),
[Vercel output directory configuration](https://vercel.com/docs/project-configuration/project-settings#output-directory),
and [Vercel Deploy Hooks](https://vercel.com/docs/deploy-hooks).

## Project build settings

Set the Vercel project **Root Directory** to the repository root and configure:

| Setting | Value |
| --- | --- |
| Framework preset | Other, or a detected preset that preserves the explicit output directory |
| Install command | `npm ci` |
| Build command | `npm run build:frontend` |
| Output directory | `apps/web/out` |
| Node.js version | `24.x` |

The maintained copyable configuration is [`vercel.json`](vercel.json). Copy it
to the repository root if you want the build command and output directory
versioned with the project. Set Node 24 in the Vercel project settings; do not
put credentials in `vercel.json`.

Set these variables for the production environment:

```env
NEXT_PUBLIC_WP_API_URL=https://cms.example.edu/wp-json/wp/v2
NEXT_PUBLIC_SITE_URL=https://news.example.edu
BYLINE_PUBLICATION_URL=https://cms.example.edu/wp-json/byline/v1/publication
```

Vercel supplies `VERCEL_GIT_COMMIT_SHA`, which the wrapper can use as its
WordPress fetch cache key. If a CMS-triggered rebuild reuses a cached response,
set `WORDPRESS_FETCH_CACHE_KEY` to a unique deployment ID in the build command.

## Create the Vercel hook

Deploy the production branch once so the project has a valid connected Git
deployment. Then open **Project Settings → Git → Deploy Hooks**, create a hook
for the production branch, and copy its unique URL.

Save that URL under **Byline → Integrations → Deployment** as the private
**Generic Deploy Hook** URL. Vercel Deploy Hooks accept GET or POST; Byline uses
POST. The generated URL itself is the credential, so revoke and replace it if
exposed.

## Polls

Vercel can serve the static artifact, but this repository does not include a
Vercel Function or Edge Function for `/api/polls/*`. If polls are enabled, add
an independently reviewed same-origin runtime that implements the two fixed
routes and forwards them to WordPress. Keep any CMS authorization or
`BYLINE_POLL_PROXY_SECRET` in the runtime's private environment, never in the
static build. Without that runtime, disable polls for this deployment.
