# AGENTS.md — Byline Data (general guide)

Start here for any Data task, then read [Byline Data](../../docs/byline-data.md).
This guide says which path fits a request and which files and checks it touches.
Presentation code has its own guide: [data-presentations](../data-presentations/AGENTS.md).

`@byline/data` owns the contract: field types and value rules, the closed query
language, releases and their canonical bytes, presentation descriptors, bindings
and settings, CSV, and the public `data` section of Snapshot v3. It depends on
`zod` only. Never import Payload, Next, Astro, React or the filesystem here.

## Which path fits the request

| Someone asks for… | Do | Code? |
| --- | --- | --- |
| A table, ranking or timeline of facts | Data → Dataset (paste rows) → Publish data → Project with a built-in template → Publish. See [data-presentations](../data-presentations/AGENTS.md) rule 1 | No |
| Data inside a story | Publish the Project, then **Add → Data Project** in the Story editor. Nothing is copied: the block stores a project ID and this story's heading and description | No |
| A recurring kind of page (election results, a bracket) | `npm run data-presentation -- create <key> --template` | Yes |
| One bespoke experience | `npm run data-presentation -- create <key>` (add `--client` only if script is needed) | Yes |
| A new field type, operator or value rule | `packages/data/src/{fields,query,schema}.ts` + CSV, release and grid consumers (see below) | Yes |
| A new kind of Story block | The checklist below | Yes |
| Live, second-by-second results | Not Data's static pipeline: a separate delivery path patterned on live coverage | — |

Newsroom users never type JavaScript, HTML, CSS, SQL or formulas. Facts live in
datasets; code only declares which roles it reads.

## Invariants (do not trade these away)

- A dataset edit never changes the public site. Only an editor's Publish makes
  an immutable release named by its SHA-256; a Project changes the site only on
  its own Publish.
- Private fields are physically absent from releases, snapshots and `out/`.
  Run the privacy sentinel (`PRIVATE-…-SENTINEL` in fixtures) over anything new.
- The build reads only local, verified release files. No newsroom request during
  rendering; no public database.
- Presentations are deterministic at build time (`prepare` runs twice and must
  match). Server HTML is the experience; `client.ts` only enhances.
- A Story embeds a Project by ID. The Project stays the single source of truth;
  never copy rows, bindings, hashes, settings, the presentation key, HTML, CSS or
  JS into a Story. `@byline/article-body` must not depend on `@byline/data`.
- Keys (dataset, field, presentation) are permanent once used.

## Adding or changing a Story block (Data blocks and others)

The contract is exhaustive: add the type to the registry and the compiler (and a
completeness test) lists the rest. In order:

1. `packages/article-body/src/types.ts` (the block type, `ArticleBlock`),
   `blocks.ts` (`ARTICLE_BLOCK_TYPES`, `ARTICLE_BLOCKS`: label, description,
   family, aliases, icon; `ARTICLE_BLOCK_LIMITS`), `validate.ts` (closed schema),
   `readiness.ts` (`finalizeBlock`: what is left out whole, and the writer-facing
   message), `references.ts` (`blockMediaIds` and, for a block that names another
   record, a `block<Kind>Ids` plus a `ReferenceLookup` callback), `fixtures.ts`.
2. `packages/editor/src/`: `schema.ts` (Payload block + `PASCAL`), `fields.ts`
   (stored fields, reader, `BLOCK_TO_ARTICLE`), `serialize.ts`, `icons.ts` (a
   semantic icon; `ArticleBlockIcon`), `normalize.ts` (the lookup and
   `collectReferenceIds`), `client/BylineStoryBlock.tsx` (the editor map),
   `client/blocks/*` (the editor UI; use the existing shadcn/Base Nova primitives
   and `SettingsSurface`), `client/host.tsx` (a host capability and record store if
   the block needs records). `@byline/editor` never calls Payload or newsroom APIs;
   the host does (`apps/newsroom/src/ui/story/editor-host.tsx`).
3. `packages/ui/src/article-body/render.tsx` (`ARTICLE_BLOCK_RENDERERS`, the
   `ArticleRenderHost` hook for anything host-specific) and its CSS.
4. Newsroom: `hooks/story-body.ts` (`resolveBodyRecords`: server-side readiness),
   `public/snapshot/collect.ts` (resolve against the data the snapshot carries),
   `preview/payload-story.ts` (Live Preview), regenerate
   `npm run generate:types --workspace @byline/newsroom`.
5. Snapshot: if the block names public records, add a cross-invariant in
   `packages/content/src/public-snapshot-v2.ts` (`validateSnapshotFacts`).
6. Web: `apps/web/lib/route-cache.ts` (a page that shows another record's data
   must carry that record's facts in its cache key, and only that record's), the
   Astro article route, and any host in `apps/web/lib/`.
7. Docs: [article-editor](../../docs/article-editor.md) (the tool count, the
   schema table, the authoring notes) and, for Data, [byline-data](../../docs/byline-data.md).

Tests per layer: `article-body` (finalize, validate, references), `editor`
(registry completeness, fields round trip, normalizer), `ui`/`web` renderer
tests, newsroom integration (publish refusals, snapshot), route-cache tests, and
a browser spec when authoring or public behaviour changes.

## Commands

```sh
npm run test:data                          # @byline/data + @byline/data-presentations
npm run test:article-body && npm run test:editor
npm run typecheck && npm test
npm run verify:contracts
npm run test:newsroom:integration          # real PostgreSQL: data.test.ts, data-embed.test.ts
BYLINE_CONTENT_MODE=weekly-wildcat-fixture npm run build:frontend
npm run build:data-embed-fixture --workspace @byline/web && npm run test:browser:data-embeds --workspace @byline/web
BYLINE_CONTENT_MODE=weekly-wildcat-browser-fixture npm run build:frontend && npm run test:frontend:browser
```

Newsroom browser specs (`apps/newsroom/tests/browser/data-workspace.spec.ts`,
`data-story-embed.spec.ts`) run against a live newsroom:
`BYLINE_EDITOR_E2E_URL=http://localhost:<port> npx playwright test --config playwright.editor.config.ts <spec>`.

## Pitfalls seen before

- A project with unpublished edits (`changed`) is embeddable; a draft-only one is
  not. "Published" is not "search-indexable": a `noindex` project still embeds.
- Collect the Data section before normalizing Story bodies in the snapshot; the
  embed resolves against it.
- A presentation renders under the story's `<h2>` and possibly twice on a page:
  no fixed ids, no global queries, `client.ts` per root.
- Unpublishing or deleting a project a published Story shows is refused
  (`apps/newsroom/src/data/usage.ts`); the snapshot also fails closed.
- Fixture presentations (`fixture-` keys) exist only in fixture builds and with
  `BYLINE_STORY_PRESENTATION_FIXTURES=1`; production can never register one.
