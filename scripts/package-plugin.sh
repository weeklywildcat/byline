#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
plugin_root="$repo_root/wordpress-plugin"
release_root="$plugin_root/release"
archive="$release_root/weekly-wildcat-headless.zip"
stage_root="$(mktemp -d)"
trap 'rm -rf "$stage_root"' EXIT

plugin_header_version="$(grep -E '^[[:space:]]*\* Version:' "$plugin_root/weekly-wildcat-headless.php" | head -n 1 | sed -E 's/.*Version:[[:space:]]*//')"

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
  # The block-editor workflow entry. A production install that ships without it
  # silently loses the editorial workflow sidebar.
  build/editorial-workflow.js
  build/editorial-workflow.asset.php
  build/editorial-workflow.css
  # The normal Page editor settings panel is separate from the story workflow.
  build/page-editor.js
  build/page-editor.asset.php
  # Metadata, editor script, and shared block CSS are all runtime assets.
  build/blocks/page-section/block.json
  build/blocks/page-section/index.js
  build/blocks/page-section/index.asset.php
  build/blocks/page-section/render.php
  build/blocks/page-section/style-index.css
  # Newsroom block metadata, editor bundles, and the shared publication-neutral
  # stylesheet emitted for each block entry.
  build/blocks/stories/block.json
  build/blocks/stories/index.js
  build/blocks/stories/index.asset.php
  build/blocks/stories/style-index.css
  build/blocks/people/block.json
  build/blocks/people/index.js
  build/blocks/people/index.asset.php
  build/blocks/people/style-index.css
  build/blocks/sports-schedule/block.json
  build/blocks/sports-schedule/index.js
  build/blocks/sports-schedule/index.asset.php
  build/blocks/sports-schedule/style-index.css
  build/blocks/events/block.json
  build/blocks/events/index.js
  build/blocks/events/index.asset.php
  build/blocks/events/style-index.css
  build/blocks/poll/block.json
  build/blocks/poll/index.js
  build/blocks/poll/index.asset.php
  build/blocks/poll/style-index.css
  build/blocks/game-score/block.json
  build/blocks/game-score/index.js
  build/blocks/game-score/index.asset.php
  build/blocks/game-score/style-index.css
  build/blocks/correction-notice/block.json
  build/blocks/correction-notice/index.js
  build/blocks/correction-notice/index.asset.php
  build/blocks/correction-notice/style-index.css
)

migration_assets=(
  migrations/weekly-wildcat-pages.json
)

# WordPress reads the plugin's readme.txt for the changelog, upgrade notice, and
# supported-version metadata shown on the update screen. Without it every site
# sees "There is no changelog available."
release_metadata=(
  readme.txt
)

for required_file in weekly-wildcat-headless.php "${build_assets[@]}" "${admin_assets[@]}" "${migration_assets[@]}" "${release_metadata[@]}" "${poll_files[@]}"; do
  test -f "$plugin_root/$required_file"
done

# The readme has to document the version actually being packaged, or the update
# screen shows a changelog for the wrong release.
readme_stable_tag="$(grep -E '^Stable tag:' "$plugin_root/readme.txt" | head -n 1 | sed -E 's/^Stable tag:[[:space:]]*//')"
if [[ "$readme_stable_tag" != "$plugin_header_version" ]]; then
  echo "readme.txt stable tag $readme_stable_tag does not match plugin version $plugin_header_version." >&2
  exit 1
fi
if ! grep -qE "^= ${plugin_header_version//./\.} =$" "$plugin_root/readme.txt"; then
  echo "readme.txt has no changelog entry for $plugin_header_version." >&2
  exit 1
fi

asset_dependencies="$(php -r '$asset = include $argv[1]; echo implode("\n", $asset["dependencies"] ?? []);' "$plugin_root/build/index.asset.php")"
for external_dependency in react react-dom react-jsx-runtime wp-element; do
  if ! grep -qx "$external_dependency" <<<"$asset_dependencies"; then
    echo "React external $external_dependency is missing from the WordPress asset manifest." >&2
    exit 1
  fi
done

