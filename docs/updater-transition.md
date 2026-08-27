# WordPress updater transition

## Compatibility path

Existing installations originally checked GitHub releases in
`weeklywildcat/byline-plugin` while retaining the installed path
`weekly-wildcat-headless/weekly-wildcat-headless.php`.

The standalone repository published fixed bridge `v0.2.3` on 2026-08-26.
Versions `v0.2.1` and `v0.2.2` remain available for traceability but contain
release-blocking activation/runtime errors:

1. An old installation checks `weeklywildcat/byline-plugin`.
2. It receives `v0.2.3` as `weekly-wildcat-headless.zip`.
3. The unchanged installed plugin starts checking `weeklywildcat/byline`.
4. A later canonical `vX.Y.Z` release in `byline` supplies the same ZIP,
   installed folder, main file, and updater slug.

The bridge therefore precedes the repository transition. Never delete its tag,
release, or asset, and do not republish a canonical tag that is older than
`0.2.3`.

## Enforced contracts

- canonical updater repository: `https://github.com/weeklywildcat/byline/`
- installed/update slug: `weekly-wildcat-headless`
- release asset: `weekly-wildcat-headless.zip`
- installed main file: `weekly-wildcat-headless/weekly-wildcat-headless.php`
- standalone bridge release: `weeklywildcat/byline-plugin` `v0.2.3`

PUC derives its remote metadata path from the installed main-file basename, so
it requests `/contents/weekly-wildcat-headless.php` even though the canonical
source is `wordpress-plugin/weekly-wildcat-headless.php`. The repository-root
`weekly-wildcat-headless.php` symlink exposes that canonical source at PUC's
fixed path without duplicating plugin code. It is repository metadata only;
the release packager stages `wordpress-plugin/` and includes exactly one
installable entrypoint in the ZIP.

`wordpress-plugin/tests/updater-bridge-regression.php` locks the plugin-side
contract and root remote-source path. The release-transition regression runs
the bundled PUC request flow for both successful metadata resolution and a
missing-file response, proving that a `v0.2.8` release tag still supplies the
remote version and asset when metadata is unavailable. The missing-file case
produces `puc-github-http-error` but not `puc-no-plugin-version`.
`scripts/verify-updater-transition.mjs` also verifies the symlink and that the
canonical tag workflow publishes the asset the updater selects. CI runs these
checks, then creates and inspects a production ZIP simulation.

## Canonical release procedure

1. Bump both the plugin header and `wordpress-plugin/package.json`.
2. Run `npm ci`, `npm run typecheck`, `npm test`, `npm run build`, and
   `npm run package:plugin` from the monorepo root.
3. Merge to `main` normally.
4. Push a matching `vX.Y.Z` tag. Imported standalone tags are intentionally
   named `plugin-vX.Y.Z` and are not canonical update releases.
5. Verify the GitHub release asset remotely by downloading it, testing the ZIP,
   confirming the installed path/version/updater values, and checking all
   exclusions.

## Standalone repository retirement

Keep `weeklywildcat/byline-plugin` unarchived until all of these are true:

- fixed bridge `v0.2.3` and failed releases `v0.2.1` and `v0.2.2` remain remotely available;
- the history-preserving monorepo migration is merged;
- canonical monorepo CI and release packaging pass;
- at least one release from `weeklywildcat/byline` has successfully updated an
  installation that first received the bridge;
- production observation shows no active supported installation cohort still
  requires a new release from the standalone repository.

Afterward, archiving is a manual GitHub repository-setting action. Archiving is
safe only as a read-only historical state; never delete the repository or its
releases.
