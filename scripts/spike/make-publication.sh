#!/bin/bash
# Phase 0 spike: builds a publication repository that pins this engine checkout
# as a git submodule, with a copy of sites/weekly-wildcat as its site.
# Usage: scripts/spike/make-publication.sh <engine checkout> <publication dir>
set -euo pipefail
ENGINE=$(cd "$1" && pwd); PUB=$2
export GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=protocol.file.allow GIT_CONFIG_VALUE_0=always
rm -rf "$PUB"; mkdir -p "$PUB"; cd "$PUB"
git init -q -b main
git -c user.name=spike -c user.email=spike@invalid submodule add -q "$ENGINE" byline
(cd byline && git checkout -q "$(git -C "$ENGINE" rev-parse HEAD)")
cp -R byline/sites/weekly-wildcat site
node - <<'NODE'
const fs = require("fs");
const site = JSON.parse(fs.readFileSync("site/package.json", "utf8"));
site.name = "@weeklywildcat/site";
fs.writeFileSync("site/package.json", JSON.stringify(site, null, 2) + "\n");
const engine = JSON.parse(fs.readFileSync("byline/package.json", "utf8"));
fs.writeFileSync("package.json", JSON.stringify({
  name: "weekly-wildcat-publication",
  private: true,
  workspaces: ["byline/apps/*", "byline/packages/*", "site"],
  scripts: { site: "BYLINE_ROOT=. BYLINE_SITE=site node byline/scripts/select-site.mjs" },
  devDependencies: engine.devDependencies,
  overrides: engine.overrides,
  optionalDependencies: engine.optionalDependencies,
  engines: engine.engines
}, null, 2) + "\n");
NODE
# The publication's own build-context exclusions; the engine's .dockerignore only applies at its own root.
sed -e 's#^\.git$#**/.git#' byline/.dockerignore > .dockerignore
printf 'node_modules/\n' > .gitignore
cp byline/package-lock.json package-lock.json
npm install --package-lock-only --no-audit --no-fund >/dev/null
git -c user.name=spike -c user.email=spike@invalid add -A
git -c user.name=spike -c user.email=spike@invalid commit -qm "Publication pinned to engine $(git -C byline rev-parse --short HEAD)"
echo "publication: $PUB (engine $(git -C byline rev-parse --short HEAD))"
