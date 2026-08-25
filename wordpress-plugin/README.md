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

## Discord newsroom integration

The repository also contains `discord-bot/`, a stateless TypeScript/discord.js service. WordPress remains canonical for stories and durable links. A meaningful WordPress draft is queued for a Forum thread; an ordinary Discord Forum post remains only a pitch until `/story create` or **Apps → Create Weekly Wildcat story** is used. The WordPress release ZIP deliberately excludes the bot.

### Commands

- `/story create`, `info`, `open`, `status`, `assign`, `deadline`, and confirmation-gated `unlink`
- `/stories mine` and `/stories due`
- `/editing`, `/announce`, and `/sync`
- Message command **Create Weekly Wildcat story**

Commands are guild-scoped. At startup the bot compares normalized registered definitions with the desired definitions and updates Discord only when they differ.

### Initial setup

1. In the Discord Developer Portal, create an application and bot user. Leave Message Content, Server Members, and Presence intents disabled.
2. Add this OAuth redirect URL: `https://YOUR-WORDPRESS-HOST/wp-admin/admin-post.php?action=wwh_discord_oauth_callback`.
3. Install with scopes `bot applications.commands`. Do not grant Administrator.
4. On the storyboard Forum and announcements channel grant View Channel, Send Messages, Embed Links, and Read Message History. On the Forum also grant Send Messages in Threads and Manage Threads. Grant Manage Channels on the Forum while Wildcat provisions missing workflow tags (it may be removed after all nine tags exist). No Manage Roles, moderation, or privileged-intent permissions are required.
   If `/announce` should notify staff, make only the configured staff role mentionable; Wildcat still restricts allowed mentions to that exact role ID.
5. Copy Discord's guild, storyboard Forum, announcements channel, and optional staff role IDs into the bot environment.
6. Set the same high-entropy bridge secret in WordPress and the bot. Configure WordPress constants/environment values, build the bot with `npm ci && npm run build`, then start it with Docker or `npm start`.
7. Check `GET /healthz`, the Discord section under **Settings → Weekly Wildcat Bridge**, account linking on a WordPress profile, `/story create`, WordPress-first draft creation, and a test publication.

An install URL can be built in Developer Portal's OAuth2 URL Generator using the scopes and permissions above. Do not use an Administrator permission bitfield; channel overrides are preferred so Wildcat can access only the newsroom channels it needs.

### Configuration

WordPress reads these constants first, then environment variables:

- `WWH_DISCORD_BRIDGE_SECRET` — shared HMAC-SHA256 secret
- `WWH_DISCORD_BOT_URL` — internal bot URL, such as `http://wildcat:3000`
- `WWH_DISCORD_CLIENT_ID` and `WWH_DISCORD_CLIENT_SECRET` — OAuth account-linking credentials

The bot uses:

- `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`
- `WWH_DISCORD_GUILD_ID`, `WWH_DISCORD_STORYBOARD_CHANNEL_ID`, `WWH_DISCORD_ANNOUNCEMENTS_CHANNEL_ID`
- optional `WWH_DISCORD_STAFF_ROLE_ID`
- `WWH_WORDPRESS_URL`, `WWH_DISCORD_BRIDGE_SECRET`
- optional `WWH_HTTP_HOST`, `WWH_HTTP_PORT`, `WWH_RECONCILE_INTERVAL_MS`, `WWH_PUBLICATION_ANNOUNCEMENTS`, and `LOG_LEVEL`

No database migration or second WordPress plugin is needed. Activating/updating Weekly Wildcat Bridge registers the new private metadata, and existing stories receive Discord links only when they are meaningfully saved or already linked and reconciled.

Use HTTPS whenever traffic leaves a trusted private container network. Secrets are never stored in story/user metadata or returned from health endpoints. Rotate the bot token in Developer Portal, replace `DISCORD_TOKEN`, and restart. Rotate the bridge secret by changing both services in one maintenance window; reconciliation repairs updates missed during the restart.

### Operations and recovery

WordPress save/publish hooks only schedule work; Discord failure never fails an editor's save. Startup and periodic reconciliation repair missed updates. Deleted status cards are recreated and their IDs replaced. A deleted linked thread is intentionally surfaced as an error instead of automatically creating repeated replacement threads; an editor should unlink, create/recover the desired Forum discussion, and promote/link it again. Disconnect an account from its WordPress profile.

The bot creates missing managed workflow tags only when it has Manage Channels. It preserves unrelated tags and enforces one managed workflow tag. If the Forum's 20-tag or thread's 5-applied-tag limit prevents reconciliation, `/healthz` and logs report it. Application commands acknowledge network-backed work ephemerally, and all outgoing messages disable parsed mentions except the exact newly assigned user or configured staff role.

### Development and deployment

`discord-bot/Dockerfile` uses Node 24 LTS, deterministic `npm ci`, a non-root runtime user, a health check, and graceful shutdown. `discord-bot/compose.example.yml` shows a loopback-bound deployment. Run:

```sh
cd discord-bot
npm ci
npm run typecheck
npm test
npm run build
```

The HMAC signature covers timestamp, method, REST route, and raw body. Requests older/newer than five minutes are rejected with constant-time comparison. Mutations use request IDs and durable WordPress link/message IDs so retries and restarts converge without duplicate posts, threads, cards, or publication announcements.
