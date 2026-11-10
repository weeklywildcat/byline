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

The web process and the build process must share the same `.next` volume when
the build is performed as a one-shot container. The web and media worker must
share the private Media and prepared publication-media volumes.

The `publication-worker` also owns public-site deploy-hook delivery. Set
`BYLINE_DEPLOY_HOOK_URL` to the provider's private production deploy-hook URL
(for Weekly Wildcat, the Cloudflare Workers Builds hook). A successful current
snapshot queues a coalescing `deploy-public-site` job; transient HTTP/network
failures retry in the publication queue. The URL must be HTTPS and must not be
committed to the repository.

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
5. runs committed Payload migrations;
6. stops the newsroom before replacing the shared `.next` build;
7. runs the one-shot production build; and
8. recreates the web process and workers from the newly built shared image.

By default the script expects the production Compose project one directory above
the repository checkout. For example, a checkout at `/opt/byline/src` uses the
Compose project at `/opt/byline`. Other layouts can set:

```sh
BYLINE_DEPLOY_ROOT=/path/to/compose-project npm run deploy:newsroom
```

The script intentionally leaves `newsroom` stopped if `newsroom-build`
fails. Do not restart it against an incomplete `.next` tree; correct the build
failure and rerun the deploy command.

### Manual / recovery procedure

If the wrapper cannot be used, run the equivalent steps manually from the
production Compose project:

```sh
cd /path/to/byline/repository
git pull --ff-only origin main

cd /path/to/compose-project
docker compose build newsroom
docker compose run --rm migrate
docker compose stop newsroom
docker compose run --rm newsroom-build
docker compose up -d --no-deps --force-recreate \
  newsroom \
  media-worker \
  publication-worker \
  scheduled-worker \
  maintenance-worker
```

Build only `newsroom` because all of these services use the same
`byline-newsroom:local` image. Running a bare `docker compose build` can make
BuildKit export and unpack that same image separately for each service, which
adds substantial deployment time and disk I/O without producing distinct
artifacts.

`newsroom-build` writes into the same shared `.next` volume used by the web
process, so stop `newsroom` before running it. This creates a brief
newsroom-only outage, but it prevents the live server from reading files while
the build replaces them. Deployments that require zero downtime should build
into a second versioned `.next` volume and switch the web service to it only
after a successful build.

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
