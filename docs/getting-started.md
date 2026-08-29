# Get Byline from zero to healthy

This is the canonical installation and first-deployment guide for Byline.
Byline has two cooperating parts:

- WordPress is the private control plane. It owns stories, publication
  settings, designs, jobs, and the deployment revision the public site owes.
- `apps/web/` is a static Next.js export. A provider publishes the contents of
  `apps/web/out/`; it does not run a Next.js server.

Start with the WordPress setup, build the public site from that CMS, connect a
provider deploy hook, and finish by proving that the public manifest contains
the revision WordPress expects.

Provider-specific settings are kept in [the deployment recipes](../examples/deployment/README.md).

## Before you start

You need:

- WordPress 6.6 or newer and PHP 7.4 or newer. These are the plugin's current
  minimums; use the compatibility metadata shipped with the release you install.
- HTTPS for the CMS URL, public URL, and deploy-hook URL.
- WordPress pretty permalinks enabled so `/wp-json/...` routes resolve normally.
- Node.js 24 or newer and npm for a source checkout build. PHP 8.3 is the
  recommended runtime for the repository's complete local validation matrix.
- A production branch in the repository that the hosting provider can build.

Use these terms consistently:

| Term | Meaning | Example |
| --- | --- | --- |
| CMS URL | The WordPress site origin | `https://cms.example.edu` |
| Public URL | The site readers visit | `https://news.example.edu` |
| WordPress API URL | The standard WordPress content API | `https://cms.example.edu/wp-json/wp/v2` |
| Publication endpoint | The public Byline publication contract | `https://cms.example.edu/wp-json/byline/v1/publication` |

The CMS URL is an origin. Do not enter `/wp-json` into the `urls.cms` publication
field. The build variables that end in `/wp/v2` or `/byline/v1/publication` are
the API URLs used by the frontend build.

## 1. Install the WordPress plugin

For a production install, download the release asset named
`weekly-wildcat-headless.zip`. In WordPress, open **Plugins → Add Plugin → Upload
Plugin**, upload the ZIP, and activate **Byline**.

The compatibility-sensitive names must remain unchanged:

- installed folder: `weekly-wildcat-headless/`
- main file: `weekly-wildcat-headless.php`
- updater slug: `weekly-wildcat-headless`
- release asset: `weekly-wildcat-headless.zip`

If you are packaging the plugin from this repository instead, run these commands
from the repository root:

```sh
npm ci
npm run typecheck:plugin
npm run test:plugin
npm run build:plugin
npm run test:php
npm run package:plugin
```

Upload the resulting `wordpress-plugin/release/weekly-wildcat-headless.zip`.
Do not upload the repository root or the `apps/web/` directory as a WordPress
plugin.

## 2. Configure the publication in WordPress

Open **Byline → Publication**. The canonical admin URL is:

```text
/wp-admin/admin.php?page=byline-publication
```

Complete at least these fields:

- **Identity:** publication name, short name, and description.
- **URLs:** public site URL and CMS URL.
- **Appearance:** one of the installed Byline theme IDs:
  `byline-editorial`, `byline-magazine`, `byline-modern`, or
  `weekly-wildcat`.

For a new publication, a typical configuration is:

```text
Public URL: https://news.example.edu
CMS URL:    https://cms.example.edu
```

Save the publication after replacing the defaults. Saving increments the
monotonic public revision and records that revision as a deployment obligation.
That obligation is retained even when no deploy hook has been configured yet.

Check the public publication contract from a machine that can reach the CMS:

```sh
curl -fsS https://cms.example.edu/wp-json/byline/v1/publication \
  | jq '{schemaVersion, revision, urls, appearance: {theme}}'
```

The response is intentionally public build data. It may contain publication
identity, URLs, theme, branding, navigation, and feature flags. It must not
contain hook URLs, credentials, or secrets.

## 3. Configure the static build

The direct build needs these public values. Set them in the provider's **build
environment** or in `apps/web/.env.local` for local work:

```env
NEXT_PUBLIC_WP_API_URL=https://cms.example.edu/wp-json/wp/v2
NEXT_PUBLIC_SITE_URL=https://news.example.edu
```

Set the explicit Byline endpoint as well when configuring a provider. It is
optional only because the build wrapper can derive it from
`NEXT_PUBLIC_WP_API_URL`:

```env
BYLINE_PUBLICATION_URL=https://cms.example.edu/wp-json/byline/v1/publication
```

These values are not secrets. The CMS and public origins are part of the
publication contract and may be present in the static artifact. The CMS must
allow the build runner to read the public WordPress and Byline endpoints; the
static frontend has no frontend login flow for fetching private CMS content.

