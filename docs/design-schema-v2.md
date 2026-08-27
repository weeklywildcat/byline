# Design schema v2 and the package architecture

Status: **Phase 2A — one vertical slice.** The lead package is implemented
end-to-end. The other ten homepage packages still render through their legacy
code paths.

## The invariant

```
design document (schema v2)
        ↓
content resolver              lib/homepage-packages.ts  (Next)
        ↓                     studio-preview.tsx        (Studio)
resolved package view model   ResolvedLeadPackage
        ↓
shared renderer               @byline/ui
      ↙   ↘
  Studio   Next static site
```

Two transports, one model, one renderer. Studio has no placeholder
implementation of the lead package.

## What v2 changes

v1 persisted Puck's own `layout: { root, content }`, which made an editor
library's internal format the storage contract. v2 persists semantic packages:

```json
{
  "schemaVersion": 2,
  "template": "home",
  "theme": "weekly-wildcat",
  "packages": [
    { "id": "home-lead", "type": "lead-package", "props": { "...": "..." } }
  ]
}
```

Rules enforced by `parseBylineDesignDocumentV2`:

- package `type` values are the persisted contract and are stable
- Puck never appears in storage — no `editor`, no `layout`
- ordering belongs to the document; configuration belongs to the package
- theme is identity only
- props must be plain, serialisable JSON — no component names, no CSS classes

## The lead package

Not "a lead story" — the three-column front page:

| Setting | Meaning |
|---|---|
| `lead.source` | which story leads |
| `latest.source` / `.limit` / `.heading` / `.showBylines` | The Latest rail |
| `utility.poll` / `.calendar` / `.calendarLimit` | the left utility rail |
| `presentation.showDeck` | deck visibility |
| `presentation.opinionTreatment` | `auto` honours the per-post setting |

A design cannot switch on a module the publication has disabled; the resolver
reconciles both before the renderer sees them.

## The sports package

Not "a story list with a scoreboard" — a composite package drawing on two source
domains at once:

| Setting | Meaning |
|---|---|
| `heading` | the section heading |
| `stories.source` / `.limit` | the sports lead plus its supporting rail |
| `athleteSpotlight.enabled` / `.source` | the athlete-of-the-week treatment |
| `scores.enabled` / `.limit` | how many finals the reader sees |
| `upcoming.enabled` / `.limit` | how many fixtures the reader sees |
| `presentation.showDeck` / `.showBylines` | story display |

Two details worth knowing:

- `scores.limit` and `upcoming.limit` are **rendered** counts. The pre-Studio
  page fetched 3 and 8 and then sliced to 2 and 3; the fetch sizes are transport
  detail, so the package persists what the reader sees and the homepage sizes its
  request from the configuration (never below the original 3/8, so the default
  request and the This Week calendar it also feeds are unchanged).
- `athleteSpotlight.source` is a **narrower** union than `BylineStorySource` —
  the standing spotlight convention, or a story pinned by hand. `latest` or
  `author` would ask the spotlight treatment to render something it has no
  meaning for.

Publication capabilities stay authoritative: a publication with the sports module
off gets no structured modules at all, whatever the design asks for. The whole
package renders nothing — not an empty state — when it has no content, which is
what the pre-Studio `hasFieldSection` gate did.

Structured sports records get their own view models (`SportsResultView`,
`SportsFixtureView`, `AthleteSpotlightView`) rather than being bent into
`StoryView`. Every formatting decision — the em dash for a missing score, the
winner flags, the verdict sentence, the sport icon, the "Road final" context
line — is made in the resolver.

## Resolution order — important

`The Latest` is **not** resolved in layout order. In the pre-Studio homepage it
is the *eighth* selection, taken from what remains after In Focus, Special
Coverage, Opinion, Sports and More have claimed their stories.

Resolving it immediately after the lead would pull different stories into the
rail. The lead package therefore consumes the existing ordered pass in
`homepage-selection.ts` rather than issuing its own queries — one
de-duplication algorithm, not two.

The sports package delegates for the same reason: its stories are the *sixth*
selection and the athlete spotlight is the *first*, claimed ahead of the front
page lead so the spotlight never competes with it. An independent "newest three
in Sports" query would take stories In Focus, Special Coverage and Opinion have
already claimed, and would push different stories into More, The Latest and
The Brief.

A **manual** source is an explicit editorial override. Pinned ids are gathered
across the whole document by `collectPinnedStoryIds` and **reserved in the one
used-story set before the ordered pass runs**, so the package that pinned a story
is the only one that can show it. Without that, a story pinned into a late
package would already have been claimed by an earlier one and the pin would
silently do nothing. This is the only whole-page orchestration in place so far;
a document with no manual source produces an empty reservation and leaves the
algorithm byte-for-byte unchanged.

Package order itself lives in `packages[]` and is read through
`getHomePackageOrder`. There is exactly one ordering model, so the eventual
orchestrator inherits it rather than replacing it.

When the remaining packages are extracted, the orchestrator takes over the
ordering and this delegation goes away.

## Migration

`migrateDesignDocumentV1ToV2(document, template)` is deterministic and tested.

- `story-lead` → `lead-package` **faithfully**: v1's lead block rendered a
  single story with no rails, so the migrated package has `latest.limit: 0` and
  both utility modules off. It reproduces what the block actually rendered.
- Every other v1 block has no faithful v2 package yet. It is preserved verbatim
  under `legacy.unconvertedBlocks` and reported in `warnings` — never
  force-translated into something that would render differently.

### Why no v1 sports block converts

The four sports-related v1 blocks were each checked against what
`DesignHomepage` actually rendered for them. None has a faithful mapping onto
`sports-package`, so all four stay in `legacy.unconvertedBlocks`.

