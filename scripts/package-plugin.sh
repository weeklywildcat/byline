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

admin_assets=(
  assets/game-linking.js
  assets/google-signin-light.png
  assets/sports-rosters.css
  assets/sports-rosters.js
  assets/weekly-wildcat-logo.svg
)

build_assets=(
  build/index.js
  build/index.asset.php
  build/index.css
  build/style-index.css
)

migration_assets=(
  migrations/weekly-wildcat-pages.json
)

for required_file in weekly-wildcat-headless.php "${build_assets[@]}" "${admin_assets[@]}" "${migration_assets[@]}" "${poll_files[@]}"; do
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

# Every production include and updater class is executable runtime code. Keep
# the archive contract coupled to the source tree so a new coordinator,
# migration, REST adapter, or updater dependency cannot be omitted silently.
while IFS= read -r -d '' source_file; do
  runtime_file="${source_file#"$plugin_root/"}"
  if ! grep -qx "weekly-wildcat-headless/$runtime_file" <<<"$archive_files"; then
    echo "Plugin archive is missing required runtime file $runtime_file." >&2
    exit 1
  fi
done < <(find "$plugin_root/includes" "$plugin_root/plugin-update-checker" -type f -name '*.php' -print0 | sort -z)

for asset_file in "${admin_assets[@]}"; do
  if ! grep -qx "weekly-wildcat-headless/$asset_file" <<<"$archive_files"; then
    echo "Plugin archive is missing required admin/runtime asset $asset_file." >&2
    exit 1
  fi
done

for build_file in "${build_assets[@]}"; do
  if ! grep -qx "weekly-wildcat-headless/$build_file" <<<"$archive_files"; then
    echo "Plugin archive is missing required compiled asset $build_file." >&2
    exit 1
  fi
done

for migration_file in "${migration_assets[@]}"; do
  if ! grep -qx "weekly-wildcat-headless/$migration_file" <<<"$archive_files"; then
    echo "Plugin archive is missing required migration asset $migration_file." >&2
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

if grep -Eiq '(^|/)(\.env(\.[^/]*)?|.*\.(log|sql|pem|key|map))$' <<<"$archive_files"; then
  echo "Plugin archive contains a local environment file, secret/key material, database dump, log, or source map." >&2
  exit 1
fi

if grep -Eiq '(^|/)(d1|cloudflare-d1|export-d1|fixtures)(/|$)' <<<"$archive_files"; then
  echo "Plugin archive contains development datastore artifacts." >&2
  exit 1
fi

echo "$archive"
