# Newsroom blocks

Byline's newsroom library is a small set of publication-neutral Gutenberg
blocks for authored Pages and Posts. The blocks are stored as normal Gutenberg
comment markup, so an editor can move, copy, and revise them without creating a
second page or publishing system.

## Block set

- **Stories** reads published Posts from the latest, category, tag, author, or
  manual source. It supports a bounded count, grid/list/featured layouts, and
  optional image, excerpt, byline, and date fields.
- **People** reads public author profiles, with all/selected sources, the
  existing role field as an optional filter, and portrait-grid or compact-list
  layouts.
- **Sports Schedule** reads canonical published game records and separates
  upcoming games from recent results. Team, season, display mode, and bounded
  counts are stored as block attributes.
- **Events** reads upcoming canonical events, keeps the WordPress site timezone
  for comparisons and display, and optionally filters by the existing event
  type.
- **Poll** reads either the active poll or a selected published poll. The
  server-rendered payload is public-safe; the static Next site hydrates open
  polls with the existing `/api/polls/active` and `/api/polls/vote` contract and
  its `ww_voter_id`/`ww_poll_voted_<pollId>` cookies.
- **Game Score** follows the article's Primary Game by default. A manual game
  is an explicit fallback, but the block never asks an editor to duplicate
  scores, status, location, or date data.
- **Correction Notice** is static content: type, date, and notice text are
  serialized in the post and do not create a database record.

Dynamic blocks use the same canonical WordPress data that powers the public REST
aliases. Editor previews request only public story, author, game, event, and
poll fields; private workflow data and low-count poll totals are not exposed.
Published-only filters, bounded limits, and server-side validation apply again
when content is rendered.

## Game-card compatibility

The older automatic article game card remains available for legacy content. A
structured `byline/game-score` block records its resolved game ID in the post
REST settings. The static article renderer suppresses the legacy card only when
that list contains the article Primary Game. If an editor deliberately chooses
a different manual game, both cards remain, making the choice deterministic and
visible. The legacy `ww_*` metadata, routes, cookies, and card markup remain
unchanged for existing consumers.

## Publication identity and styles

The `byline/publication` block-binding source exposes only safe public values:
publication name, short name, public site URL, masthead URL/alt text, and
contact URL. The source is feature-detected so older supported WordPress
installations continue to load the plugin.

The plugin registers reusable styles for groups, buttons, button groups,
quotes, pullquotes, separators, Details, tables, images, galleries, and lists.
They are presentation variants of Core blocks, not replacement block types.
The shared stylesheet is publication-neutral; a theme supplies its tokens.

Page and Post patterns are starter content, not a locked template system. Page
patterns cover information, mission, standards, recruiting, contact,
leadership, staff, special coverage, sports, events, photo-led, resources,
FAQ, two-column, CTA, facts, key numbers, quotes, related resources, and
corrections. Post patterns cover sports recap/preview, correction, fact box,
and quote callout. WordPress's Blank option remains available, and there is no
newsletter block or newsletter pattern in this library.

## Static-site and accessibility rules

The public Next application stays a static export. WordPress renders dynamic
block HTML during the content fetch; the Next app imports the same shared CSS,
and only open polls receive a small client hydration layer. Empty results use a
plain explanatory state, malformed dates are ignored, scores are shown only
when the canonical record supplies them, and upcoming games never display
invented scores or live status. Lists, headings, forms, labels, time values,
focus states, and responsive layouts are part of the shared contract.
