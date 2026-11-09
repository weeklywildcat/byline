# Deploy Byline

Start with the [newsroom deployment guide](../../docs/newsroom-deployment.md).
The public Weekly Wildcat site uses [Cloudflare Workers Builds](cloudflare-workers.md) to publish Astro's static export. Other static hosts can serve the same `apps/web/out/` directory if they support the export's redirects, headers, and trailing slash routes.

See [snapshot operations](../../docs/payload-build-snapshots.md) for build credentials, revision checks, and recovery.
