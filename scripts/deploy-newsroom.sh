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
  newsroom-build
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
release="$(git rev-parse --short=12 HEAD)-$(date +%s)"
printf 'Deploying Byline %s using Compose project %s\n' "$commit" "$deploy_root"

if (( ${#retired_services[@]} )); then
  printf '\nStopping retired transcription services: %s\n' "${retired_services[*]}"
  compose stop "${retired_services[@]}" || true
  compose rm -f "${retired_services[@]}" || true
fi

# Keep enough information to put the old image tag back if the final container
# replacement fails. Building a new image never changes the already-running
# container, so the current newsroom remains a valid fallback until cutover.
rollback_container="$(compose ps -q newsroom 2>/dev/null || true)"
rollback_image_id=""
rollback_image_ref=""
if [[ -n "$rollback_container" ]]; then
  rollback_image_id="$(docker inspect --format '{{.Image}}' "$rollback_container" 2>/dev/null || true)"
  rollback_image_ref="$(docker inspect --format '{{.Config.Image}}' "$rollback_container" 2>/dev/null || true)"
fi

printf '\n[1/5] Building service image...\n'
compose build newsroom

printf '\n[2/5] Building production newsroom release while the current newsroom stays online...\n'
if ! compose run --rm --no-deps newsroom-build node scripts/newsroom-release.mjs build "$release"; then
  printf '\nNewsroom build failed. The current newsroom is still online and the active release was not changed.\n' >&2
  exit 1
fi

printf '\n[3/5] Running Payload migrations...\n'
if ! compose run --rm migrate; then
  printf '\nMigrations failed. The current newsroom is still online and the new release was not activated.\n' >&2
  exit 1
fi

printf '\n[4/5] Activating the verified newsroom release...\n'
previous_release="$(compose run --rm --no-deps newsroom-build node scripts/newsroom-release.mjs current | tail -n 1 | tr -d '\r')"
[[ "$previous_release" == "legacy" || "$previous_release" =~ ^[a-zA-Z0-9][a-zA-Z0-9._-]{0,95}$ ]] ||
  fail "could not determine the currently active newsroom release"
compose run --rm --no-deps newsroom-build node scripts/newsroom-release.mjs activate "$release" >/dev/null

printf '\n[5/5] Recreating newsroom services...\n'
services_to_recreate=(
  newsroom
  media-worker
  publication-worker
  scheduled-worker
  maintenance-worker
)
if ! compose up -d --no-deps --force-recreate "${services_to_recreate[@]}"; then
  printf '\nCutover failed; restoring the previous newsroom release...\n' >&2
  compose run --rm --no-deps newsroom-build node scripts/newsroom-release.mjs rollback "$previous_release" >/dev/null || true
  if [[ -n "$rollback_image_id" && -n "$rollback_image_ref" ]]; then
    docker tag "$rollback_image_id" "$rollback_image_ref" || true
  fi
  compose up -d --no-deps --force-recreate "${services_to_recreate[@]}" || true
  fail "newsroom service recreation failed; rollback was attempted"
fi

# Keep the just-replaced release as one quick rollback target and remove older
# Next build trees. Failure to prune is not a deployment failure.
compose run --rm --no-deps newsroom-build node scripts/newsroom-release.mjs prune "$previous_release" >/dev/null ||
  printf 'deploy:newsroom: warning: could not prune old Next releases\n' >&2

printf '\nChecking publication deployment configuration...\n'
if ! compose exec -T publication-worker sh -lc 'test -n "$BYLINE_DEPLOY_HOOK_URL"'; then
  fail "publication-worker is missing BYLINE_DEPLOY_HOOK_URL; public changes will not trigger the static-site build"
fi
publication_status="$(compose exec -T publication-worker npm --silent run publication:snapshot:status --workspace @byline/newsroom)" ||
  fail "publication-worker could not report public snapshot status"
grep -Eq '"configured"[[:space:]]*:[[:space:]]*true' <<<"$publication_status" ||
  fail "publication-worker started without a configured public deploy hook"

printf '\nByline %s deployed successfully.\n' "$commit"
compose ps "${services_to_recreate[@]}"
