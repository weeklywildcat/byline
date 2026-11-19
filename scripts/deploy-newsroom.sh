#!/usr/bin/env bash
set -euo pipefail

fail() {
  printf 'deploy:newsroom: %s\n' "$*" >&2
  exit 1
}

for command in git docker; do
  command -v "$command" >/dev/null 2>&1 || fail "required command not found: $command"
done

repo_root="$(git rev-parse --show-toplevel 2>/dev/null)" || fail "run this command from inside the Byline repository"
cd "$repo_root"

branch="$(git branch --show-current)"
[[ "$branch" == "main" ]] || fail "production deploys must run from main (currently: ${branch:-detached HEAD})"
[[ -z "$(git status --porcelain)" ]] || fail "working tree is not clean; commit, stash, or discard local changes first"

# Pull first, then restart this script from the updated checkout so deploy logic
# itself is always the version from the commit being deployed.
if [[ "${BYLINE_DEPLOY_REEXEC:-0}" != "1" ]]; then
  printf 'Updating main...\n'
  git fetch origin main
  git merge --ff-only origin/main
  [[ "$(git rev-parse HEAD)" == "$(git rev-parse origin/main)" ]] || fail "local main has commits that are not on origin/main"
  export BYLINE_DEPLOY_REEXEC=1
  exec bash "$repo_root/scripts/deploy-newsroom.sh"
fi

deploy_root="${BYLINE_DEPLOY_ROOT:-$(dirname "$repo_root")}"
[[ -d "$deploy_root" ]] || fail "deploy root does not exist: $deploy_root"

compose() {
  (
    cd "$deploy_root"
    docker compose "$@"
  )
}

compose_services="$(compose config --services 2>/dev/null)" || fail "could not load Docker Compose project from $deploy_root"
required_services=(
  newsroom
  migrate
  media-worker
  publication-worker
  scheduled-worker
  maintenance-worker
)
for service in "${required_services[@]}"; do
  grep -Fxq "$service" <<<"$compose_services" || fail "Compose project in $deploy_root is missing required service: $service"
done

# Automatic transcription was retired. Some existing production Compose files may
# still define the old services until the host config is cleaned up; stop and
# remove those containers so they cannot keep consuming CPU or accepting jobs.
retired_services=()
for service in reporting-worker whisper; do
  if grep -Fxq "$service" <<<"$compose_services"; then
    retired_services+=("$service")
  fi
done

commit="$(git rev-parse --short HEAD)"
full_commit="$(git rev-parse HEAD)"
image_repository="${BYLINE_NEWSROOM_IMAGE_REPOSITORY:-ghcr.io/weeklywildcat/byline-newsroom}"
remote_image="${image_repository}:${full_commit}"
local_image="${BYLINE_NEWSROOM_LOCAL_IMAGE:-byline-newsroom:local}"
printf 'Deploying Byline %s from %s using Compose project %s\n' "$commit" "$remote_image" "$deploy_root"