| v1 block | What it really rendered | Why it does not convert |
|---|---|---|
| `sports-scores` | `.from-field` with a heading and the **whole** schedule panel — finals *and* upcoming | Only the *first* sports-layout block on a page rendered at all; the rest returned `null`. A package cannot express "render only if I am the first of my kind". It also ignored `teamKey` entirely, and its header row carried no section link. |
| `sports-upcoming` | Identical to `sports-scores` — the same code path | Same reasons, plus converting both would produce two panels where v1 drew one. The mapping is not deterministic: neither block's `title` or `teamKey` can be said to win. |
| `team-feature` | `.from-field` with a heading and **one** story, `variant="field" showDeck showAuthor` | That is a story block, not the sports package. Converting would add the schedule panel and the section link, and change the lead's flags (`cleanDeck`, `showReadLink`). |
| `athlete-feature` | Identical to `team-feature` — it never rendered the athlete card at all | Same reasons. Mapping it onto `athleteSpotlight` would make it render something it has never rendered. |

Preserving them is the recoverable choice: a preserved block can still be
converted once the orchestrator can express these shapes, whereas a bad
conversion cannot be undone. When a block *is* converted it is removed from the
carry-forward — a block is never both converted and preserved, which
`design-schema-v2.test.ts` asserts directly.

Migration **converts but never promotes**. The faithful Weekly Wildcat design is
seeded separately in `lib/homepage-design.ts`, and the frontend still requires a
published revision before a design drives the homepage, so a half-finished
experimental draft cannot become the live front page.

## Schema capabilities

"What we write" and "what we can read" are different during the transition, so
they are different constants:

```ts
BYLINE_DESIGN_WRITE_SCHEMA_VERSION = 2     // Studio only ever persists v2
BYLINE_DESIGN_READ_SCHEMA_VERSIONS = [1, 2]
```

`parsePublishedBylineDesign` dispatches on the stored `schemaVersion` and returns
a **discriminated union**, so the compiler prevents a v1 document being handed to
a package renderer. v2 is never obtained by casting a v1 document:
`resolvePublishedDesignToV2` is the only route, and it runs the explicit
migration.

WordPress storage accepts both versions, dispatching to
`byline_validate_design_document_v2`.

In PHP the advertised number is now named
`BYLINE_DESIGN_ADVERTISED_SCHEMA_VERSION` so it cannot be misread as "the schema
we write". It deliberately stays at **1**: deployed frontends check it with
strict equality, so raising it breaks every frontend pinned to 1. It moves to 2
once schema 1 support is dropped.

## How a published design reaches the page

```
Studio editor state
  → editorStateToDesignDocument()      schema 2, no editor/layout keys
    → PUT /byline/v1/admin/design/home
      → GET /byline/v1/design/home     { document, revision, modifiedAt }
        → next-with-publication.mjs    → BYLINE_DESIGNS_JSON
          → lib/designs getPublishedDesignV2()
            → lib/homepage-design getHomeDesignDocument()
              → resolveLeadPackage()
                → LeadPackage renderer
```

There is no home-only environment variable. `BYLINE_DESIGNS_JSON` is the single
build-time source of truth for every template.

### Fallbacks are publication-aware

`getHomeDesignDocument()` returns the published design when one exists at
revision > 0. Otherwise it picks a seed **by publication**:

- Weekly Wildcat → `getWeeklyWildcatCompatibilityDesign()`, preserving live output
- everything else → `getStarterHomeDesign()`, a neutral lead with no poll,
  no calendar and no sticky-first assumption

A second publication never inherits Weekly Wildcat's homepage semantics just
because it has not published a design yet.

### Who reads which schema

Four different answers, deliberately:

| Surface | Behaviour |
|---|---|
| Published **v1** homepage design | Renders through the legacy `DesignHomepage` renderer. **Not** migrated on read. |
| Published **v2** homepage design | Renders through the package renderer path. |
| **Studio** loading a stored design | Migrates v1 to v2 explicitly; the editor only ever works in v2. |
| **Package renderers** | Consume v2 only. A v1 document cannot reach them — the compiler blocks it. |

Published v1 designs are left alone on purpose: only `story-lead` has a v2
equivalent today, so migrating a *live* v1 homepage on read would silently drop
every other section. That behaviour changes when the remaining packages exist,
not before.

### Preserved legacy blocks

When Studio migrates a v1 design, blocks with no v2 package are carried in
`legacy.unconvertedBlocks`.

They are held **outside** Puck's editor state. Injecting them as pseudo-packages
would let an editor drag, configure or delete something no renderer can draw,
and would let them leak into `packages` on save. Instead `loadDesignIntoEditor`
returns them alongside the editor state, and Studio threads them back into
*every* autosave and publish unchanged.

This matters more than it looks: without it, opening a migrated design and
making any edit would rebuild the document from recognised packages only and
permanently destroy the very blocks the migration promised to keep. The round
trip is covered by regression tests, including a repeated-autosave loop and a
source-level check that Studio actually passes the payload.

WordPress validates the preserved blocks with the same safety rules as package
props — they are inert, but they are still persisted data.

## Themes

`getLeadPackageRenderer(themeId)` maps a theme to its renderer:

- `weekly-wildcat` → `LeadPackage` (production-faithful, three columns)
- `editorial` → `EditorialLeadPackage` (full-bleed lead, horizontal strip)

An unknown theme falls back to the Weekly Wildcat structure rather than
rendering nothing: a missing variant degrades, it never deletes the package.
Theme choice cannot change what an editor configured.

## Compatibility proof

The extracted lead package renders **byte-identical HTML** to the pre-extraction
implementation — the whole `<main>` element matches `main` exactly at 22,131
characters. See `apps/web/tests/baseline/homepage-structure.json`.
