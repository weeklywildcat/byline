# Netlify

This recipe uses a Netlify site connected to the Byline repository. It assumes
the repository root is the Netlify base directory and that the public site is
served at the domain recorded in the Byline publication.

Official references: [Netlify build configuration](https://docs.netlify.com/build/configure-builds/overview/),
[Netlify environment variables](https://docs.netlify.com/build/configure-builds/environment-variables/),
and [Netlify Build Hooks](https://docs.netlify.com/build/configure-builds/build-hooks/).

## Site build settings

Set these values in **Project configuration → Build & deploy → Continuous
deployment → Build settings**:

| Setting | Value |
| --- | --- |
| Base directory | Repository root |
| Build command | `npm run build:frontend` |
| Publish directory | `apps/web/out` |
| Node.js version | `24` |

The maintained copyable configuration is
[`netlify.toml`](netlify.toml). Copy it to the repository root if you want the
build settings versioned with the project. Do not add publication-specific URLs
or hook URLs to that file.

Set these variables with **Project configuration → Environment variables** and
include the **Builds** scope:

```env
NEXT_PUBLIC_WP_API_URL=https://cms.example.edu/wp-json/wp/v2
NEXT_PUBLIC_SITE_URL=https://news.example.edu
BYLINE_PUBLICATION_URL=https://cms.example.edu/wp-json/byline/v1/publication
```

Netlify supplies `NETLIFY_COMMIT_REF`, which the wrapper can use as its
WordPress fetch cache key. If the same commit is rebuilt after CMS content
changes and the Netlify cache serves old CMS responses, set
`WORDPRESS_FETCH_CACHE_KEY` from a unique per-build value such as `DEPLOY_ID` in
the build command.

## Create the Netlify hook

Deploy the production branch once, then open **Project configuration → Build &
deploy → Continuous deployment → Build hooks** and choose **Add build hook**.
Name the hook, select the production branch, save, and copy the unique URL.
Netlify requires builds to be active for build hooks to work.

Save the URL in WordPress under **Byline → Integrations → Deployment** as the
private **Generic Deploy Hook** URL. Byline sends a POST; Netlify accepts the
request and starts a new build for the selected branch.

## Polls

Netlify can publish the static export, but this repository does not include a
Netlify Function or Edge Function for the poll proxy. If polls are enabled, the
public host still needs a same-origin implementation of:

```text
GET  /api/polls/active
POST /api/polls/vote
```

Use an independently reviewed Netlify runtime or another same-origin proxy that
forwards only to the WordPress Byline poll routes. Do not point the browser at
the CMS directly or copy the Cloudflare Worker credentials into a public build.
If no same-origin poll runtime is deployed, leave the polls feature disabled.
