#!/usr/bin/env bash

set -euo pipefail

mode="${1:-primary}"
shift || true

repo_directory="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_directory"

case "$mode" in
  primary)
    config=".wp-env.json"
    ;;
  legacy)
    config=".wp-env.legacy.json"
    ;;
  *)
    echo "Usage: npm run test:e2e:{primary,legacy} [-- Playwright options]" >&2
    exit 2
    ;;
esac

cleanup() {
  wp-env stop --config="$config" >/dev/null 2>&1 || true
}

trap cleanup EXIT

wp-env start --config="$config"
wp-env run cli --config="$config" wp eval-file wp-content/plugins/wordpress-plugin/tests/integration/build-snapshot.php
# Real REST, role and capability behavior for Home and the Story Workspace.
wp-env run cli --config="$config" wp eval-file wp-content/plugins/wordpress-plugin/tests/integration/home.php
wp-env run cli --config="$config" wp eval-file wp-content/plugins/wordpress-plugin/tests/integration/story-workspace.php
WP_BASE_URL="${WP_BASE_URL:-http://localhost:8888}" \
  playwright test --config=wordpress-plugin/e2e/playwright.config.ts "$@"
