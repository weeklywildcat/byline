# Weekly Wildcat Bridge

Plain PHP WordPress plugin for Weekly Wildcat content bridge data.

## What It Adds

- Admin sidebar item: Sports Games
- Admin sidebar item: School Events
- Custom post type: `ww_sports_game`
- Custom post type: `ww_school_event`
- Public read-only REST endpoints:
  - `/wp-json/weekly-wildcat/v1/sports-games`
  - `/wp-json/weekly-wildcat/v1/sports-games/upcoming`
  - `/wp-json/weekly-wildcat/v1/sports-games/recent`
  - `/wp-json/weekly-wildcat/v1/sports-teams`
  - `/wp-json/weekly-wildcat/v1/sports-rosters`
  - `/wp-json/weekly-wildcat/v1/school-events`
  - `/wp-json/weekly-wildcat/v1/authors`
- WordPress user profile fields for author profiles:
  - role, pronouns, Media Library profile photo, Founder badge, author directory visibility, and social links

The plugin does not render anything on the WordPress frontend. Editing stays inside the normal WordPress admin.

## Install

Upload the `weekly-wildcat-headless` folder to `wp-content/plugins/`, then activate **Weekly Wildcat Bridge** in WordPress.

## Deploy

For the first install, zip this folder and upload it in WordPress admin under Plugins > Add Plugin > Upload Plugin.

After the plugin is active, WordPress checks GitHub releases from:

`https://github.com/weeklywildcat/byline-plugin`

Enable auto-updates for **Weekly Wildcat Bridge** in WordPress admin if you want future releases installed automatically.

## Release Updates

Only tagged releases are used for WordPress updates. Normal pushes to `main` do not deploy to the CMS.

To publish an update:

1. Update the `Version:` header in `weekly-wildcat-headless.php`.
2. Commit and push the change to `main`.
3. Create and push a matching tag, for example:

   ```sh
   git tag v0.1.2
   git push origin v0.1.2
   ```

GitHub Actions packages `weekly-wildcat-headless.zip` and publishes it as a release asset. WordPress uses that release asset for plugin updates.

## Notes

- Sports Games use one record for scheduled games, final scores, ties, forfeits, postponements, and cancellations.
- Sports Games include a controlled Sport / Team dropdown for stable frontend filtering.
- Sports Games expose `sportKey`, `sportLabel`, location name, address, latitude, longitude, and optional Apple Maps place ID.
- Sports Team Settings support a click-to-position header image focal point. The sports team endpoint exposes it as `headerImageFocalPoint.x` and `headerImageFocalPoint.y` percentages for CSS `object-position`.
- Team Rosters store one published roster per controlled team and `YYYY-YY` school year, with ordered student-athlete and staff rows. Editors can manage rows manually or preview and replace rosters through CSV import/export.
- The public sports roster endpoint accepts optional `teamKey` and `season` filters and excludes draft rosters.
- Scores are returned publicly only when a game status is `final` or `tie`; forfeits are exposed as status-only results.
- School Events support scheduled and canceled statuses.
- The Next.js frontend has typed helpers in `lib/headless.ts`.
- Author profile data is exposed on public user REST responses as `weeklyWildcatProfile`.
- Authors are exposed through `/weekly-wildcat/v1/authors` so contributors can appear before publishing a story. The author directory visibility checkbox is enabled by default and can be unchecked per user.
