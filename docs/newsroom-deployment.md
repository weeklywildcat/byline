# Payload newsroom deployment

The Payload newsroom is deployed as a separate service from the legacy WordPress
CMS. Production should use PostgreSQL, persistent media/publication volumes and
the repository's cache-friendly `apps/newsroom/Dockerfile`.

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

Typical commands are:

```sh
docker compose build
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

`newsroom-build` writes into the same shared `.next` volume used by the web
process, so stop `newsroom` before running it. This creates a brief
newsroom-only outage, but it prevents the live server from reading files while
the build replaces them. If the build fails, leave `newsroom` stopped, correct
the failure and rerun `newsroom-build`; do not restart the web process against
an incomplete `.next` tree. Deployments that require zero downtime should
build into a second versioned `.next` volume and switch the web service to it
only after a successful build.

Production must keep `BYLINE_DB_PUSH=0` and run committed Payload migrations.
Do not expose PostgreSQL publicly. The newsroom may be published through a
reverse proxy or Cloudflare Tunnel while its host port remains bound to
loopback.

## Updating an existing checkout

```sh
git pull --ff-only origin main
docker compose build
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

On a normal source-only update, the `npm ci` Docker layer should report
`CACHED`. The first build after adopting this Dockerfile is expected to populate
the new cache once.

This Dockerfile intentionally prepares the monorepo runtime rather than baking
the Next build into the image: the newsroom build needs the deployment
environment, while image construction should not require production secrets.
