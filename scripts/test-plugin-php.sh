#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
plugin_root="$repo_root/wordpress-plugin"

php_version_id="$(php -r 'echo PHP_VERSION_ID;')"
runtime_exclusion='*/__no_excluded_mcp_runtime__/*'
if [[ "$php_version_id" -lt 80200 ]]; then
  # The PHP 7.4-safe bootstrap leaves the optional PHP 8.2 MCP runtime unloaded.
  runtime_exclusion='*/includes/mcp/*'
  php -l "$plugin_root/includes/mcp/bootstrap.php"
fi
find "$plugin_root" -type f -name '*.php' \
  -not -path '*/node_modules/*' \
  -not -path '*/vendor/*' \
  -not -path '*/build/mcp/*' \
  -not -path '*/release/*' \
  -not -path "$runtime_exclusion" \
  -print0 | xargs -0 -n1 php -l

for test_file in "$plugin_root"/tests/*.php; do
  php "$test_file"
done