Optional build settings are only needed for a specific deployment:

| Variable | Use |
| --- | --- |
| `WORDPRESS_FETCH_CACHE_KEY` | A unique build identifier when the host needs an explicit cache-busting value. Provider commit variables are used automatically when available. |
| `BYLINE_WORDPRESS_FETCH_CONCURRENCY` | Limits parallel WordPress reads; the default is `4`. |
| `WORDPRESS_MEDIA_MIRROR` | Set to `0` only when the deployment must not mirror WordPress media into the static output. |
| `NEXT_PUBLIC_SEARCH_GAP_ENDPOINT` | Optional endpoint for the search-gap integration. |

Do not hand-set `BYLINE_PUBLICATION_REVISION` or `BYLINE_DESIGN_REVISIONS` for
ordinary production builds. The publication and published design endpoints
provide those values; those variables exist for fixtures and controlled
replays.

Likewise, do not set `BYLINE_PUBLICATION_FILE`, `BYLINE_PUBLICATION_JSON`,
`BYLINE_DESIGNS_FILE`, or `BYLINE_DESIGNS_JSON` in a live CMS build. Those are
fixture/override inputs for tests and local replays and can hide a CMS access
problem or publish stale configuration.

Run the build from the repository root:

```sh
npm ci
npm run build:frontend
```

The equivalent workspace command is:

```sh
npm run build --workspace @byline/web
```

The build fetches the publication and published designs before running Next.js.
The postbuild checks then write and verify these files:

```text
apps/web/out/_byline/publication.json
apps/web/out/_byline/designs.json
apps/web/out/_byline/manifest.json
```

For a publication other than Weekly Wildcat, stop if the build log says that the
publication endpoint is unavailable or that compatibility defaults are being
used. Fix the CMS URL or build access before publishing; a fallback build can
complete while carrying the wrong publication identity.

Publish the entire `apps/web/out/` directory. The output is static, uses
trailing-slash routes, and is configured with `output: "export"` and
unoptimized images. Do not add SSR, server actions, frontend authentication, a
runtime Next server, or an image optimizer to a deployment.

Before releasing a source change, the repository's normal checks are:

```sh
npm run typecheck:frontend
npm run test:frontend
npm run build:frontend
```

Use `npm run typecheck`, `npm test`, and `npm run build` when validating the
whole monorepo.

## 4. Deploy the output

Choose a provider recipe and use the same production branch for the provider
build and the WordPress deploy hook:

- [Cloudflare Pages](../examples/deployment/cloudflare-pages.md)
- [Netlify](../examples/deployment/netlify.md)
- [Vercel](../examples/deployment/vercel.md)
- [GitHub Actions and GitHub Pages](../examples/deployment/github-actions.md)

Every recipe publishes `apps/web/out/`. A provider's default output such as
`.next/`, `dist/`, or the repository root is not the Byline artifact.

## 5. Connect the deployment hook

Create one production deploy hook in the provider dashboard. The provider
recipes name the exact location. Copy the unique HTTPS URL, then open:

```text
/wp-admin/admin.php?page=byline-integrations&tab=deployment
```

In **Byline → Integrations → Deployment**:

1. Confirm the provider is **Generic Deploy Hook**.
2. Paste the URL into **Private deploy-hook URL**.
3. Select **Save deployment**.
4. After the status is saved as **Configured (hidden)**, use **Trigger now** to
   queue the first provider build request.

Byline validates that the URL is HTTPS and stores it only in protected
WordPress options. Treat the URL like a password: do not commit it, put it in a
public build variable, paste it into a public issue, or include it in support
logs. If it is exposed, revoke it at the provider and save the replacement in
WordPress.

Byline sends a `POST` after content or design changes, normally after a short
coalescing window. The request may include these headers:

```text
X-Byline-Expected-Revision
X-Byline-Reason
X-Byline-Idempotency
```

The provider only needs to accept the POST. A successful hook response means
that a build was requested; it does not prove that the new artifact is live.

If a new revision was created before the hook was configured, its lifecycle is
`needs_configuration`. Save the hook, then use **Trigger now** or:

```sh
wp byline deployment retry
```

The retry uses the durable deployment job. It does not bypass job history or
send an untracked request.

## 6. Run Byline Doctor and background work

Open **Byline → Settings → Diagnostics**:

```text
/wp-admin/admin.php?page=byline-settings&tab=diagnostics
```

This screen is **Byline Doctor**. Run **Test again** or **Run setup checks**.
The command palette also exposes **Run Byline health check**. Doctor checks
publication identity and URLs, theme, branding, migrations, capabilities,
rewrite rules, REST routes, runtime assets/tables, jobs, cron, and the public
manifest.

