# Byline for WordPress

WordPress control plane for the open-source Byline publishing platform.

The plugin provides publication settings, first-party theme selection, Byline
Studio, private design storage with autosaves and revisions, sports/events
content, and integrations. Its versioned `/byline/v1` API separates public
static-build data from capability-protected admin operations.

The legacy installed folder, `weekly-wildcat-headless.php` entrypoint,
`weekly-wildcat/v1` REST routes, storage identifiers, updater slug, and ZIP name
remain unchanged. The live `v0.2.1` bridge moved future update checks from the
standalone plugin repository to the canonical Byline monorepo.

The admin bundle uses WordPress-provided React through `@wordpress/element` and
dependency extraction. It does not ship a second React runtime. Puck and its
styles are compiled into release assets.

## What It Adds

- Admin sidebar item: Sports Games
- Admin sidebar item: School Events
- Admin sidebar item: Polls
- Custom post type: `ww_sports_game`
- Custom post type: `ww_school_event`
- Custom post type: `byline_poll`
- Custom table: `{prefix}byline_poll_votes`
- Public read-only REST endpoints:
  - `/wp-json/byline/v1/publication`
  - `/wp-json/byline/v1/designs`
  - `/wp-json/byline/v1/polls/active`
  - `/wp-json/byline/v1/polls/{id}/results`
  - `/wp-json/byline/v1/sports/teams`
  - `/wp-json/byline/v1/sports/games`
  - `/wp-json/byline/v1/sports/rosters`
  - `/wp-json/byline/v1/events`
  - `/wp-json/byline/v1/authors`
  - legacy `/wp-json/weekly-wildcat/v1/*` aliases, including:
    - `/wp-json/weekly-wildcat/v1/sports-games`
    - `/wp-json/weekly-wildcat/v1/sports-games/upcoming`
    - `/wp-json/weekly-wildcat/v1/sports-games/recent`
    - `/wp-json/weekly-wildcat/v1/sports-teams`
    - `/wp-json/weekly-wildcat/v1/sports-rosters`
    - `/wp-json/weekly-wildcat/v1/school-events`
    - `/wp-json/weekly-wildcat/v1/authors`
- Public write endpoint (anonymous, rate limited): `/wp-json/byline/v1/polls/vote`
- WordPress user profile fields for author profiles:
  - role, pronouns, Media Library profile photo, Founder badge, author directory visibility, and social links

The plugin does not render anything on the WordPress frontend. Editing stays inside the normal WordPress admin.

## Polls

**Polls** is a normal WordPress post type with its own capability family, so
running polls does not require `manage_options`. WordPress is the authoritative
poll datastore: poll definitions live in `byline_poll` posts and individual votes
live in a dedicated `{prefix}byline_poll_votes` table with a
`UNIQUE (poll_id, voter_key)` duplicate guard. There is no external poll
database.

Voting is anonymous. A signed first-party cookie carries an opaque voter id; only
a one-way key derived from it is ever stored. No login, email, name, fingerprint,
or full IP address is required or recorded. Public per-answer results stay
withheld until five people have responded, enforced by the API and not only by
the UI.

The signing secret is server-side only. Set `BYLINE_POLL_COOKIE_SECRET` in
`wp-config.php` to pin it — required when migrating an existing poll installation
so already-issued cookies keep validating — or let the plugin generate a stable
per-site secret. `wp byline polls secret` reports which source is active without
printing the value.

WP-CLI:

```sh
wp byline polls install-schema                    # create the vote table (useful on multisite)
wp byline polls secret                            # report the signing-secret source
wp byline polls import <file.json>                # import poll definitions and votes
wp byline polls import <file.json> --dry-run       # report only, writes nothing
wp byline polls import <delta.json> --votes-only   # final cutover delta: votes only, never touches poll content
wp byline polls verify <file.json>                 # compare source and destination counts
```

Import and verify guarantee poll storage exists before touching data -- WP-CLI
never fires `admin_init`, so this cannot be assumed. Importing vote history
while WordPress is on an automatically generated signing secret is refused,
since those voter keys could never match an existing visitor's cookie; pass
`--allow-generated-secret` only for a fresh publication with no continuity to
preserve.

See [docs/polls.md](../docs/polls.md) for the content model, REST contract, host
proxy, capability model, and the Cloudflare D1 migration and cutover runbook.

## Deployment hooks