if (( ${#retired_services[@]} )); then
  printf '\nStopping retired transcription services: %s\n' "${retired_services[*]}"
  compose stop "${retired_services[@]}" || true
  compose rm -f "${retired_services[@]}" || true
fi

# Preserve the image currently serving production. Moving a tag does not affect
# an already-running container, so the old newsroom remains online while the new
# image is pulled and migrations run.
rollback_container="$(compose ps -q newsroom 2>/dev/null || true)"
rollback_image_id=""
rollback_image_ref=""
if [[ -n "$rollback_container" ]]; then
  rollback_image_id="$(docker inspect --format '{{.Image}}' "$rollback_container" 2>/dev/null || true)"
  rollback_image_ref="$(docker inspect --format '{{.Config.Image}}' "$rollback_container" 2>/dev/null || true)"
fi

if [[ -n "$rollback_image_ref" && "$rollback_image_ref" != "$local_image" ]]; then
  fail "running newsroom uses image '$rollback_image_ref', but deploy expects '$local_image'; set BYLINE_NEWSROOM_LOCAL_IMAGE to the Compose image reference"
fi

compose_images="$(compose config --images 2>/dev/null)" || fail "could not read Compose image references"
grep -Fxq "$local_image" <<<"$compose_images" ||
  fail "Compose project does not use '$local_image'; set BYLINE_NEWSROOM_LOCAL_IMAGE to the shared newsroom image reference"

restore_previous_image() {
  if [[ -n "$rollback_image_id" ]]; then
    printf 'Restoring previous newsroom image tag...\n' >&2
    docker tag "$rollback_image_id" "$local_image" || true
  fi
}

printf '\n[1/4] Pulling prebuilt newsroom image...\n'
if ! docker pull "$remote_image"; then
  fail "could not pull $remote_image; authenticate to ghcr.io or make the package public, then retry"
fi

image_revision="$(docker image inspect --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}' "$remote_image" 2>/dev/null || true)"
[[ "$image_revision" == "$full_commit" ]] ||
  fail "pulled image revision '$image_revision' does not match checkout '$full_commit'"

if ! docker run --rm --entrypoint sh "$remote_image" -lc '
  test "$BYLINE_NEXT_DIST_DIR" = ".byline-prebuilt-next" &&
  test -s /app/apps/newsroom/.byline-prebuilt-next/BUILD_ID
'; then
  fail "pulled image does not contain a verified prebuilt newsroom release"
fi

docker tag "$remote_image" "$local_image"

if ! compose run --rm --no-deps --entrypoint sh newsroom -lc '
  test "$BYLINE_NEXT_DIST_DIR" = ".byline-prebuilt-next" &&
  test -s /app/apps/newsroom/.byline-prebuilt-next/BUILD_ID
'; then
  restore_previous_image
  fail "production Compose overrides or hides the prebuilt newsroom bundle"
fi

printf '\n[2/4] Running Payload migrations...\n'
if ! compose run --rm migrate; then
  restore_previous_image
  printf '\nMigrations failed. The current newsroom is still online and the previous image tag was restored.\n' >&2
  exit 1
fi

printf '\n[3/4] Recreating newsroom services...\n'
services_to_recreate=(
  newsroom
  media-worker
  publication-worker
  scheduled-worker
  maintenance-worker
)
if ! compose up -d --no-deps --force-recreate "${services_to_recreate[@]}"; then
  printf '\nCutover failed; restoring the previous newsroom image...\n' >&2
  restore_previous_image
  compose up -d --no-deps --force-recreate "${services_to_recreate[@]}" || true
  fail "newsroom service recreation failed; rollback was attempted"
fi

printf '\n[4/4] Verifying the new newsroom...\n'
healthy=0
for attempt in $(seq 1 30); do
  if compose exec -T newsroom node -e '
    fetch("http://127.0.0.1:3010/admin", { redirect: "manual" })
      .then((response) => {
        if (response.status < 200 || response.status >= 400) process.exit(1)
      })
      .catch(() => process.exit(1))
  ' >/dev/null 2>&1; then
    healthy=1
    break
  fi
  sleep 2
done

if [[ "$healthy" != "1" ]]; then
  printf '\nHealth check failed; restoring the previous newsroom image...\n' >&2
  restore_previous_image
  compose up -d --no-deps --force-recreate "${services_to_recreate[@]}" || true
  fail "new newsroom never became healthy; rollback was attempted"
fi

printf '\nChecking publication deployment configuration...\n'
if ! compose exec -T publication-worker sh -lc 'test -n "$BYLINE_DEPLOY_HOOK_URL"'; then
  fail "publication-worker is missing BYLINE_DEPLOY_HOOK_URL; public changes will not trigger the static-site build"
fi
publication_status="$(compose exec -T publication-worker npm --silent run publication:snapshot:status --workspace @byline/newsroom)" ||
  fail "publication-worker could not report public snapshot status"
grep -Eq '"configured"[[:space:]]*:[[:space:]]*true' <<<"$publication_status" ||
  fail "publication-worker started without a configured public deploy hook"

# The immutable SHA tag is only needed to transfer and verify the image. The
# Compose project intentionally keeps using its stable local tag.
docker image rm "$remote_image" >/dev/null 2>&1 || true

printf '\nByline %s deployed successfully.\n' "$commit"
compose ps "${services_to_recreate[@]}"
