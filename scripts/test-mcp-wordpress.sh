#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
npx wp-env start --config=.wp-env.json
npx wp-env run cli --config=.wp-env.json wp eval-file wp-content/plugins/wordpress-plugin/tests/integration/mcp.php
npm run test:mcp
