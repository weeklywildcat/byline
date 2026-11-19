# Payload newsroom deployment

The newsroom uses PostgreSQL, persistent media and publication volumes, and a prebuilt production image published by GitHub Actions.

## Staff entrance

Weekly Wildcat staff use `https://byline.weeklywildcat.com/`. Route that hostname to the newsroom web service and set `BYLINE_NEWSROOM_URL=https://byline.weeklywildcat.com` in its environment. The root redirects to `/admin`, where Payload sends signed-out staff to the Byline login and signed-in staff to Byline Home.

If Google sign-in is enabled, register the HTTPS origin and its `/api/byline/auth/google/callback` URL with the Google OAuth client.

Verify the root redirects to the newsroom login and staff can reach Byline Home after every production change.

## Immutable production image

Every successful push to `main` builds the production newsroom once in GitHub Actions and publishes the resulting image to GitHub Container Registry:

```text
ghcr.io/weeklywildcat/byline-newsroom:<full-git-sha>
ghcr.io/weeklywildcat/byline-newsroom:main
```

Deployments always pull the full commit SHA. The `main` tag is only a convenient pointer for humans.

The image is built from `apps/newsroom/Dockerfile`. It installs the monorepo dependencies, compiles the Next/Payload production server against CI's throwaway PostgreSQL service, and stores the finished build in:

```text
/app/apps/newsroom/.byline-prebuilt-next
```

`BYLINE_NEXT_DIST_DIR=.byline-prebuilt-next` makes the web process serve that build. The directory intentionally does not live under `.next`, because existing production installations may still mount the old persistent `.next` release volume. That legacy volume can remain mounted during migration without hiding the build baked into the image.

The build database URL and Payload secret used by CI are synthetic build-time values and are passed through BuildKit secret mounts, not Docker build arguments. Production database credentials and production secrets are not baked into the image or recorded in image metadata.

The image carries `org.opencontainers.image.revision=<full-git-sha>`. Both CI and the production deploy script verify the revision and the Next `BUILD_ID` before using the image.

### Building the image locally

A production image build needs a reachable PostgreSQL database because Payload participates in the Next build. With the development PostgreSQL service running on port 54329:

```sh
export BYLINE_IMAGE_BUILD_DATABASE_URL=postgres://byline:byline@127.0.0.1:54329/byline_newsroom
export BYLINE_IMAGE_BUILD_PAYLOAD_SECRET=local-image-build-secret-0123456789abcdef

docker build --network host \
  -f apps/newsroom/Dockerfile \
  --secret id=byline_build_database_url,env=BYLINE_IMAGE_BUILD_DATABASE_URL \
  --secret id=byline_build_payload_secret,env=BYLINE_IMAGE_BUILD_PAYLOAD_SECRET \
  --build-arg BYLINE_BUILD_SHA=local \
  -t byline-newsroom:local .

unset BYLINE_IMAGE_BUILD_DATABASE_URL BYLINE_IMAGE_BUILD_PAYLOAD_SECRET
```

This is for local verification only. Normal production deploys pull the image produced by CI and do not build on the production host.

## Production process model

Use the same image for:

- the Next/Payload web process;
- media jobs;
- publication snapshot jobs;
- scheduled publishing jobs;
- maintenance jobs; and
- one-shot migrations.

The web and media worker must share the private Media and prepared publication-media volumes.

The `publication-worker` also owns public-site deploy-hook delivery. Set `BYLINE_DEPLOY_HOOK_URL` to the provider's private production deploy-hook URL. A successful current snapshot queues the coalescing public-site deployment job; transient HTTP/network failures retry in the publication queue. The URL must be HTTPS and must not be committed to the repository.

On startup the publication worker reconciles the current snapshot and deployment handoff. If the current snapshot artifact is missing it requeues snapshot preparation. If the exact current snapshot has no pending or successfully triggered deploy job, it requeues deployment.

For an event-night recovery, inspect status and, only when the current snapshot is ready, trigger the same validated deploy hook directly:

```sh
npm run publication:snapshot:status --workspace @byline/newsroom
npm run publication:deploy:now --workspace @byline/newsroom
```

`publication:deploy:now` never prints the hook URL. It refuses to deploy if the current revision lacks a verified snapshot artifact.

## One-time production registry setup

