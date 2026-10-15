# Byline architecture

Byline separates a newspaper's durable editorial data and settings from its
static public presentation.

## Applications and contracts

- WordPress plus the legacy-compatible Byline plugin are the control plane.
  WordPress owns stories, people, pages, sports, events, polls and poll votes,
  publication settings, capabilities, and protected
  integration credentials.
- The Astro app is a static build client. It reads public `/byline/v1` and
  legacy-compatible sports contracts through a single memoized build snapshot,
  then emits static HTML, CSS, small React islands, media, and a safe
  `/_byline/manifest.json`. It has no database, auth, SSR, server actions, image
  optimizer, Cloudflare adapter, or required runtime application server.
- `@byline/content` owns framework-independent indexing, deterministic digests,
  route normalization, redirect validation, snapshot construction, and media
  identities. Astro pages consume those contracts instead of independently
  rediscovering WordPress relationships.
- Shared workspace packages define publication, content-query, homepage package,
  Weekly Wildcat theme, and React UI contracts. Renderers consume normalized
  props and never fetch WordPress directly.
- Editorial workflow is a first-class Byline domain, separate from WordPress
  publication state. It owns a story's stage, assigned editor, deadline, and
  visual needs, and integrations consume it rather than owning it. See
  [editorial-workflow.md](editorial-workflow.md).
- The Discord bot is an optional stateless newsroom service. It is built and
  deployed separately and is excluded from the WordPress release archive. It is
  a consumer of the editorial workflow domain, not its owner.

The plugin source lives under `wordpress-plugin/` while retaining its installed
path and main file. Canonical GitHub releases still publish
`weekly-wildcat-headless.zip`; canonical Byline APIs adapt to legacy CPTs,
metadata, options, routes, and environment names so existing installations are
not stranded. The standalone repository remains available for historical
releases and the updater bridge.

## Homepage and publication settings

The homepage always uses `getWeeklyWildcatHomeDesign` in `packages/design/src/home-design.ts`. Its fixed order is Lead, Brief, In Focus, Special Coverage, Opinion, Sports, More, and Newsletter. Shared content resolvers select stories automatically with layout-wide deduplication and the sticky lead rule. Missing optional content collapses its section.

The Weekly Wildcat theme is the only theme. Appearance overrides and stored designs cannot alter the public layout. WordPress still owns identity, branding, navigation, feature flags, and editorial content. Historical design posts remain registered privately; no design read, autosave, publish, or scheduling routes are registered. Pending historical design schedules no longer run. No stored records are deleted.

## Security and operations

Public responses and build artifacts contain only public publication settings. Deploy hooks, Discord/OAuth/bridge secrets, and API credentials
remain in protected WordPress options, constants, or service environments.
Privileged REST routes require explicit Byline capabilities and WordPress
cookie/nonce authentication. Diagnostics expose versions, health, compatibility,
module and deployment status, but never raw URLs, tokens, or credentials.

Deployment uses a provider filter and ships a generic HTTPS POST hook with
Cloudflare, Netlify, Vercel, and GitHub Actions as examples. The CMS admin tools
remain usable before the first deployment and whenever the public site is
unreachable.

The Cloudflare Worker and `wrangler.jsonc` are unchanged by the renderer switch:
static assets still come from `apps/web/out`, while `/api/*` continues through
the poll proxy. See [migration/astro.md](migration/astro.md) for the build graph,
verification reports, cache invalidation, and rollback procedure.

## Sports archive

Custom sports management has been removed. A versioned plugin upgrade converts published game and roster records into ordinary Pages, grouped by sport, season, and team level. The original records and read APIs remain available; editing is denied. Astro renders the Pages, indexes their contents for search, and redirects historical team and season URLs. See [sports-archive.md](sports-archive.md) for conversion and recovery details.

## Runtime poll state

Polls are the one piece of publication state that changes between builds, so they
are the one place the static site talks to a runtime API. WordPress is the
authoritative datastore: poll definitions are a `byline_poll` post type, votes
are a dedicated `wp_*_byline_poll_votes` table, and `/byline/v1/polls/*` is the
public API. The static frontend calls the relative, publication-agnostic
`/api/polls/*`, which a thin same-origin host proxy forwards to WordPress.

That proxy owns no poll logic and no database binding: it exists so poll cookies
stay first-party, CORS stays out of the picture, and the CMS hostname stays an
implementation detail. There is no Cloudflare D1 dependency, and no poll change
requires a rebuild. See [polls.md](polls.md).
