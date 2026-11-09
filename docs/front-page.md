# Front Page

> Front Page changes editorial priority, not homepage design.

The homepage design is code (`getWeeklyWildcatHomeDesign`, the package
contracts in `@byline/design`). The Front Page Desk (`/admin/front-page`,
editors) lets an editor **pin a published Story into a slot**, **return a slot
to automatic**, and **publish or schedule** those changes. There are no
layout, font, color, width, CSS or block controls, and no page builder.

## Slots

`homepageSlots(document)` (`packages/design/src/slots.ts`) names the positions
the design already has. Ids are `<package key>.<position>`, where the package
key is the package id without `home-`:

`lead.lead`, `lead.latest.0…3`, `brief.lead`, `brief.rail.0…`, `in-focus.story`,
`special-coverage.0…`, `opinion.lead`, `opinion.rail.0…`, `sports.lead`,
`sports.rail.0…`, `more.lead`, `more.rail.0…`.

They change only when code changes the design. A stored placement for a slot
code removed is reported (`unknown-slot`), never applied, and never crashes a
build. The featured slots (Lead, Brief lead, In Focus, Special Coverage 1,
Opinion lead, Sports lead) are offered from a Story.

## Resolution

Placements are an optional input to the one canonical resolver,
`resolveHomepageDocument({ …, placements })` (`@byline/ui/homepage`):

1. validate placements (known slot, a published Story, each Story once);
2. reserve pinned Stories page-wide, with the design's own manual pins;
3. tell the compatibility selection pass which positions are taken, so a
   Story displaced by a pin flows on to the next package rather than vanishing;
4. put each pinned Story in its exact position; automatic selection fills the
   rest, in order;
5. keep one page-wide used set: a Story appears at most once.

No placements is exactly the automatic homepage (tested). The result also
returns `slots` (which Story each slot shows, and whether it is pinned) and
`placementIssues`.

## Revisions

`front-page-revisions` stores atomic, immutable revisions: one shared
**draft** (pending changes), at most one **scheduled**, one **active**, and
**archived** history. Editors see "Live homepage · 3 unpublished changes", not
"editions". Only `/api/byline/front-page/*` writes them.

- **Publish changes** validates and, in one transaction, archives the active
  revision, activates the draft and advances the public revision, which queues
  the existing snapshot → build → deploy flow.
- **Schedule…** takes a newsroom-local time; the `activate-front-page` job on
  the `publication` queue activates it then. The public renderer never decides
  with `Date.now()` which lineup is live. A scheduled activation that cannot
  apply stays scheduled with its reason and notifies editors (**Front Page
  failures**).
- A pinned Story that is no longer published makes activation fail with the
  reason; Byline never substitutes another Story in a pinned slot.
- **History** reads "Nov. 14 · 10:42 PM — Gibson · Changed Lead and In Focus".
  **Use this lineup** copies an old revision into the draft; history is never
  mutated.

## Snapshot

Snapshot v2 gains an optional top-level `frontPage: { placements, activatedAt }`
(the zod contract in `@byline/content`, `schemas/public-build-snapshot-v2.schema.json`,
producer version 3). It carries only the **active** placements, only for Stories
in the snapshot: a pinned Story unpublished after activation drops out, and its
slot is automatic, rather than failing the public build. Drafts, schedules and
history never leave the newsroom. The static homepage (`apps/web/views/page.tsx`)
passes the placements to the same resolver; there is no runtime request.

## The desk

- Wide (≥1240px of the desk): Story pool | preview | slots. Narrower: the
  preview stays primary; the pool and slot inspector open in Sheets.
- The preview is `/preview/front-page`: the real `HomepagePackages` with the
  publication stylesheets, fed by the same resolver over published Stories
  (`front-page/stories.ts`). Desktop renders at 1280px and scales to fit;
  Mobile renders at 390px (a connected `ToggleGroup`). Images are private
  Library previews, as in Live Preview; selection and layout are identical.
  The pool mirrors the build's homepage pool (an active section, Sports only
  with the sports feature, never Behind the Scenes); keep the two in step.
- Editor-only overlays label each slot "LEAD · PINNED" or "LEAD · AUTO";
  choosing one selects it (same-origin postMessage).
- The Story pool is an async `Command` over lightweight published summaries
  (never bodies), filterable by section.
- Selected slot: **Choose story** / **Replace**, **Return to automatic**.
- Drag and drop (dnd-kit) is an accelerator: a dedicated handle, pointer, touch
  and keyboard sensors, screen-reader announcements, Escape cancels. Every slot
  row is also a click and keyboard target.

## From a Story

A published Story's History tab shows **Front page**: Automatic, Pinned as Lead,
or the pending change, and **Feature on homepage…** (editors), which makes the
same pending change as the desk. The change goes live when an editor publishes
homepage changes.

## Validation

```sh
npx vitest run tests/front-page-placements.test.ts tests/homepage-resolution.test.ts   # in apps/web
npx vitest run --config vitest.integration.config.ts tests/integration/front-page.test.ts # in apps/newsroom
```