The production host must be able to pull `ghcr.io/weeklywildcat/byline-newsroom`.

The simplest setup for this public repository is to make the container package public after GitHub creates it for the first time. If the package remains private, authenticate Docker on the production host with a GitHub credential that has permission to read packages:

```sh
docker login ghcr.io
```

Do not put a registry token in the repository or in the Compose file.

The existing production Compose project may continue to reference:

```text
byline-newsroom:local
```

The deploy script pulls the immutable SHA image, verifies it, then retags it to that stable local name before Compose recreates services. This keeps existing service definitions, environment configuration, volumes, commands and worker wiring intact.

Override the defaults only when necessary:

```sh
BYLINE_NEWSROOM_IMAGE_REPOSITORY=ghcr.io/weeklywildcat/byline-newsroom
BYLINE_NEWSROOM_LOCAL_IMAGE=byline-newsroom:local
```

## Updating production

The canonical production update command remains:

```sh
npm run deploy:newsroom
```

Run it from a clean `main` checkout on the production host. The command:

1. verifies the checkout is clean and on `main`;
2. fast-forwards to `origin/main` and restarts itself from the updated commit;
3. validates the required production Compose services;
4. pulls `ghcr.io/weeklywildcat/byline-newsroom:<full-git-sha>`;
5. verifies the image's OCI revision label and baked Next `BUILD_ID`;
6. retags the verified image to the stable local image name used by Compose;
7. starts a one-shot `newsroom` container to prove the production Compose wiring can still see the baked build;
8. runs committed Payload migrations while the old newsroom continues serving;
9. recreates the web process and workers;
10. performs an HTTP health check against `/admin`; and
11. verifies the publication worker still has a configured public deploy hook and can report snapshot status.

The production host does **not** run `npm ci`, `docker build`, or `next build` during a normal deployment.

By default the script expects the production Compose project one directory above the repository checkout. For example, a checkout at `/opt/byline/src` uses the Compose project at `/opt/byline`. Other layouts can set:

```sh
BYLINE_DEPLOY_ROOT=/path/to/compose-project npm run deploy:newsroom
```

### Failure and rollback behavior

The current newsroom is left running while the new image is pulled, checked and migrated.

- A pull or image-verification failure changes nothing.
- A Compose-compatibility failure restores the previous stable image tag before exiting.
- A migration failure restores the previous stable image tag; the current containers remain online.
- A service recreation or health-check failure restores the previous image tag and recreates the newsroom services from it.

The first deployment using this model can still roll back to the previous host-built image. The legacy `.next/active-release` pointer is not changed by the new deploy, so an old image restored during rollback continues to find the old release exactly as before.

### Manual / recovery procedure

Prefer the wrapper because it includes the revision, compatibility, rollback and health checks. If manual recovery is required:

```sh
cd /path/to/byline/repository
git pull --ff-only origin main
sha="$(git rev-parse HEAD)"
remote="ghcr.io/weeklywildcat/byline-newsroom:$sha"

docker pull "$remote"
docker image inspect "$remote"
docker tag "$remote" byline-newsroom:local

cd /path/to/compose-project
docker compose run --rm migrate
docker compose up -d --no-deps --force-recreate \
  newsroom \
  media-worker \
  publication-worker \
  scheduled-worker \
  maintenance-worker
```

Before a manual cutover, keep the previous local image ID so it can be retagged if recovery is needed.

## Legacy host-built releases

Older Byline deployments compiled versioned builds into a shared `.next` volume using `newsroom-build` and `scripts/newsroom-release.mjs`.

Those components can remain in the production Compose project during the transition. Normal deploys no longer require the `newsroom-build` service and no longer read or mutate the persistent `.next` release store because the image explicitly sets `BYLINE_NEXT_DIST_DIR=.byline-prebuilt-next`.

Once the prebuilt-image deployment has been proven in production and the rollback window has passed, the unused `newsroom-build` service and persistent `.next` release volume may be removed from the host configuration separately. Keeping that cleanup out of this migration makes the first cutover reversible.

Production must keep `BYLINE_DB_PUSH=0` and run committed Payload migrations. Do not expose PostgreSQL publicly. The newsroom may be published through a reverse proxy or Cloudflare Tunnel while its host port remains bound to loopback.
