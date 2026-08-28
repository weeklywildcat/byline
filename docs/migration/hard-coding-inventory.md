# Byline hard-coding inventory

Status: Phase 0 baseline, audited against `byline` at `80faf7c` and
`byline-plugin` at `9f35bb8` on 2026-08-25.

This inventory classifies the existing behavior before it is generalized. A
name in this document is not automatically a rename target. In particular,
legacy identifiers are compatibility contracts until a tested adapter or data
migration replaces them.

## 1. Publication identity

### Frontend

- `app/layout.tsx`, `app/page.tsx`, route metadata, author/category/search
  pages, and several shared components embed the publication name `Weekly
  Wildcat` and the staff fallback `Weekly Wildcat Staff`.
- `components/SiteHeader.tsx` embeds `Ninety Six, S.C.`, `en-US`,
  `America/New_York`, the Weekly Wildcat masthead asset, and its accessible
  label.
- `components/SiteFooter.tsx` embeds the school description, street address,
  contact/navigation groups, and publication-specific URLs.
- `lib/seo.ts` embeds the publication name and description, publisher logo,
  default social image, copyright notice, image-license URL, and `en_US`
  OpenGraph locale.
- `lib/wordpress.ts`, `lib/media.ts`, `lib/headless.ts`, and sports client
  components default to `cms.weeklywildcat.com`, `weeklywildcat.com`, and a
  Weekly Wildcat build user-agent.
- The former `lib/static-pages.ts` publication page catalog has been retired;
  normal page prose now lives in WordPress Pages and is exported through the
  `wp/v2/pages` build input. This is publication content, not platform code.
- `app/media-kit/page.tsx`, `NewsletterSignupForm`, and the homepage utility
  rail embed publication assets, Kit, Instagram, and TikTok URLs.
- Sports views embed `Ninety Six Wildcats`, `Ninety Six High School`, and a
  `Wildcats` scoreboard label.

### WordPress plugin and Discord service

- The plugin header, settings pages, CMS redirect/login UI, notices, image
  credits, and email-domain-restricted Google login identify Weekly Wildcat.
- `https://weeklywildcat.com/`, `@weeklywildcat.com`, the bundled logo, a
  particular Unsplash photo/topic attribution source, and Weekly Wildcat bot
  labels are embedded in user-facing behavior.
- Discord commands, errors, embed/reconciliation reasons, and WordPress URLs
  use Weekly Wildcat/Wildcat language.

Migration destination: versioned publication configuration, with seeded Weekly
Wildcat defaults on upgrade. Google hosted-domain restrictions and login
customization remain optional installation-level access settings.

## 2. Branding and design

- `app/globals.css` is 6,390 lines. Its root has useful semantic seeds
  (`page`, `paper`, `ink`, `muted`, `rule`, `accent`, widths, font roles), but
  component structure and Weekly Wildcat presentation are interleaved.
- The active font roles resolve to an Adobe Typekit kit loaded from
  `app/layout.tsx`. The kit and named Adobe families belong to the Weekly
  Wildcat theme, not Byline core.
- Header/masthead structure, black lead treatment, Opinion package
  presentation, sports presentation, footer colors/rainbow rule, mask asset,
  media-kit layouts, and numerous raw colors are publication-theme decisions.
- The per-post custom article hero and the per-post homepage opinion-lead
  treatment were both retired rather than migrated. Article presentation belongs
  to the article template and homepage presentation belongs to
  Studio/packages/themes, so neither was a per-story setting to carry forward.
- Sports team image, focal point, logo, and accent-color settings are reusable
  concepts currently attached to a fixed team catalog.

Migration destination: semantic design tokens and a `weekly-wildcat` theme.
Split CSS progressively after visual baselines exist; do not restyle the live
installation as part of extraction.

## 3. Editorial defaults

- `lib/sections.ts` fixes the primary navigation to News, Sports, Opinion, and
  Features, while `content.ts` fixes hidden setup content and tag/category
  semantics.
- `app/page.tsx` fixes homepage module order, labels, category/tag sources,
  selection counts, sports reservation, and a deliberate global used-post set.
- Static informational pages, footer groupings, social calls to action, media
  kit, newsletter wording, author fallbacks, and sports empty-state language
  are publication editorial choices.
