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

commit="$(git rev-parse --short HEAD)"
printf 'Deploying Byline %s using Compose project %s\n' "$commit" "$deploy_root"

printf '\n[1/5] Building shared newsroom image once...\n'
compose build newsroom

printf '\n[2/5] Running Payload migrations...\n'
compose run --rm migrate

printf '\n[3/5] Stopping the newsroom before replacing the shared Next build...\n'
compose stop newsroom

printf '\n[4/5] Building the production newsroom...\n'
if ! compose run --rm newsroom-build; then
  printf '\nNewsroom build failed. The newsroom was intentionally left stopped so it cannot start against an incomplete .next tree.\n' >&2
  exit 1
fi

printf '\n[5/5] Recreating newsroom services...\n'
compose up -d --no-deps --force-recreate \
  newsroom \
  media-worker \
  publication-worker \
  scheduled-worker \
  maintenance-worker

printf '\nByline %s deployed successfully.\n' "$commit"
compose ps newsroom media-worker publication-worker scheduled-worker maintenance-worker