# The workflow entry loads on every post editor, so it must rely entirely on the
# WordPress-provided packages rather than bundling a second React or a second
# copy of the editor packages.
workflow_dependencies="$(php -r '$asset = include $argv[1]; echo implode("\n", $asset["dependencies"] ?? []);' "$plugin_root/build/editorial-workflow.asset.php")"
for editor_dependency in wp-plugins wp-editor wp-element wp-data wp-components wp-api-fetch; do
  if ! grep -qx "$editor_dependency" <<<"$workflow_dependencies"; then
    echo "WordPress dependency $editor_dependency is missing from the workflow editor asset manifest." >&2
    exit 1
  fi
done
for bundled_react in react react-dom; do
  if grep -qx "$bundled_react" <<<"$workflow_dependencies"; then
    echo "The workflow editor bundle must use the WordPress-provided $bundled_react." >&2
    exit 1
  fi
done

page_editor_dependencies="$(php -r '$asset = include $argv[1]; echo implode("\n", $asset["dependencies"] ?? []);' "$plugin_root/build/page-editor.asset.php")"
for page_editor_dependency in wp-plugins wp-edit-post wp-data wp-components wp-i18n; do
  if ! grep -qx "$page_editor_dependency" <<<"$page_editor_dependencies"; then
    echo "WordPress dependency $page_editor_dependency is missing from the Page editor asset manifest." >&2
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
  --exclude 'e2e' \
  --exclude '.wp-env.json' \
  --exclude '.wp-env.override.json' \
  --exclude 'src' \
  --exclude 'scripts' \
  --exclude 'README.md' \
  --exclude 'package.json' \
  --exclude 'package-lock.json' \
  --exclude 'tsconfig.json' \
  --exclude 'vitest.config.mts' \
  --exclude 'webpack.config.js' \
  --exclude 'release' \
  --exclude '*.zip' \
  --exclude '*.map' \
  --exclude '.DS_Store'

# zip adds to an existing archive rather than replacing it, so a file that was
# removed from the plugin would otherwise keep shipping in every later release.
rm -f "$archive"
(cd "$stage_root" && zip -qr "$archive" weekly-wildcat-headless)
unzip -tq "$archive"

archive_files="$(unzip -Z1 "$archive")"
grep -qx 'weekly-wildcat-headless/weekly-wildcat-headless.php' <<<"$archive_files"
grep -qx 'weekly-wildcat-headless/build/index.js' <<<"$archive_files"
grep -qx 'weekly-wildcat-headless/build/index.asset.php' <<<"$archive_files"
grep -qx 'weekly-wildcat-headless/build/editorial-workflow.js' <<<"$archive_files"
grep -qx 'weekly-wildcat-headless/build/editorial-workflow.asset.php' <<<"$archive_files"
grep -qx 'weekly-wildcat-headless/build/page-editor.js' <<<"$archive_files"
grep -qx 'weekly-wildcat-headless/build/page-editor.asset.php' <<<"$archive_files"
grep -qx 'weekly-wildcat-headless/build/blocks/page-section/block.json' <<<"$archive_files"
grep -qx 'weekly-wildcat-headless/build/blocks/page-section/index.js' <<<"$archive_files"
grep -qx 'weekly-wildcat-headless/build/blocks/page-section/index.asset.php' <<<"$archive_files"
grep -qx 'weekly-wildcat-headless/build/blocks/page-section/render.php' <<<"$archive_files"
grep -qx 'weekly-wildcat-headless/build/blocks/page-section/style-index.css' <<<"$archive_files"

for newsroom_block in stories people sports-schedule events poll game-score correction-notice; do
  grep -qx "weekly-wildcat-headless/build/blocks/$newsroom_block/block.json" <<<"$archive_files"
  grep -qx "weekly-wildcat-headless/build/blocks/$newsroom_block/index.js" <<<"$archive_files"
  grep -qx "weekly-wildcat-headless/build/blocks/$newsroom_block/index.asset.php" <<<"$archive_files"
  grep -qx "weekly-wildcat-headless/build/blocks/$newsroom_block/style-index.css" <<<"$archive_files"
done

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

for metadata_file in "${release_metadata[@]}"; do
  if ! grep -qx "weekly-wildcat-headless/$metadata_file" <<<"$archive_files"; then
    echo "Plugin archive is missing required release metadata $metadata_file." >&2
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
