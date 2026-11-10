# Byline Data

Byline Data lets the newsroom keep structured facts and publish them as
reader-facing pages, from a ten-row project tracker to a fully custom
election center.

```text
Dataset   the facts the newsroom keeps        Data → Datasets
Project   what readers see                    Data → Projects
```

**Data complexity and presentation complexity are independent.** A plain
spreadsheet-like dataset can power a bespoke, repository-coded page. A
relational dataset can power a stock template. Editors can build something
with no code; a developer can build a presentation that reads the exact same
published data.

The ordinary flow:

```text
Data → New dataset → paste rows or add fields → Publish data
     → New project → choose a template or custom presentation
     → bind fields → preview → Publish
```

## Concepts

**Datasets** are working data: one Payload document per row
(`data-records`), validated on the server against the dataset's schema on
every write. Editing a dataset never changes the public site.

**Fields** have a permanent key, chosen once from the first label. Rename
"Precincts reporting" to "Precincts counted" and every project, release and
CSV mapping keeps working. Removing a field retires its key forever. Types
change only along value-preserving paths (text ↔ long text, whole number ↔
number ↔ percent, text → link). Each field is **public** or **private**:
private fields are physically absent from every release. **Required** is a
publication rule, so a half-typed row can still be saved.

| Type | Stored value |
| --- | --- |
| Text, Long text, Link | trimmed string (links: http(s), no credentials) |
| Whole number, Number, Percent | JSON number (percent points: 45.5 means 45.5%) |
| Money | exact decimal string at a fixed scale (`"1250.50"`), never a float |
| Yes / no | boolean |
| Date | `YYYY-MM-DD` calendar day |
| Date and time | UTC instant, shown in the newsroom/publication timezone |
| Choice | a choice's stable value; each choice has a label and an optional *tone* (neutral, positive, caution, negative, info) that presentations read instead of colors |
| Link to a record | a record ID in another dataset |

Media references are deliberately not a field type yet (see Follow-ups).

**Releases** are immutable public snapshots of one dataset: included rows
only, public fields only, normalized values, canonical JSON bytes named by
their SHA-256. **Projects** reference releases; the public page never reads
working rows.

**Presentations** are repository code:

- **Template** (`defineDataTemplate`): reusable; editors choose it for any
  compatible dataset and configure it. The built-ins (Table, Ranking,
  Timeline) are templates on exactly this contract.
- **Custom** (`defineDataPresentation`): one project's experience. It still
  declares what it reads, so the newsroom can bind and validate it.
- **Builder** (future): a closed composition of Byline-owned blocks (text, key
  metric, table, ranking, timeline, chart, related reporting) stored on the
  project. Never arbitrary layout, CSS, HTML or code.

Newsroom users never enter JavaScript, TypeScript, HTML, CSS, SQL or
expressions. Repository code is trusted because it ships through source
control and deployment.

## Packages

| Package | Owns | Depends on |
| --- | --- | --- |
| `@byline/data` | schemas, field types and value rules, the closed query language, releases and their canonical bytes, presentation descriptors, bindings and settings, the public Data section of Snapshot v3, CSV | zod only |
| `@byline/data-presentations` | `defineDataTemplate` / `defineDataPresentation`, the registry and descriptors, `prepare`, `resolveDataProject`, `DataProjectView`, the built-in templates and the fixture presentation | `@byline/data`, React |

Neither imports Payload, Next or Astro, and the presentation package has no
bundler-specific imports. Each host loads a presentation's `styles.css` and
`client.ts`: Vite globs in `apps/web/lib/data-presentation-{host,client}`,
Next dynamic imports in `apps/newsroom/src/preview/data-assets.tsx`.

## Newsroom

Three fixed collections (no table per dataset):

| Collection | Holds | Access |
| --- | --- | --- |
| `data-datasets` | title, permanent key, description, schema, working revision, current release pointer | read: staff · write: editors |
| `data-records` | dataset, permanent record ID (unique per dataset), `values` by field key, position, "Publish this row" | read/write: staff, validated on the server |
| `data-projects` | title, slug, deck, presentation, bindings, settings, source, methodology, indexing, related Stories; Payload drafts and versions | read: staff · write/publish: editors |

