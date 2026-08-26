# WordPress updater transition

## Compatibility path

Existing installations originally checked GitHub releases in
`weeklywildcat/byline-plugin` while retaining the installed path
`weekly-wildcat-headless/weekly-wildcat-headless.php`.

The standalone repository published `v0.2.1` on 2026-08-26 as the final bridge:

1. An old installation checks `weeklywildcat/byline-plugin`.
2. It receives `v0.2.1` as `weekly-wildcat-headless.zip`.
3. The unchanged installed plugin starts checking `weeklywildcat/byline`.
4. A later canonical `vX.Y.Z` release in `byline` supplies the same ZIP,
   installed folder, main file, and updater slug.

The bridge therefore precedes the repository transition. Never delete its tag,
release, or asset, and do not republish a canonical tag that is older than
`0.2.1`.

## Enforced contracts

- canonical updater repository: `https://github.com/weeklywildcat/byline/`
- installed/update slug: `weekly-wildcat-headless`
- release asset: `weekly-wildcat-headless.zip`
- installed main file: `weekly-wildcat-headless/weekly-wildcat-headless.php`
- standalone bridge release: `weeklywildcat/byline-plugin` `v0.2.1`

`wordpress-plugin/tests/updater-bridge-regression.php` locks the plugin-side
contract. `scripts/verify-updater-transition.mjs` also verifies that the
canonical tag workflow publishes the asset the updater selects. CI runs both,
then creates and inspects a production ZIP simulation.

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

- bridge `v0.2.1` and its asset remain remotely available;
- the history-preserving monorepo migration is merged;
- canonical monorepo CI and release packaging pass;
- at least one release from `weeklywildcat/byline` has successfully updated an
  installation that first received the bridge;
- production observation shows no active supported installation cohort still
  requires a new release from the standalone repository.

Afterward, archiving is a manual GitHub repository-setting action. Archiving is
safe only as a read-only historical state; never delete the repository or its
releases.