**Byline → Integrations → Deployment** configures the Generic Deploy Hook provider. Byline coalesces content and design changes for 60 seconds, then sends an HTTPS `POST`. The same contract works with Cloudflare, Netlify, Vercel, GitHub Actions, or another webhook-triggered static builder. The hook URL is capability protected, never returned by REST or diagnostics, and the legacy Cloudflare option/function names remain read-compatible for installed sites.

## Install

Upload the `weekly-wildcat-headless` folder to `wp-content/plugins/`, then activate **Byline** in WordPress.

## Deploy

For the first install, zip this folder and upload it in WordPress admin under Plugins > Add Plugin > Upload Plugin.

After the plugin is active, WordPress checks GitHub releases from:

`https://github.com/weeklywildcat/byline`

### Updater repository bridge

Version `0.2.1` is the final compatibility bridge released from the standalone
`weeklywildcat/byline-plugin` repository. Existing installations discover that
release through the historical repository, install the unchanged
`weekly-wildcat-headless/weekly-wildcat-headless.php` path, and then check the
canonical `weeklywildcat/byline` repository for future releases. The plugin
slug, release ZIP name, CPTs, metadata, options, and legacy REST identifiers are
unchanged. The standalone repository and its historical releases must remain
available until the bridge has been deployed and observed in production.

Enable auto-updates for **Byline** in WordPress admin if you want future releases installed automatically.

## Release Updates

Only tagged releases are used for WordPress updates. Normal pushes to `main` do not deploy to the CMS.

To publish an update:

1. Update the `Version:` header in `wordpress-plugin/weekly-wildcat-headless.php` and `wordpress-plugin/package.json`.
2. Commit and push the change to `main`.
3. Create and push a matching tag, for example:

   ```sh
   git tag v0.2.2
   git push origin v0.2.2
   ```

GitHub Actions packages `weekly-wildcat-headless.zip` and publishes it as a release asset. WordPress uses that release asset for plugin updates.

Before packaging, the workflow installs the monorepo workspace, runs the admin
tests/typecheck/build and PHP syntax/regression matrix, verifies React remains a
WordPress external, and validates the ZIP. The release excludes raw admin
source, dependencies, tests, repository metadata, the frontend, and Discord.

For local plugin/admin verification:

```sh
npm ci
npm run test:plugin
npm run typecheck:plugin
npm run build:plugin
npm run test:php
npm run package:plugin
```

## Notes

- Sports Games use one record for scheduled games, final scores, ties, forfeits, postponements, and cancellations.
- Teams are configurable entities with stable keys, names, level/division, slug, active state, marks, focal point, and accent color. Existing Weekly Wildcat keys migrate unchanged, and removing a team from a replacement payload retains it as inactive so old games and rosters continue to resolve.
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

The monorepo also contains `apps/discord-bot/`, a stateless TypeScript/discord.js service. WordPress remains canonical for stories and durable links. A meaningful WordPress draft is queued for a Forum thread; an ordinary Discord Forum post remains only a pitch until `/story create` or the publication-named message command is used. The WordPress release ZIP deliberately excludes the bot.

### Commands

- `/story create`, `info`, `open`, `status`, `assign`, `deadline`, and confirmation-gated `unlink`
- `/stories mine` and `/stories due`
- `/editing`, `/announce`, and `/sync`
- Message command **Create {publication short name} story**

Commands are guild-scoped. At startup the bot compares normalized registered definitions with the desired definitions and updates Discord only when they differ.

### Initial setup

1. In the Discord Developer Portal, create an application and bot user. Leave Message Content, Server Members, and Presence intents disabled.
2. Add this OAuth redirect URL: `https://YOUR-WORDPRESS-HOST/wp-admin/admin-post.php?action=wwh_discord_oauth_callback`.
3. Install with scopes `bot applications.commands`. Do not grant Administrator.
4. On the storyboard Forum and announcements channel grant View Channel, Send Messages, Embed Links, and Read Message History. On the Forum also grant Send Messages in Threads and Manage Threads. Grant Manage Channels on the Forum while Byline provisions missing workflow tags (it may be removed after all nine tags exist). No Manage Roles, moderation, or privileged-intent permissions are required.
   If `/announce` should notify staff, make only the configured staff role mentionable; Byline still restricts allowed mentions to that exact role ID.