The schema, the working revision and the release pointer are refused to
REST writers (field access); only the server's own statements change the
last two. Saved Data Views are not a collection: a reader's columns,
filters and sort are Payload Preferences (`byline:data:view:v1:<key>`), the
same as other saved views.

`/api/byline/data/*` (`apps/newsroom/src/data/server.ts`) re-checks the
account on every call and reads and writes with `overrideAccess: false`.
Editor-only actions (schemas, publishing data, projects) are refused there,
never merely hidden. Row edits name, per field, the value they started from;
under a row lock in the same transaction a field changed by someone else is
a 409 and nothing is written, so two people editing different cells of a
row both win. Schema saves compare the schema they started from under a
dataset row lock.

### The dataset grid

TanStack Table (`@tanstack/react-table`) owns column state (visibility,
sizing, the sort the header shows) on the Base Nova table primitives. Rows
arrive filtered and sorted by the closed query language: in memory for
datasets up to 1,000 rows, a page at a time from the server above that.
Both use the same validated query, so both modes mean the same thing.
Virtualization would only reduce DOM work; it is not a substitute for the
server mode.

Keyboard: arrows, Home/End (with ⌘/Ctrl for the grid corners), Page Up/Down
and Tab move; Enter or F2 edits; Enter commits and moves down, Shift+Enter
up; typing replaces; Escape cancels; Delete clears; Space toggles yes/no;
⌘C copies a cell; ⌘V pastes a block from any spreadsheet, filling right and
down and adding rows past the end. Every pasted cell is parsed strictly for
its field; cells that don't fit are reported, never coerced.

### The query language

`validateQuery` accepts only known field keys, the operators each type
allows (`OPERATORS_BY_TYPE`), typed operands, at most 12 filters, 3 sorts,
pages of 1–1,000 rows. There is no SQL, no JavaScript and no formula.
`evaluateQuery` is the reference semantics. The server currently evaluates
validated queries in memory over a dataset's rows; compiling the same AST to
parameterized SQL over `values` is the planned path for very large
datasets, without changing the API.

### CSV

Import parses on the server (5 MB, 10,000 rows, 60 columns, 10,000
characters a cell), maps columns to permanent field keys (a column mapped to
Row ID updates rows in place), previews counts and every cell that is not
clearly a value of its field, and commits in one transaction or not at all.
Export defaults to public fields; all fields only when chosen, and every cell
that a spreadsheet would read as a formula (`= + - @`, tab, carriage return)
is prefixed with an apostrophe.

## Releases

Publishing a dataset (`publishDatasetRelease`, editors) is a revision fence
like the public snapshot's:

1. Capture the dataset's working revision R. Every committed row, schema,
   title or description change advances it in its own transaction, in one
   statement.
2. Collect rows without holding a transaction; project included rows and
   public fields.
3. Validate values, required fields and relationships: a linked record must
   itself be in its dataset's current release.
4. Refuse a release that would break a published project (for example, a
   bound field made private).
5. Serialize canonical bytes and run the privacy sentinel over them.
6. Reread R. A change during collection means stale; nothing is promoted.
7. Write `<BYLINE_PUBLICATION_MEDIA_DIR>/data/v1/<sha256>.json` through the
   shared immutable artifact store (`public/artifacts/store.ts`, also behind
   snapshots): staged, fsynced, linked, never overwritten.
8. In one transaction, promote the pointer `WHERE working_revision = R` and
   advance the public revision, which queues the snapshot job. A writer who
   commits between the reread and the promotion makes the promotion lose.

Releases are never eagerly deleted: they are small, and a running build may
still name an older one.

## Snapshot v3

The public build snapshot is v3 (`packages/content/src/public-snapshot-v3.ts`,
`schemas/public-build-snapshot-v3.schema.json`): v2's content plus a strict
`data` section.

