# Payload newsroom deployment

The newsroom uses PostgreSQL, persistent media and publication volumes, and
the repository's `apps/newsroom/Dockerfile`.

## Staff entrance

Weekly Wildcat staff use `https://byline.weeklywildcat.com/`. Route that
hostname to the newsroom web service and set
`BYLINE_NEWSROOM_URL=https://byline.weeklywildcat.com` in its environment.
The root redirects to `/admin`, where Payload sends signed-out staff to the
Byline login and signed-in staff to Byline Home. If Google sign-in is enabled,
register the HTTPS origin and its `/api/byline/auth/google/callback` URL with
the Google OAuth client.

Verify the root redirects to the newsroom login and staff can reach Byline Home.

## Build context

Build from the repository root so npm workspaces are available:

```sh
docker build -f apps/newsroom/Dockerfile -t byline-newsroom:local .
```

The Dockerfile copies the root lockfile and every workspace `package.json`
before source code, then runs `npm ci`. Docker therefore reuses the dependency
layer when only application source changes. A package manifest or lockfile change
correctly invalidates that layer. The npm download cache is also mounted with
BuildKit so dependency-changing builds can reuse downloaded packages.

The repository `.dockerignore` excludes Git metadata, local dependencies,
compiled output, environment files and local newsroom media from the build
context.

## Production process model

Use the same image for:

- the Next/Payload web process;
- media jobs;
- publication snapshot jobs;
- scheduled publishing jobs;
- maintenance jobs;
- one-shot migrations; and
- the one-shot Next production build.

The web process and the build process share the same persistent `.next`
volume, but never mutate the same build tree. Production builds write to
`.next/releases/<release>`; `.next/active-release` names the build a newly
started web process should serve. The already-running process keeps serving its
previously resolved release while the next one compiles. The web and media
worker must also share the private Media and prepared publication-media volumes.

The `publication-worker` also owns public-site deploy-hook delivery. Set
`BYLINE_DEPLOY_HOOK_URL` to the provider's private production deploy-hook URL
(for Weekly Wildcat, the Cloudflare Workers Builds hook). A successful current
snapshot queues a coalescing `deploy-public-site` job; transient HTTP/network
failures retry in the publication queue. The URL must be HTTPS and must not be
committed to the repository.

On startup the publication worker reconciles the current snapshot and deployment
handoff. If the current snapshot artifact is missing it requeues snapshot
preparation. If the exact current snapshot has no pending or successfully
triggered deploy job, it requeues deployment. This makes worker restarts repair
a crash between snapshot promotion and provider delivery without creating a new
Cloudflare build when that snapshot was already accepted.

For an event-night recovery, inspect status and, only when the current snapshot
is ready, trigger the same validated deploy hook directly:

```sh
npm run publication:snapshot:status --workspace @byline/newsroom
npm run publication:deploy:now --workspace @byline/newsroom
```

`publication:deploy:now` never prints the hook URL. It refuses to deploy if the
current revision lacks a verified snapshot artifact, and it uses the same
revision/digest checks and request headers as the queued deploy task.

## Updating production

The canonical production update command is:

```sh
npm run deploy:newsroom
```

Run it from a clean `main` checkout on the production host. The command:

1. verifies that the checkout is on `main` with no local changes;
2. fast-forwards to `origin/main`, then restarts itself from the updated
   checkout;
3. validates that the production Compose project contains every required
   newsroom service;
4. builds the shared `byline-newsroom` image once through the `newsroom`
   service instead of asking Compose to export the same image for every service;
5. builds a versioned Next release while the currently running newsroom stays
   online, seeding Next's persistent Turbopack compiler cache from the previous
   release;
6. runs committed Payload migrations only after the application build has
   succeeded;
7. atomically activates the verified release; and
8. recreates the web process and workers from the newly built shared image,
   retaining the previous release as the immediate rollback target.

By default the script expects the production Compose project one directory above
the repository checkout. For example, a checkout at `/opt/byline/src` uses the
Compose project at `/opt/byline`. Other layouts can set:

```sh
BYLINE_DEPLOY_ROOT=/path/to/compose-project npm run deploy:newsroom
```

A failed image build, Next build, or migration never changes the active release
and does not stop the currently running newsroom. The cutover happens only after
the new build and migrations succeed. If the final Compose recreation fails,
the script restores the previous release pointer and previous newsroom image tag
before attempting to bring the services back.

### Manual / recovery procedure

If the wrapper cannot be used, run the equivalent steps manually from the
production Compose project:

```sh
cd /path/to/byline/repository
git pull --ff-only origin main

release="$(git -C /path/to/byline/repository rev-parse --short=12 HEAD)-$(date +%s)"

cd /path/to/compose-project
docker compose build newsroom
docker compose run --rm --no-deps newsroom-build \
  node scripts/newsroom-release.mjs build "$release"
docker compose run --rm migrate
previous="$(docker compose run --rm --no-deps newsroom-build \
  node scripts/newsroom-release.mjs current | tail -n 1)"
docker compose run --rm --no-deps newsroom-build \
  node scripts/newsroom-release.mjs activate "$release"
docker compose up -d --no-deps --force-recreate \
  newsroom \
  media-worker \
  publication-worker \
  scheduled-worker \
  maintenance-worker
docker compose run --rm --no-deps newsroom-build \
  node scripts/newsroom-release.mjs prune "$previous"
```

Build only `newsroom` because all of these services use the same
`byline-newsroom:local` image. Running a bare `docker compose build` can make
BuildKit export and unpack that same image separately for each service, which
adds substantial deployment time and disk I/O without producing distinct
artifacts.

`newsroom-build` uses the shared `.next` volume only as a release store.
Each deploy gets its own directory, so the active web process never observes a
partially replaced build. The build helper also carries the previous release's
`cache/` directory forward, which lets Next 16's
`turbopackFileSystemCacheForBuild` reuse production compiler work. Passing
`--no-deps` to this one-shot build avoids starting the migration dependency a
second time.

Production must keep `BYLINE_DB_PUSH=0` and run committed Payload migrations.
Do not expose PostgreSQL publicly. The newsroom may be published through a
reverse proxy or Cloudflare Tunnel while its host port remains bound to
loopback.

On a normal source-only update, the `npm ci` Docker layer should report
`CACHED`. A package manifest or lockfile change correctly invalidates that
layer.

This Dockerfile intentionally prepares the monorepo runtime rather than baking
the Next build into the image: the newsroom build needs the deployment
environment, while image construction should not require production secrets.
