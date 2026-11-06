# apps/newsroom

The private Byline newsroom: Payload 3 + Next.js + PostgreSQL. It replaces
WordPress as the control plane through a phased strangler migration; read
[`docs/payload-migration.md`](../../docs/payload-migration.md) before changing
anything here. The public newspaper is still `apps/web` (Astro), built from a
snapshot; nothing in this app serves public reading.

## Rules

- **Byline owns the experience; Payload supplies infrastructure.** Use Payload's
  Versions, Drafts, Autosave, scheduled publish, document locking, Jobs Queue and
  Access Control natively. Never build a second one.
- **Access control is server-side.** Every collection, field, custom view and
  endpoint checks the user (`src/access`). A custom admin view is not protected by
  being inside the admin; call `requestUser(req)` and read through the Local API
  with `overrideAccess: false`.
- **Story context** (`src/access/story-context.ts`) is the port of
  `byline_story_context()`: managers (editors, creator, assigned editor,
  contributors via linked person), participants (assigned work only) and
  everyone else. Extend it; do not add parallel checks.
- **Workflow and planning live on `story-plans`, not on `stories`.** Payload draft
  saves write only the versions table, so anything that must change immediately,
  survive version restores and drive access (workflow, editor, deadline,
  planned publication, brief, links, the contributor team) is on the unversioned
  plan. Never put newsroom state back on the versioned story.
- **Dates:** a deadline or appointment window is date-only text and is never
  converted to an instant. Exact times are UTC instants, read in the newsroom
  timezone (`BYLINE_NEWSROOM_TIMEZONE`), never the browser's.
- **IDs:** only the controlled import (`context.bylineImport`) may choose an ID;
  run `advanceIdSequences` after importing. Sequences never move backwards.
- **Votes** live in `byline_poll_votes` (`src/db/poll-votes.ts`), never a collection.
- **Nothing private enters a public projection.** Public snapshot/live/poll
  projections (later phases) use explicit allowlists.
- **Byline UI, Payload underneath.** Every staff-facing surface is Byline's
  Nova UI (`@byline/newsroom-ui`, `src/ui`), never Payload's generic list/edit
  screens. Use Payload's extension points (dashboard, list views, `Nav`, custom
  Field components) and its hooks (`useField`, `useForm`, `useDocumentInfo`)
  so form state stays Payload's. Do not replace the Edit view or document root:
  the Story screen is the custom Field of a presentational collapsible.
- **Nova inside Payload:** Byline stylesheets live in `src/ui/*.css` (the only
  files `postcss/byline-ui.cjs` compiles and scopes). The Story screen sits
  inside Payload's `<form>`: give every button `type="button"`, stop Enter in
  one-line inputs, and keep the root's submit guard (`keepSubmitsInByline`):
  shared dialogs have their own `<form>` in portals, and React would bubble
  their submit into Payload's form and save the story.
- **Shared screens, local adapters.** Screens come from `@byline/newsroom-screens`
  unchanged; the newsroom supplies fetchers (`src/ui/home/payload-fetchers.ts`)
  over `/api/byline/*` (`src/newsroom/endpoints.ts`). Do not fork a screen to
  fit Payload: map Payload records to the screen contract in
  `src/newsroom/screen-models.ts`. Unported methods reject with 501.
- **Sizes:** Payload's root font is 13px; `postcss/byline-ui.cjs` compiles Nova's
  rem to px. Use the design system's classes, never hand-tuned sizes.
- **Writers never get** HTML, CSS, colors, fonts, alignment or layout controls.
  `src/editor/prose.ts` is the whole prose surface.
- `src/payload-types.ts` is this app's internal type file. It must never become
  the public site's content contract.

## Commands

```sh
docker compose -f apps/newsroom/docker-compose.yml up -d   # or any local PostgreSQL
cp apps/newsroom/.env.example apps/newsroom/.env
npm run dev:newsroom                                       # http://localhost:3010/admin
npm run typecheck:newsroom && npm run test:newsroom
npm run test:newsroom:integration                          # real PostgreSQL, throwaway DB
npm run generate:types --workspace @byline/newsroom        # after any field change
npm run generate:importmap --workspace @byline/newsroom    # after adding admin components
npm run migrate:create --workspace @byline/newsroom -- <name>
npm run migrate:check --workspace @byline/newsroom         # against an EMPTY database
```

Payload 3.92 needs Node ^22.23.4 or ≥24.22.1.