```json
"data": {
  "projects": [{ "id": 1, "slug": "sidewalk", "href": "/data/sidewalk/", "presentation": { "kind": "custom", "key": "…" },
                 "settings": {}, "bindings": [{ "slot": "phases", "dataset": "sidewalk-phases", "release": "<sha256>", "fields": { "name": "name" } }],
                 "source": "", "methodology": "", "indexing": "public", "publishedAt": "…", "modifiedAt": "…", "dataUpdatedAt": "…", "relatedStories": [] }],
  "releases": [{ "sha256": "…", "bytes": 1234, "dataset": "sidewalk-phases", "title": "…", "revision": 12, "releasedAt": "…", "records": 5, "fields": [ … ] }]
}
```

Row data is never in the snapshot. The validator fails closed on an unknown
presentation, a fixture presentation outside fixture builds, a binding to a
release that is not listed, a release no project uses, a private field in a
descriptor, incompatible bindings or settings, a related Story that is not
public, and a duplicate public route (including a Page at `/data/`).
Producer version 4 writes v3; the build reads v2 and v3 and sends
`X-Byline-Snapshot-Versions: 2,3`. A newsroom that can only offer a version
the build doesn't read answers 406.

Only published project main rows are projected. A release changes the public
site only when an editor publishes it; a project changes it only on Publish.

## The build

Before Astro renders (`apps/web/scripts/astro-with-publication.mjs`), the
build materializes exactly the releases the accepted snapshot names
(`apps/web/lib/data-releases.ts`):

```text
GET <BYLINE_NEWSROOM_BUILD_URL>/data/<sha256>   Authorization: Bearer $BYLINE_BUILD_TOKEN
  → verify byte length, SHA-256, canonical bytes, release schema, descriptor
  → .byline-build/data/<sha256>.json
```

`/api/byline/build/data/:sha256` serves only a dataset's *current* release.
`BYLINE_NEWSROOM_BUILD_DATA_URL` overrides the endpoint;
`BYLINE_BUILD_DATA_DIR` reads releases from a local directory (offline
snapshots). Anything wrong fails the build. Astro reads only the local
files (`apps/web/lib/public-data.ts`); the network assertion still rejects
any newsroom request during rendering. After Astro, the same files are
copied to `out/_byline/data/<sha256>.json` for optional client code.

Public routes: `/data/` (an index; noindex until a project is indexable) and
`/data/<slug>/` for each published project, with canonical metadata,
schema.org `Dataset` and breadcrumb JSON-LD, the sitemap (indexable projects
only, dated by their newest release) and route-cache keys built from the
project, its exact release digests, its presentation's descriptor and its
related Stories' public facts.

Fixture builds (`BYLINE_CONTENT_MODE=*-fixture`) use the committed
`apps/web/tests/fixtures/data` (regenerate with
`node --import tsx apps/web/scripts/generate-data-fixture.mts`). Fixture
presentations exist only in fixture builds and in a development newsroom
with `BYLINE_STORY_PRESENTATION_FIXTURES=1`; production can never register,
bind or publish one.

## The presentation SDK

### Create one

```sh
npm run data-presentation -- create election-center            # a custom presentation
npm run data-presentation -- create school-board-votes --template
npm run data-presentation -- create election-center --client   # with client.ts
```

```text
packages/data-presentations/src/presentations/election-center/
  index.tsx     definition + component (default export)
  styles.css    scoped under .data-presentation-election-center
  client.ts     optional progressive enhancement
```

There is no `data.ts`: the facts come from newsroom datasets. A presentation
may still import ordinary repository files (a boundary map, a party color key)
for code-owned auxiliary data.

### Declare what it reads

```tsx
import { defineDataPresentation, field, setting, slot, type DataPresentationProps, type PrepareInput } from "../../sdk";

const datasets = {
  races: slot({ label: "Races", fields: { office: field.text(), reporting: field.percentage({ label: "Precincts reporting" }) } }),
  candidates: slot({ label: "Candidates", fields: {
    name: field.text(), race: field.relationship(), votes: field.integer(), winner: field.boolean({ optional: true })
  } })
};
const settings = { showMargins: setting.boolean({ label: "Show margins", default: true }) };
```

A **slot** is a dataset; a **role** is a field it reads. Code refers to roles,
never to labels or a dataset's field keys. The project binds each role to a
field key, which is how a template is reused for next year's election.
Descriptors (`describeDataPresentations`) are plain JSON: the newsroom lists,
binds and validates presentations without loading their components, styles
or browser code.

