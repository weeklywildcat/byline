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

Typical commands are:

```sh
docker compose build
docker compose run --rm migrate
docker compose run --rm newsroom-build
docker compose up -d --no-deps --force-recreate \
  newsroom \
  media-worker \
  publication-worker \
  scheduled-worker \
  maintenance-worker
```

Production must keep `BYLINE_DB_PUSH=0` and run committed Payload migrations.
Do not expose PostgreSQL publicly. The newsroom may be published through a
reverse proxy or Cloudflare Tunnel while its host port remains bound to
loopback.

## Updating an existing checkout

```sh
git pull --ff-only origin main
docker compose build
docker compose run --rm migrate
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
