#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
plugin_root="$repo_root/wordpress-plugin"
release_root="$plugin_root/release"
archive="$release_root/weekly-wildcat-headless.zip"
stage_root="$(mktemp -d)"
trap 'rm -rf "$stage_root"' EXIT

poll_files=(
  includes/polls/schema.php
  includes/polls/votes.php
  includes/polls/voter.php
  includes/polls/post-type.php
  includes/polls/model.php
  includes/polls/rest.php
  includes/polls/admin.php
  includes/polls/migration.php
  includes/polls/cli.php
)

for required_file in weekly-wildcat-headless.php build/index.js build/index.asset.php build/index.css build/style-index.css "${poll_files[@]}"; do
  test -f "$plugin_root/$required_file"
done

asset_dependencies="$(php -r '$asset = include $argv[1]; echo implode("\n", $asset["dependencies"] ?? []);' "$plugin_root/build/index.asset.php")"
for external_dependency in react react-dom react-jsx-runtime wp-element; do
  if ! grep -qx "$external_dependency" <<<"$asset_dependencies"; then
    echo "React external $external_dependency is missing from the WordPress asset manifest." >&2
    exit 1
  fi
done

mkdir -p "$stage_root/weekly-wildcat-headless" "$release_root"
rsync -a "$plugin_root/" "$stage_root/weekly-wildcat-headless/" \
  --exclude '.git' \
  --exclude '.gitignore' \
  --exclude '.github' \
  --exclude 'node_modules' \
  --exclude '.env' \
  --exclude '.env.*' \
  --exclude 'tests' \
  --exclude 'tests-js' \
  --exclude 'src' \
  --exclude 'scripts' \
  --exclude 'README.md' \
  --exclude 'package.json' \
  --exclude 'package-lock.json' \
  --exclude 'tsconfig.json' \
  --exclude 'vitest.config.mts' \
  --exclude 'release' \
  --exclude '*.zip' \
  --exclude '*.map' \
  --exclude '.DS_Store'

(cd "$stage_root" && zip -qr "$archive" weekly-wildcat-headless)
unzip -tq "$archive"

archive_files="$(unzip -Z1 "$archive")"
grep -qx 'weekly-wildcat-headless/weekly-wildcat-headless.php' <<<"$archive_files"
grep -qx 'weekly-wildcat-headless/build/index.js' <<<"$archive_files"
grep -qx 'weekly-wildcat-headless/build/index.asset.php' <<<"$archive_files"

# Polls are WordPress-owned storage now, so the whole poll module must ship.
for poll_file in "${poll_files[@]}"; do
  if ! grep -qx "weekly-wildcat-headless/$poll_file" <<<"$archive_files"; then
    echo "Plugin archive is missing required poll code $poll_file." >&2
    exit 1
  fi
done

main_plugin_files="$(grep -Ec '(^|/)weekly-wildcat-headless\.php$' <<<"$archive_files")"
if [[ "$main_plugin_files" -ne 1 ]]; then
  echo "Plugin archive must contain exactly one weekly-wildcat-headless.php entrypoint." >&2
  exit 1
fi

if grep -Eq '(^|/)(node_modules|tests|tests-js|src|discord-bot|apps|\.git)(/|$)' <<<"$archive_files"; then
  echo "Plugin archive contains development or repository-only content." >&2
  exit 1
fi

echo "$archive"
