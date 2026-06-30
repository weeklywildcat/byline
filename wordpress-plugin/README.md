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

The plugin does not render anything on the WordPress frontend. Editing stays inside the normal WordPress admin.

## Install

Upload the `weekly-wildcat-headless` folder to `wp-content/plugins/`, then activate **Weekly Wildcat Headless** in WordPress.

## Deploy

For the first install, zip this folder and upload it in WordPress admin under Plugins > Add Plugin > Upload Plugin.

For repeat deploys, pull this repository or upload the folder contents to:

`wp-content/plugins/weekly-wildcat-headless`

Then confirm the plugin is active in WordPress admin.

## Notes

- Sports Games use one record for scheduled games and final scores.
- Sports Games include a controlled Sport / Team dropdown for stable frontend filtering.
- Sports Games expose `sportKey`, `sportLabel`, location name, address, latitude, longitude, and optional Apple Maps place ID.
- Scores are returned publicly only when a game status is `final`.
- School Events support scheduled and canceled statuses.
- The Next.js frontend has typed helpers ready in `lib/headless.ts`, but these endpoints are not rendered on the homepage yet.
