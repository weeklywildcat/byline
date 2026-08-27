# Current compatibility contracts

This document began as the Phase 0 contract baseline and now records the legacy
behavior preserved by the additive Byline 0.2 contracts.

## Public frontend

- Next.js 16 / React 19 application, generated with `output: "export"`,
  `trailingSlash: true`, and `images.unoptimized: true`.
- Canonical article route:
  `/{year}/{month}/{day}/{category}/{articleSlug}/`, derived from the original
  WordPress post date and first routable category.
- Category routes: `/category/{slug}/`; author routes: `/author/{slug}/` and
  `/authors/`; sports routes: `/sports/`, `/sports/schedule/`, team hubs, and
  team-season archives.
- Static sitemap, news sitemap, robots, NewsArticle schema, Organization schema,
  image licensing fields, OpenGraph/Twitter metadata, and normal `<img>` media.
- Homepage post selection reserves the athlete spotlight, prioritizes a sticky
  lead, and mutates one layout-wide used-ID set so later modules do not repeat
  stories.
- Hidden content includes `uncategorized`, setup/test slugs, and setup/test
  titles as defined in `lib/content.ts`.
- Empty editorial/sports modules collapse rather than reserving blank space.

Polls are an optional module. The exported frontend has no Next route handlers;
when enabled, its client calls the static host's relative `/api/polls/*`
integration, which a thin host proxy forwards to WordPress. Byline core itself
still requires no public server.

Preserved poll contracts: the relative `/api/polls/active` and `/api/polls/vote`
endpoints, the public response shape, the user-facing vote error messages, the
five-response threshold before per-answer results are released, and the
`ww_voter_id` / `ww_poll_voted_<pollId>` cookie names, signature format, and
voter-key derivation. Cookie names keep their legacy `ww_` prefix so the
Cloudflare-to-WordPress migration does not make every existing visitor look new.
See [../polls.md](../polls.md).

## WordPress storage

### Content types

- `ww_sports_game`
- `ww_sports_roster`
- `ww_school_event`
- `byline_poll` (new in the polls migration; polls had no WordPress storage
  before, so no legacy identifier is being preserved here)

All remain non-public WordPress admin entities. Games/events do not expose the
native REST controller; the plugin provides shaped read endpoints. Rosters
support revisions through their current native post-type configuration.

### Important metadata

- Sports game `_ww_sport_key`, sport/level/team/opponent/site/location fields,
  local start datetime, status, scores, recap/notes, and import identity fields.
- Sports roster `_ww_roster_team_key`, `_ww_roster_season`, ordered players,
  and ordered staff.
- School event type, start/end/all-day, location, description, URL, and status.
- Author role, pronouns, profile photo, founder/directory flags, social fields,
  and Discord/Google linkage metadata.
- Post `weekly_wildcat_primary_game_id`, Byline editorial workflow metadata
  (see `docs/editorial-workflow.md`), and Discord link metadata. The retired
  per-post homepage-opinion treatment and custom article-hero keys remain in the
  database on older installations as inert legacy values that nothing reads.
- Attachment creator, credit, copyright, license, and acquisition URL.

### Public REST

Namespace `weekly-wildcat/v1` currently exposes:

- `GET sports-games`
- `GET sports-games/{id}`
- `GET sports-games/facets`
- `GET sports-games/upcoming`
- `GET sports-games/recent`
- `GET sports-teams`
- `GET sports-rosters`
- `GET school-events`
- `GET authors`

Sports game search and every Discord route require their existing authenticated
permission/signature checks. Public WordPress objects also expose the legacy
fields `weeklyWildcatProfile`, `weeklyWildcatImage`, and `weeklyWildcat`.

The canonical `byline/v1` namespace now exposes publication, protocol,
diagnostics, design, deployment, teams, games, rosters, events, authors, polls,
and Discord equivalents. Legacy routes and REST fields remain aliases for rolling
frontend and bot upgrades. The public poll routes
(`polls/active`, `polls/vote`, `polls/{id}/results`) are canonical-only: polls
never had a `weekly-wildcat/v1` route to alias.

### Secret operational settings

- Cloudflare-named deploy hook URL and deploy status options;
- Unsplash access key;
- Google client ID/secret and hosted-domain behavior;
- Discord bot URL, OAuth client secret, bridge secret, token/channel IDs, and
  related environment values.

These values must never appear in publication or design payloads.

## Release and updater

- Installed entrypoint: `weekly-wildcat-headless/weekly-wildcat-headless.php`.
- Plugin Update Checker source: `https://github.com/weeklywildcat/byline-plugin/`.
- Required release asset: `weekly-wildcat-headless.zip`.
- Release tags must match the PHP plugin header version.
- The archive must contain the installed entrypoint and exclude Discord,
  dependencies, tests, repository metadata, and development-only files.

This update chain remains authoritative until a release-tested transition can
prove that existing sites receive the new source automatically.

## Baseline verification

On the original audited commits:

- frontend route generation and TypeScript checks passed;
- `next build` generated 384 pages and a populated `out/` export;
- Discord: 6 test files / 14 tests passed, TypeScript passed, build passed;
- plugin-wide PHP syntax passed and all 3 PHP regression scripts passed;
- localhost visual capture was attempted but the in-app browser's enforced
  security check did not grant access. The populated `out/` export is retained
  as the output baseline and screenshots remain a required pre-theme gate.
