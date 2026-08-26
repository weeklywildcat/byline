#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
plugin_root="$repo_root/wordpress-plugin"
release_root="$plugin_root/release"
archive="$release_root/weekly-wildcat-headless.zip"
stage_root="$(mktemp -d)"
trap 'rm -rf "$stage_root"' EXIT

for required_file in weekly-wildcat-headless.php build/index.js build/index.asset.php build/index.css build/style-index.css; do
  test -f "$plugin_root/$required_file"
done

if grep -Eq "['\"]react(-dom)?['\"]" "$plugin_root/build/index.asset.php"; then
  echo "React must remain external and use WordPress-provided wp-element." >&2
  exit 1
fi

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

if grep -Eq '(^|/)(node_modules|tests|tests-js|src|discord-bot|apps|\.git)(/|$)' <<<"$archive_files"; then
  echo "Plugin archive contains development or repository-only content." >&2
  exit 1
fi

echo "$archive"