If WordPress traffic-driven cron is disabled or delayed, use **Run due work** in
Doctor or run the authenticated WP-CLI worker:

```sh
wp byline jobs run
wp byline jobs status
wp byline deployment status
```

Deployment jobs use these operational statuses:

```text
queued
running
retry_waiting
succeeded
failed
cancelled
```

The deployment lifecycle shown by diagnostics is:

```text
needs_configuration
queued
building
live
failed
unknown
```

For a new installation, the useful success state is **Everything looks good** in
Doctor and `live` for deployment. Optional recommendations, such as adding a
logo, may remain without preventing the static site from working; critical
checks must be resolved.

## 7. Verify the exact public revision

Run the `wp ...` commands from the WordPress installation context (on the CMS
host, through a configured WP-CLI alias, or with the appropriate `--path`). Run
the `curl`/`jq` requests from any machine that can reach the two sites. Replace
only the two example origins with your own origins:

```sh
CMS_URL="https://cms.example.edu"
PUBLIC_URL="https://news.example.edu"

wp option get byline_publication_revision
wp option get byline_deployment_expected_revision
wp byline deployment status

curl -fsS "$CMS_URL/wp-json/byline/v1/publication" \
  | jq '{revision, urls}'

curl -fsS "$PUBLIC_URL/_byline/manifest.json" \
  | jq '{protocolVersion, publicationSchemaVersion, frontendVersion, publicationRevision, designRevisions}'
```

The exact proof for a current install is:

```sh
EXPECTED="$(wp option get byline_deployment_expected_revision)"
PUBLIC="$(curl -fsS "$PUBLIC_URL/_byline/manifest.json" | jq -er '.publicationRevision')"

test "$EXPECTED" -gt 0
test "$PUBLIC" -ge "$EXPECTED"
```

Also confirm that the manifest is valid JSON, has `protocolVersion: 1` and
`publicationSchemaVersion: 1`, and is served from the configured public origin.
The key comparison is:

```text
manifest.publicationRevision >= deployment.expectedRevision
```

`wp byline deployment status` exposes safe operational evidence including
`expectedRevision`, `publicRevision`, `jobStatus`, `lastStatus`, and `lifecycle`.
It deliberately omits the hook URL. A reachable but stale manifest is not
`live`, and a successful provider hook response is not revision proof.

If the expected revision is still `0` on a newly configured site, save the
publication once or publish a test story, allow the job to run, and repeat the
check. Do not treat a merely reachable old manifest as proof for a new
revision.

## 8. Keep private values private

The following values must stay in their server-side or provider secret stores:

- the WordPress deployment-hook URL, in **Byline → Integrations → Deployment**;
- `BYLINE_POLL_COOKIE_SECRET`, if explicitly pinned in `wp-config.php` for poll
  continuity (otherwise Byline maintains a generated per-site secret);
- `BYLINE_POLL_PROXY_SECRET` and any CMS access headers used by the included
  Cloudflare Worker;
- Discord, OAuth, bridge, provider API, and relay credentials;
- any authorization header or token used to reach a protected CMS.

Never place these in `NEXT_PUBLIC_*` variables, `publication.json`,
`manifest.json`, workflow logs, source examples, or client-side code. The
frontend has no secret CMS credential by design. See [the poll contract](polls.md)
for the complete Worker and poll-secret rules.

The public build variables are different: `NEXT_PUBLIC_WP_API_URL`,
`NEXT_PUBLIC_SITE_URL`, and `BYLINE_PUBLICATION_URL` identify public endpoints,
but they still should use the provider's environment configuration when they
vary by publication.

## 9. Troubleshoot by lifecycle state

| State | Meaning | Next action |
| --- | --- | --- |
| `needs_configuration` | WordPress recorded a revision, but no deploy target is saved. | Save an HTTPS hook in Deployment, then retry. |
| `queued` | A durable deployment job is waiting or retrying. | Check `wp byline jobs status`; run due work if cron is late. |
| `building` | The provider build was requested and the job is active. | Inspect the provider build log, then recheck the manifest. |
| `live` | The public manifest is reachable and proves the expected revision. | No deployment repair is needed. |
| `failed` | The durable job or provider request failed. | Check the provider log, then use **Trigger now** or `wp byline deployment retry`. |
| `unknown` | There is not enough evidence that the expected public revision is live. | Fetch `/_byline/manifest.json` directly and compare revisions. |

Common setup mistakes are publishing the wrong directory, setting the CMS URL
to the WordPress origin without the required build API path, pointing the build
at a private endpoint that the provider cannot read, or expecting a static host
to run poll API requests. The [provider recipes](../examples/deployment/README.md)
call out the last case for each host.
