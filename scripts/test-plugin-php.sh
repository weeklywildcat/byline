#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
plugin_root="$repo_root/wordpress-plugin"

find "$plugin_root" -type f -name '*.php' \
  -not -path '*/node_modules/*' \
  -not -path '*/release/*' \
  -print0 | xargs -0 -n1 php -l

for test_file in "$plugin_root"/tests/*.php; do
  php "$test_file"
done
