# Byline architecture

Byline separates a newspaper's durable editorial data and settings from its
static public presentation.

## Applications and contracts

- WordPress plus the legacy-compatible Byline plugin are the control plane.
  WordPress owns stories, people, pages, sports, events, publication settings,
  designs, revisions, capabilities, and protected integration credentials.
- The Next.js app is a build client. It reads public `/byline/v1` contracts,
  resolves bounded content queries, and emits an `output: "export"` site plus a
  safe `/_byline/manifest.json`. It has no database, auth, SSR, image optimizer,
  server actions, or required runtime server.
- Shared workspace packages define publication, content-query, design, Studio,
  theme, and React 18/19-compatible UI contracts. Official themes consume data
  through normalized props and never fetch WordPress directly.
- The Discord bot is an optional stateless newsroom service. It is built and
  deployed separately and is excluded from the WordPress release archive.

The plugin remains in its established repository and installed path during the
repository transition. GitHub releases still publish
`weekly-wildcat-headless.zip`; canonical Byline APIs adapt to legacy CPTs,
metadata, options, routes, and environment names so existing installations are
not stranded.

## Three customization levels

1. **Configure** — administrators use the Byline WordPress area for identity,
   location/language, branding and Media Library assets, semantic appearance
   tokens, sections, navigation/footer groups, social links, licensing/SEO,
   optional modules, teams, and deployment. Public configuration is versioned
   and excludes secrets.
2. **Design** — Byline Studio bundles Puck inside a normal authenticated
   WordPress admin page. It uses cookie/nonce REST, an isolated preview iframe,
   newspaper block IDs, bounded queries/IDs, autosaves, publish capabilities,
   revisions, and optimistic locking. Designs wrap Puck data in the Byline
   schema and never store generated HTML, CSS, or executable code.
3. **Extend** — trusted administrator-installed packages register namespaced
   themes, blocks, variants, and optional-module mappings. See
   [extensions.md](extensions.md). Level 1 and 2 input remains strictly
   allowlisted and cannot inject executable code.

## Publication and design lifecycle

The public publication payload drives identity, URLs, theme tokens, sections,
navigation, social links, feature gates, licensing, and SEO. A fresh install is
seeded from WordPress locale/timezone and site identity. Only a recognized
Weekly Wildcat host receives the exact compatibility fixture.

Published design documents and per-user autosaves are separate. Publishing
validates schema/size/blocks/queries/features, compares the submitted base
revision, creates a WordPress revision, promotes the document, clears that
user's autosave, and coalesces a deployment trigger. Restoring a revision creates
an unpublished draft. Static builds read only published documents and fail
clearly on incompatible schemas or unsupported theme blocks.

Story blocks store `StoryQuery` rules or WordPress IDs. Production resolution
walks blocks in order with one layout-wide used-ID set; duplicates are excluded
unless `allowDuplicates` is explicitly enabled. Missing optional data collapses
the block, while incompatible required contracts fail the build.

## Security and operations

Public responses and build artifacts contain only versionable publication and
design state. Deploy hooks, Discord/OAuth/bridge secrets, and API credentials
remain in protected WordPress options, constants, or service environments.
Privileged REST routes require explicit Byline capabilities and WordPress
cookie/nonce authentication. Diagnostics expose versions, health, compatibility,
module and deployment status, but never raw URLs, tokens, or credentials.

Deployment uses a provider filter and ships a generic HTTPS POST hook with
Cloudflare, Netlify, Vercel, and GitHub Actions as examples. The CMS and Studio
remain usable before the first deployment and whenever the public site is
unreachable.
