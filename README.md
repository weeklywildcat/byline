# Byline

Byline powers [The Weekly Wildcat](https://weeklywildcat.com), the student newspaper of Ninety Six High School. Staff report, edit, and publish in the private [Byline newsroom](https://byline.weeklywildcat.com/). Readers get a static site built from published content.

- [`apps/newsroom`](apps/newsroom) is the private newsroom, built with Payload, Next.js, and PostgreSQL. It owns stories, planning, media, and publishing.
- [`apps/web`](apps/web) is the public Astro site. It reads a validated publication snapshot, materializes prepared media, and writes the site to `apps/web/out/`.
- [`packages`](packages) contains shared content contracts, editor and UI components, the Weekly Wildcat theme, and story presentations.

## Develop locally

Use Node.js 24.22.1 or newer and run `npm ci` from the repository root.

```sh
npm run dev                             # Public site with local fixtures
docker compose -f apps/newsroom/docker-compose.yml up -d
cp apps/newsroom/.env.example apps/newsroom/.env
# Set PAYLOAD_SECRET in apps/newsroom/.env before starting the newsroom.
npm run dev:newsroom                    # http://localhost:3010/admin
```

```sh
npm run typecheck
npm test
BYLINE_CONTENT_MODE=weekly-wildcat-fixture npm run build
npm run verify:contracts
```

## Publish

Production builds use `BYLINE_NEWSROOM_BUILD_URL` and a build-only `BYLINE_BUILD_TOKEN`. Payload prepares immutable public snapshots; Astro renders locally from the verified snapshot and exports HTML, media, live feeds, redirects, and sitemaps. Deploy the entire `apps/web/out/` directory.

See [getting started](docs/getting-started.md), [architecture](docs/architecture.md), [newsroom deployment](docs/newsroom-deployment.md), [snapshot operations](docs/payload-build-snapshots.md), and the [Cloudflare deployment recipe](examples/deployment/cloudflare-workers.md).

The former WordPress plugin and its release tooling are retired. Previous releases remain available in repository history.
