# Get Byline running

## Start the newsroom

From the repository root, with Node.js 24.22.1 or newer and Docker Compose:

```sh
npm ci
docker compose -f apps/newsroom/docker-compose.yml up -d
cp apps/newsroom/.env.example apps/newsroom/.env
openssl rand -base64 48
```

Set `PAYLOAD_SECRET` in `apps/newsroom/.env` to the generated value, then run `npm run dev:newsroom`. Open [the local newsroom](http://localhost:3010/admin) and create the first administrator. The development database uses schema push. Use committed migrations in production.

For production, follow the [newsroom deployment guide](newsroom-deployment.md) and start the media, publication, and scheduled workers alongside the newsroom.

## Preview the public site

Run `npm run dev` for the fixture site. To verify a complete static export without connecting to the newsroom:

```sh
BYLINE_CONTENT_MODE=weekly-wildcat-fixture npm run build:frontend
npm run verify:contracts
```

## Publish from Payload

1. Configure the public hostname, identity, and navigation in the newsroom's Publication settings.
2. Set a strong `BYLINE_BUILD_TOKEN` in the newsroom and the public build environment. In the build environment, set `BYLINE_NEWSROOM_BUILD_URL` to the newsroom's `/api/byline/build` endpoint. Leave fixture mode unset.
3. Run `npm run build:frontend` and publish `apps/web/out/`. For the production hosting configuration, follow the [Cloudflare recipe](../examples/deployment/cloudflare-workers.md).
4. Set the provider's private HTTPS deploy hook as `BYLINE_DEPLOY_HOOK_URL` on the publication worker. Keep that URL and the build token in their respective secret stores.
5. Publish an editorial change and verify that the public `/_byline/manifest.json` reports `contentSource: "payload"` and a `publicationRevision` at least as recent as the completed newsroom snapshot.

Use `npm run publication:snapshot:status --workspace @byline/newsroom` to inspect the current revision and pending jobs. A provider accepting the hook confirms a build was requested; the public manifest confirms what actually deployed. See [snapshot operations](payload-build-snapshots.md) for recovery.