### Transform, then render

```tsx
type Model = { races: Array<{ id: string; office: string; reporting: string; leader: string; margin: number }> };

/** Deterministic and build-time only: no network, clock or secrets. */
function prepare({ data, format }: PrepareInput<typeof datasets, { showMargins: boolean }>): Model {
  return {
    races: data.races.records.map((race) => {
      const ranked = data.candidates.records.filter((candidate) => candidate.roles.race === race.id)
        .sort((a, b) => Number(b.roles.votes) - Number(a.roles.votes));
      return { id: race.id, office: String(race.roles.office), reporting: format.value(data.races.roles.reporting, race.roles.reporting),
        leader: String(ranked[0]?.roles.name ?? ""), margin: Number(ranked[0]?.roles.votes ?? 0) - Number(ranked[1]?.roles.votes ?? 0) };
    })
  };
}

function ElectionCenter({ model, project }: DataPresentationProps<typeof datasets, { showMargins: boolean }, Model>) {
  return <ol>{model.races.map((race) => <li key={race.id}><h2>{race.office}</h2>{race.leader} leads{project.settings.showMargins ? ` by ${race.margin}` : ""} · {race.reporting} reporting</li>)}</ol>;
}

export default defineDataPresentation({ key: "election-center", name: "Election center", description: "…", datasets, settings, styles: true, prepare, Component: ElectionCenter });
```

The component receives `project` (title, deck, href, typed settings,
`dataUpdatedAt`, `source: "published" | "working"`), `data` (each slot's
`BoundSlot`: dataset facts, public fields, `roles` → field, and records with
`values` and `roles`), `model` and `format` (values, instants and counts in
the publication's locale and timezone). It never receives a Payload request,
document or database client. `prepare` runs twice per render and must
return identical, plain, bounded (2 MB) JSON; anything that reads the clock,
randomness or the network fails. External ingestion (election feeds, sports
APIs, Google Sheets) is a future newsroom job that writes datasets, never
presentation code.

### Progressive enhancement

The server-rendered HTML must be complete, accessible and useful with
JavaScript off; respect `prefers-reduced-motion`. `client.ts` exports
`(root, { releases }) => cleanup`: `root` is the presentation's server markup
and `releases` maps each slot to `/_byline/data/<sha256>.json` (empty in the
newsroom preview). The public site loads a presentation's CSS and client
chunk only on its page.

### Register it

The scaffold adds it to `src/registry.ts` (`dataTemplates` or
`dataPresentations`). Keys are permanent once a project uses them. Duplicate
keys are refused.

### Bind, preview and publish

In the newsroom: Data → New project, choose it, bind each role (fields are
matched by name and type to start), configure settings, and preview. The
preview frame is the same `DataProjectView` with either **Working data**
(every row and field as it is now, including private ones, never stored) or
**Published data** (exactly the releases readers get). Publish is refused
until every bound dataset has a release whose public fields satisfy the
presentation.

### Test it

Add a case beside `packages/data-presentations/tests/sdk.test.tsx`: build a
release with `projectRelease`, resolve it with `resolveDataProject`, render
`DataProjectView` with `renderToStaticMarkup`, and assert the HTML without
script; drive `client.ts` in jsdom. Then `npm run test:data`,
`npm run typecheck:packages` and a fixture build.

## Article embeds (follow-up)

A published project should be embeddable in a Story without copying its data.
The contract is prepared (`DataProjectEmbedReference` in `@byline/data`: a
stable project reference plus article-facing title and text alternative); the
`dataProject` body block is a follow-up so this change stays reviewable. The
`repositoryTracker` block remains for compatibility, and Repository
Interactive is unchanged.

## Follow-ups

- The `dataProject` article block (above).
- Media-reference fields, through the prepared publication Media catalog.
- Compiling the closed query to parameterized SQL for very large datasets.
- The Builder presentation kind.
- Data adapters (CSV/JSON/REST/feeds/Sheets) as newsroom jobs writing datasets.
- A restricted, deterministic formula language.
- A separate live-delivery path for second-by-second results, patterned on live coverage; the static release pipeline stays the default.
