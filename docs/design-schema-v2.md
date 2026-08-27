# Design schema v2 and the homepage package architecture

Status: **complete for the eight homepage packages; v1 fallback retained**. The
public static site and WordPress Studio now resolve schema-v2 documents into the
same render-ready models and use the same package renderers. Published schema-v1
documents still use the frozen whole-page fallback until the visible divider
block has a faithful semantic representation.

## The invariant

```
schema-v2 document
        ↓
one homepage resolver       apps/web/lib/homepage-resolution.ts
        ↓                    wordpress-plugin/src/studio-preview.tsx
resolved package models
        ↓
one shared renderer          packages/ui
      ↙       ↘
  Studio     Next static site
```

The transports differ — build-time WordPress records in Next and authenticated
REST records in Studio — but the renderer never receives WordPress, Puck, or
endpoint-shaped data.

## Package contract

`BYLINE_PACKAGE_TYPES` is the stable persisted order of the supported homepage
package family:

1. `lead-package`
2. `brief-package`
3. `in-focus-package`
4. `special-coverage-package`
5. `opinion-package`
6. `sports-package`
7. `more-package`
8. `newsletter-package`

`packages[]` is the only ordering model. Package ids are stable instance ids,
so reorder, duplicate, and delete operations in Studio do not depend on array
positions. The schema rejects repeated ids and repeated manual story placement.

Each package has a dedicated contract, defaults, parser, resolver, and shared
renderer. Story sources use newsroom concepts (`latest`, `section`, `author`,
or `manual`) rather than REST queries. The Weekly Wildcat seed additionally
uses explicit `compatibility-*` sources to select the historical slots without
leaking that selection algorithm into neutral publications.

## Weekly Wildcat compatibility

`getWeeklyWildcatCompatibilityDesign()` registers all eight packages in the
historical order. `resolveCompatibilityHomepageSelection()` remains the one
ordered selection pass:

1. athlete spotlight
2. sticky lead
3. In Focus
4. Special Coverage
5. Opinion
6. Sports
7. More
8. The Latest
9. The Brief

Manual ids are collected from every package with
`collectPinnedStoryIds()` before that pass starts. Resolvers then consume the
same page-wide used set in document order. This preserves late The Latest
selection, reserves a story pinned into a late package, and prevents automatic
cross-package duplicates. Duplicate manual placement is rejected by both the
TypeScript schema parser and the WordPress storage validator.

The default package props retain the production surface: headings, copy,
archive links, story variants, poll/calendar/newsletter slots, rendered sports
counts, and the More utility rail. Module flags are reconciled in resolution;
the design cannot turn on polls, events, sports, or newsletter for a
publication that has disabled them.

## Resolution and rendering

`resolveHomepageDocument()` is the only homepage orchestrator. It:

- reads the document in its declared order;
- gathers pins and computes the compatibility selection once;
- resolves each package into a presentation-neutral model;
- claims resolved stories in one page-wide set; and
- returns a discriminated package union to `<HomepagePackages>`.

`<HomepagePackages>` only dispatches models to theme-selected renderers. The
page itself owns the static-export shell, data fetching, and runtime slots for
the poll, calendar, rail limiter, and newsletter form. It contains no manual
homepage section tree.

Runtime slots are context-aware. Repeated packages receive unique heading,
section, poll, calendar, and newsletter ids; the default package ids preserve
the historical ids used by existing CSS and accessibility checks.

Structured sports records are flattened into `SportsResultView`,
`SportsFixtureView`, and `AthleteSpotlightView`. Sports content modes support a
full package, stories-only package, or schedule-only package, which lets v1
schedule and team-feature blocks migrate without rendering an unrelated module.

## Migration

`migrateDesignDocumentV1ToV2()` is deterministic and order-preserving. It maps:

| v1 block | v2 package |
|---|---|
| `story-lead` | `lead-package` |
| `story-list`, `latest-stories`, `section-feed` | `brief-package` |
| `featured-story`, `photo-feature` | `in-focus-package` |
| `special-coverage` | `special-coverage-package` |
| `opinion-package` | `opinion-package` |
| `sports-scores`, `sports-upcoming` | one schedule-only `sports-package` |
| `team-feature`, `athlete-feature` | stories-only `sports-package` |
| `story-grid` | `more-package` |
| `events-list` | calendar-only `lead-package` |
| `poll` | poll-only `lead-package` |
| `newsletter` | `newsletter-package` |

The two legacy sports schedule blocks collapse to one package because the v1
renderer displayed only the first sports layout and that panel contained both
finals and upcoming games. Duplicate package ids are made deterministic and
unique while preserving the requested id as the first choice.

Structural-only or unknown v1 blocks (`section`, `columns`, and future
extensions) are copied verbatim into `legacy.unconvertedBlocks` and reported in
`warnings`. `divider` is preserved separately even though it is not structural:
the old renderer emits a visible `<hr class="byline-design-divider" />`. They
remain outside Puck and are threaded through every Studio autosave and publish.
A known block is never both converted and preserved.

Published schema 1 envelopes are normalized through this migration for Studio
and package consumers. Studio migrates on load, so the editor only operates on
schema 2. The live homepage intentionally branches to the frozen v1 renderer
for published schema-v1 documents while the parity gate is open; this prevents
divider and any future visible legacy block from disappearing on publish.

## Schema and storage safety

Schema 2 stores no `editor`, `layout`, component name, CSS class, endpoint, or
function. Props must be plain serializable JSON. TypeScript and PHP both enforce
package ids, package types, source shapes, size limits, unsafe-property rules,
and duplicate manual pins. WordPress accepts old schema 1 records for migration
and writes schema 2 from Studio.

The neutral starter registers the same package family but uses generic headings,
normal story sources, disabled utility assumptions, and no Weekly Wildcat
identity. A second publication therefore does not inherit Weekly Wildcat
content or module conventions merely because it has not published a design.

## Themes and CSS

`packages/ui/src/package-renderers.ts` selects a renderer by semantic package
type and theme id. Theme selection changes presentation only; it cannot change
story selection or capability reconciliation. Unknown themes fall back to the
safe base renderer.

Homepage package CSS lives in the shared theme stylesheet and is scoped under
`.byline-publication-preview`, which is loaded by both the Next layout and the
Studio preview iframe. Article-only newsletter rules remain in the app global
stylesheet; homepage newsletter and More utility rules belong to the theme.

## Verification references

The compatibility baseline is
`apps/web/tests/baseline/homepage-structure.json`. Frozen schema-v1 renderer
parity is covered by
`apps/web/tests/baseline/pre-migration-design-homepage.tsx`,
`apps/web/tests/fixtures/v1-homepage-parity.json`, and
`apps/web/tests/v1-render-parity.test.tsx`. Focused tests cover package parsers,
migration, pin reservation, resolver order, duplicate placement, shared
renderers, Studio round trips, feature gates, and static-export safety;
`apps/web/tests/homepage-resolution.test.ts` covers whole-document order,
omission/reordering, late pin reservation, and ten-game calendar planning.
