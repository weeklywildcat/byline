# Fixed sports archive

Sports management has been retired. The plugin converts published games and rosters into ordinary WordPress Pages through its versioned upgrade coordinator. It runs on activation or the first WordPress admin request after updating the plugin. No live-site conversion occurs merely by building this repository.

## Reader experience

The Sports Archive index links to one Page per sport. Each sport groups records by school year, newest first, then by team/level. Games retain dates, times, opponents, home/away status, locations, results, notes, recap links, and published linked reporting. Rosters retain player names, jersey numbers, positions, grades, and staff. Multiple published rosters are preserved separately rather than choosing one and discarding another. Undated and unrecognized-team records have explicit sections.

These are fixed historical records, not a live schedule. Current sports reporting remains at `/category/sports/`. Sports archive contents are searchable, including names and opponents. The public site renders the Pages as static HTML; readers do not need JavaScript or the old sports APIs.

The preferred slugs are `/sports-archive/` and `/sports-archive-<sport>/`. WordPress assigns a unique slug if an editor already owns one. The static build follows the actual Page slug and preserves old `/sports/<team>/` and `/sports/<team>/<year>/` URLs with static redirects to the archive Page or season heading. `/sports/` and `/sports/schedule/` lead to the archive index. Existing game cards can link directly to their preserved game heading.

## Preservation and recovery

- Only published, unprotected records and linked stories are copied. Draft, private, future-publication, and password-protected posts stay out of public Pages.
- Source `ww_sports_game`, `ww_sports_roster`, metadata, team options, and media remain stored. Their post types stay registered privately with editing denied. Public legacy read APIs remain available for compatibility.
- Custom Games, Teams, Rosters, schedule imports/exports, bulk reset, and game-linking authoring controls are removed. Existing sports blocks still render; their new insertion patterns and editing controls are retired. School Events remain independent.
- The migration has a lock, per-Page ownership markers, recovery for an incomplete metadata write, and a version marker written only after all Pages are ready. A failure keeps the source data and retries on a later admin request. The standard upgrade notice reports failures.
- An existing editor-authored Page is never overwritten. Completed archive Pages are never regenerated automatically, so later corrections made in the normal Page editor survive plugin upgrades.

Install the tested plugin build and open WordPress admin before deploying the matching frontend. Confirm the sports archive upgrade succeeds, review its Pages, then let the usual Page/publication deployment hook rebuild the static site. No plugin version or release tag is changed by this implementation.

## Verification

`wordpress-plugin/tests/sports-archive-regression.php` exercises conversion, partial failures, retries, collisions, duplicate rosters, zero scores, undated games, private records, source preservation, and locking. The frontend archive tests cover alias validation and static content. Browser tests open the converted Page without JavaScript and follow a historical season redirect. The static-export verifier checks redirect targets exist.
