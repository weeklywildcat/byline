#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
npm run verify:mcp-catalog
composer_bin="${BYLINE_COMPOSER_BIN:-composer}"
"$composer_bin" install --working-dir=wordpress-plugin --no-dev --prefer-dist --no-interaction
"$composer_bin" install --working-dir=scripts/php-tools --prefer-dist --no-interaction
cd wordpress-plugin
php ../scripts/php-tools/vendor/bin/php-scoper add-prefix --config=../scripts/php-tools/scoper.inc.php --output-dir=build/mcp --force --no-interaction
"$composer_bin" dump-autoload --working-dir=build/mcp --classmap-authoritative --no-dev --no-interaction
