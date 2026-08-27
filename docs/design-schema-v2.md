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

## Resolution order — important

`The Latest` is **not** resolved in layout order. In the pre-Studio homepage it
is the *eighth* selection, taken from what remains after In Focus, Special
Coverage, Opinion, Sports and More have claimed their stories.

Resolving it immediately after the lead would pull different stories into the
rail. The lead package therefore consumes the existing ordered pass in
`homepage-selection.ts` rather than issuing its own queries — one
de-duplication algorithm, not two.

A **manual** source is an explicit editorial override and does take effect
immediately.

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

The public `BYLINE_DESIGN_SCHEMA_VERSION` in the protocol manifest deliberately
stays at **1**: deployed frontends check it with strict equality, so bumping it
is a coordinated release.

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

### Published v1 designs

A published *v1* design still renders through the legacy `DesignHomepage`
compatibility renderer, not through migration. This is deliberate: only
`story-lead` has a v2 equivalent today, so migrating a live v1 homepage would
silently drop every other section. Studio migrates v1 on load (and says what did
not convert); published v1 output is left alone until the remaining packages
exist.

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
