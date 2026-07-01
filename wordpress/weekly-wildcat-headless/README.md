# Weekly Wildcat Headless

Plain PHP WordPress plugin for Weekly Wildcat headless data.

## What It Adds

- Admin sidebar item: Sports Games
- Admin sidebar item: School Events
- Custom post type: `ww_sports_game`
- Custom post type: `ww_school_event`
- Public read-only REST endpoints:
  - `/wp-json/weekly-wildcat/v1/sports-games`
  - `/wp-json/weekly-wildcat/v1/sports-games/upcoming`
  - `/wp-json/weekly-wildcat/v1/sports-games/recent`
  - `/wp-json/weekly-wildcat/v1/school-events`
- WordPress user profile fields for author profiles:
  - role, pronouns, Media Library profile photo, Founder badge, and social links

The plugin does not render anything on the WordPress frontend. Editing stays inside the normal WordPress admin.

## Install

Upload the `weekly-wildcat-headless` folder to `wp-content/plugins/`, then activate **Weekly Wildcat Headless** in WordPress.

## Deploy

For the first install, zip this folder and upload it in WordPress admin under Plugins > Add Plugin > Upload Plugin.

After the plugin is active, WordPress checks GitHub releases from:

`https://github.com/weeklywildcat/byline-plugin`

Enable auto-updates for **Weekly Wildcat Headless** in WordPress admin if you want future releases installed automatically.

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

- Sports Games use one record for scheduled games and final scores.
- Sports Games include a controlled Sport / Team dropdown for stable frontend filtering.
- Sports Games expose `sportKey`, `sportLabel`, location name, address, latitude, longitude, and optional Apple Maps place ID.
- Scores are returned publicly only when a game status is `final`.
- School Events support scheduled and canceled statuses.
- The Next.js frontend has typed helpers in `lib/headless.ts`.
- Author profile data is exposed on public user REST responses as `weeklyWildcatProfile`.
