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

## Storage compatibility

WordPress accepts schema 1 **and** schema 2 while the migration is in progress,
dispatching to `byline_validate_design_document_v2` for the latter.

The advertised `BYLINE_DESIGN_SCHEMA_VERSION` deliberately stays at **1**: it is
a public compatibility contract checked with strict equality by deployed
frontends, so bumping it is a coordinated release, not a side effect of this
phase. It moves to 2 when every package is extracted and schema 1 is dropped.

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