5. Set the same high-entropy bridge secret in the WordPress and bot environments. That secret and `BYLINE_WORDPRESS_URL` are the only values the bot needs before it can start.
6. In **Byline → Integrations → Discord**, paste the bot token, application ID, and bot URL, then pick the server, storyboard Forum, announcements channel, and optional staff role from the lists Byline loads from Discord.
7. Build the bot with `npm ci && npm run build`, then start it with Docker or `npm start`. It reads the rest of its settings from WordPress at boot.
8. Check `GET /healthz`, the status panel in **Byline → Integrations → Discord**, account linking on a WordPress profile, `/story create`, WordPress-first draft creation, and a test publication.

An install URL can be built in Developer Portal's OAuth2 URL Generator using the scopes and permissions above. Do not use an Administrator permission bitfield; channel overrides are preferred so the bot can access only the newsroom channels it needs.

### Configuration

**Byline → Integrations → Discord** is the source of truth for the connection.
WordPress stores the bot token, client secret, application ID, bot URL, server,
storyboard Forum, announcements channel, staff role, announcement behavior, and
reconciliation interval. Secrets are stored write-only: the settings response
reports whether one is configured and never returns its value.

The bot fetches these settings from `GET /byline/v1/discord/config` — the same
signed bridge every other call uses — when it starts. Restart the bot after
saving so it picks up a change.

Two values are still environment-only, because the bot needs them before it can
ask WordPress for anything:

- `BYLINE_WORDPRESS_URL`
- `BYLINE_DISCORD_BRIDGE_SECRET` — shared HMAC-SHA256 secret, set identically in
  WordPress and the bot

Everything else remains readable from the environment as a fallback, so an
installation configured before this screen existed keeps running untouched. A
saved WordPress value wins; the environment fills any gap. Both sides read
canonical `BYLINE_*` names and continue to accept the matching `WWH_*` aliases:

- WordPress: `BYLINE_DISCORD_BOT_URL`, `BYLINE_DISCORD_CLIENT_ID`, `BYLINE_DISCORD_CLIENT_SECRET`
- Bot: `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, `BYLINE_DISCORD_GUILD_ID`,
  `BYLINE_DISCORD_STORYBOARD_CHANNEL_ID`, `BYLINE_DISCORD_ANNOUNCEMENTS_CHANNEL_ID`,
  optional `BYLINE_DISCORD_STAFF_ROLE_ID`, `BYLINE_PUBLICATION_NAME`,
  `BYLINE_PUBLICATION_SHORT_NAME`, `BYLINE_RECONCILE_INTERVAL_MS`,
  `BYLINE_PUBLICATION_ANNOUNCEMENTS`
- Bot process only: optional `BYLINE_HTTP_HOST`, `BYLINE_HTTP_PORT`, and `LOG_LEVEL`

No second WordPress plugin is needed. Activating/updating Byline registers the private metadata and controlled compatibility migrations; existing stories receive Discord links only when they are meaningfully saved or already linked and reconciled.

Use HTTPS whenever traffic leaves a trusted private container network. Secrets are never stored in story/user metadata or returned from health endpoints. Rotate the bot token in Developer Portal, replace it in **Byline → Integrations → Discord** (or in `DISCORD_TOKEN` for an environment-configured bot), and restart the bot. Rotate the bridge secret by changing both services in one maintenance window; reconciliation repairs updates missed during the restart.

### Operations and recovery

WordPress save/publish hooks only schedule work; Discord failure never fails an editor's save. Startup and periodic reconciliation repair missed updates. Deleted status cards are recreated and their IDs replaced. A deleted linked thread is intentionally surfaced as an error instead of automatically creating repeated replacement threads; an editor should unlink, create/recover the desired Forum discussion, and promote/link it again. Disconnect an account from its WordPress profile.

The bot creates missing managed workflow tags only when it has Manage Channels. It preserves unrelated tags and enforces one managed workflow tag. If the Forum's 20-tag or thread's 5-applied-tag limit prevents reconciliation, `/healthz` and logs report it. Application commands acknowledge network-backed work ephemerally, and all outgoing messages disable parsed mentions except the exact newly assigned user or configured staff role.

### Development and deployment

`apps/discord-bot/Dockerfile` uses Node 24 LTS, deterministic `npm ci`, a non-root runtime user, a health check, and graceful shutdown. `apps/discord-bot/compose.example.yml` shows a loopback-bound deployment. Run from the monorepo root:

```sh
npm ci
npm run typecheck:discord
npm run test:discord
npm run build:discord
```

The HMAC signature covers timestamp, method, REST route, and raw body. Requests older/newer than five minutes are rejected with constant-time comparison. Mutations use request IDs and durable WordPress link/message IDs so retries and restarts converge without duplicate posts, threads, cards, or publication announcements.
