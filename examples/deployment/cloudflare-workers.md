# Cloudflare Workers Builds

The public site uses [Cloudflare Static Assets](https://developers.cloudflare.com/workers/static-assets/). Wrangler deploys `apps/web/out/` with the configuration in `apps/web/wrangler.jsonc`.

Configure the Git-connected project in **Workers & Pages → byline → Settings → Build**:

| Setting | Value |
| --- | --- |
| Production branch | `main` |
| Root directory | `apps/web` |
| Build command | `npm run build:cloudflare` |
| Deploy command | `npm run deploy` |
| Preview command | `npm run deploy:preview` |
| Build variable | `SKIP_DEPENDENCY_INSTALL=1` |
| Build variable | `BYLINE_NEWSROOM_BUILD_URL=https://newsroom.example.edu/api/byline/build` |
| Build secret | `BYLINE_BUILD_TOKEN`, shared with the newsroom |
| Build cache | Enabled |

The scoped build installs just the Astro workspace and dependencies from the root lockfile. It preserves the restored Astro cache across the install. Configure previews with their own intended snapshot source. Keep fixture and offline snapshot overrides out of production.

Create a production deploy hook and set its HTTPS URL in the publication worker's private environment as `BYLINE_DEPLOY_HOOK_URL`. Once the worker promotes a current snapshot, it requests a build. Confirm `contentSource: "payload"` and the expected `publicationRevision` in the public `/_byline/manifest.json`.

For rollback, select the last known good deployment in Cloudflare. For acquisition or media failures, use [snapshot operations](../../docs/payload-build-snapshots.md) to repair the current revision and rebuild.