- Article URLs use WordPress publication dates and the first routable category:
  `/{year}/{month}/{day}/{category}/{slug}/`. This is an existing URL contract,
  not merely editorial copy.
- WordPress sports import/export conventions, game status vocabulary, roster
  seasons, and event status vocabulary are current editorial/data defaults.

Migration destination: configured navigation/sections, saved design documents,
stable StoryQuery semantics, and WordPress Pages. Preserve URL and data
contracts while moving editable prose out of source.

## 4. Optional modules and integrations

- Sports games, teams, rosters, school events, polls, newsletter signup,
  Microsoft Clarity, media mirroring, Unsplash login backgrounds, Google SSO,
  Discord, and deployment hooks are independently optional concerns today but
  are not modeled as modules.
- Polls contradicted the intended static-only web contract: the deployment added
  a Cloudflare Worker plus a D1 database, and the poll domain was implemented
  twice outside WordPress. **Resolved.** WordPress is now the authoritative poll
  CMS and datastore, the Worker is a thin same-origin proxy with no database
  binding, the relative `/api/polls/*` contract is unchanged, and no public Next
  runtime is required. See [../polls.md](../polls.md).
- Deployment is named and presented as Cloudflare although its useful core is a
  coalesced HTTPS POST hook.
- Discord has its own Node project and is correctly excluded from the plugin
  ZIP; it must remain separately buildable and optional.

Migration destination: explicit feature flags and provider contracts. Secrets
remain private WordPress options, constants, or environment variables.

## 5. Stable internal storage and public contracts

- WordPress core REST (`wp/v2`) with `_embed=1`, pagination headers, published
  posts/users/categories/media, and local media mirroring.
- Article/category/author/sports/static-page URLs and trailing slashes.
- Existing custom REST response shapes for sports, rosters, events, authors,
  article display settings, image licensing, and Discord newsroom operations.
- Game and roster records reference controlled team keys; article game embeds
  store a game post ID rather than copied game data.
- Scores are exposed only for completed result statuses; drafts are excluded
  from public roster/event/game responses.
- Coalesced deploy scheduling and the separation between content saves and
  asynchronous Discord synchronization.
- The plugin updater reads GitHub releases from `weeklywildcat/byline-plugin`
  and requires `weekly-wildcat-headless.zip` containing the installed
  `weekly-wildcat-headless/weekly-wildcat-headless.php` path.
- The frontend must retain `output: "export"`, trailing slashes, unoptimized
  images, static generation, and no WordPress frontend theme dependency.

Migration destination: normalized Byline contracts with compatibility adapters,
not destructive renames.

## 6. Legacy identifiers to preserve

The following identifiers are explicitly compatibility-sensitive:

- plugin folder/main file/update slug and asset:
  `weekly-wildcat-headless/weekly-wildcat-headless.php`,
  `weekly-wildcat-headless`, `weekly-wildcat-headless.zip`;
- update repository: `weeklywildcat/byline-plugin`;
- PHP symbols and configuration aliases: `WWH_*`, `wwh_*`;
- options, transients, cron hooks, nonces, actions, cookies, and script handles
  beginning with `wwh_`, `_wwh_`, or `ww_`;
- custom post types: `ww_sports_game`, `ww_sports_roster`, `ww_school_event`;
- sports/event/author/article metadata beginning `_ww_*`, plus
  `weekly_wildcat_primary_game_id`;
- REST namespace `weekly-wildcat/v1` and public fields
  `weeklyWildcatProfile`, `weeklyWildcatImage`, and `weeklyWildcat`;
- editor extension/block IDs `weekly-wildcat-primary-game` and
  `weekly-wildcat/game-embed`;
- Discord environment variables and signature headers using the `WWH_`/WWH
  prefix;
- current team keys such as `football-varsity`, which existing games and
  rosters reference;
- public poll cookie names (`ww_voter_id`, `ww_poll_voted_<pollId>`), their
  signature format, and their voter-key derivation, so the completed
  Cloudflare-to-WordPress poll migration does not reset every existing visitor.

The initial Byline public API will sit above these identifiers. Legacy routes
and fields remain aliases until all known consumers and installed data have
been verified against the replacement.

