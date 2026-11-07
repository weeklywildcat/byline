# Payload public snapshots and the static build

Phase 7 of the [Payload migration](payload-migration.md): Payload produces the
same immutable **public build snapshot v1** that the Astro site already
consumes from WordPress, plus the exact prepared media it names
([publication-media.md](publication-media.md)), and a static build can acquire
both, render entirely locally and verify the result. WordPress remains the
production authority; nothing here switches production to Payload.

```text
public write ──► one PostgreSQL transaction: content + revision R + queued prepare-public-snapshot
                                   │
            jobs:publication ─► collect R (no lock) → validate → serialize → fence (still R?)
                                   │                                         │ no → stale, nothing promoted
                                   ▼                                         ▼ yes
              BYLINE_PUBLICATION_MEDIA_DIR/snapshots/v1/snapshot-v1-r<R>-<sha256>.json
                                   │  UPDATE … SET completed_* WHERE current_revision = R
                                   ▼
 static build ─► GET /api/byline/build/snapshot ──200──► GET …/snapshot/<sha256> ─► verify
                          │ 503 byline_snapshot_not_ready
                          └──────────────────────────► GET …/direct?revision=R (409 → rediscover, ≤3)
                                   ▼
                 .byline-build/public-snapshot.json  (one local contract)
                                   ▼
              Astro (CMS network blocked) ─► GET /api/byline/build/media/<sha256> × closed set
                                   ▼                     → out/_byline/media/…
                           postbuild verification
```

## Revision semantics

`byline_publication_state` is a singleton infrastructure table (not a
collection; no admin, REST or GraphQL access), added through the Postgres
adapter's `beforeSchemaInit` like `byline_poll_votes` and created by the
committed migration `20261107_073047_public_snapshot_v1`, which seeds
revision 0:

| Column | Meaning |
| --- | --- |
| `current_revision` (bigint) | the public content revision; monotonic |
| `completed_revision`, `completed_schema_version`, `completed_sha256`, `completed_bytes`, `completed_generated_at`, `completed_filename`, `completed_producer_version` | the completed snapshot pointer (all null until the first promotion) |
| `updated_at` | last change |

`src/db/publication-state.ts` is the only SQL: read, advance (one atomic
upsert-increment), conditional promotion (one `UPDATE … WHERE
current_revision = R`) and `safeRevision`, which refuses a bigint beyond
JavaScript's safe-integer range before it can enter snapshot v1.

The revision is a **content** revision. It changes only when the canonical
public data changes; never for autosaves, drafts, newer unpublished rewrites,
Story Plans, workflow, deadlines, tasks, sources, appointments, production
assignments, Collection briefs/interviews/resources, Users, Media folders,
preparation state, jobs, presence or poll votes; never because a snapshot job
ran or because the producer code changed.

### Transactional mutation behavior

`recordPublicMutation(req, reason)` (`src/public/revision.ts`) advances the
revision **and** queues `prepare-public-snapshot` with the same `req`, so both
join the request's PostgreSQL transaction. If either fails, the public write
fails and rolls back; if the write fails later, both roll back. No committed
public change can exist without its revision and durable snapshot work (tested
by failing the job insertion and by failing a later hook).

Several public hooks in one top-level operation (same transaction ID) make
**one** revision, remembered in `req.context.bylinePublicRevisionRecorded`
keyed by the transaction. Separate requests or separate transactions on one
request always make separate revisions.

**Why not the WordPress advisory lock.** WordPress public writes are many
autocommitted statements across requests, so its generator needs a MySQL
advisory lock and writer markers to avoid labelling a half-saved state. A
Payload write is one PostgreSQL transaction: its content and its revision
become visible together. The generator therefore needs no lock: it collects
without holding a transaction and lets the revision fence reject anything a
concurrent commit overtook. Reporters are never blocked by snapshot
generation.

### Public mutation coverage

One central table, `src/public/tracking.ts`, attaches change tracking to the
collections that reach the public site. Each record's **public slice**
(`src/public/slices.ts`) is an explicit allowlist read from the record's MAIN
row inside the write's transaction, before and after the write; the revision
moves only when the digests differ.

| Record | Public when | Slice |
| --- | --- | --- |
| Stories | `_status = published`, not trashed | headline, deck, kicker, section, topics, contributors, lead image + caption, body format/body/legacy HTML, format, video, presentation, alignment, reporting note, live coverage, slug, first publication, `updatedAt` (the public `modified`) |
| Pages | published, not trashed | title, slug, parent, summary, body, noindex, first publication, `updatedAt` |
| Events | published, not trashed | title, slug, type, start/end, all day, location, description, external URL, status |
| People | always | name, slug, pronouns, newsroom role, short/long bio, status, portrait, directory flag, profile flag, public email, socials (never account linkage) |
| Sections / Topics | always | name, slug, description (+ Section `hidden`) |
| Collections | public presentation enabled with a slug | status, start/end date, ordered story membership, the whole `publicPresentation` (never the brief, team, interviews, tasks or resources) |
| Corrections | the target Story's main row is published | story, type, text, date, "shown publicly from" |
| Media | (updates and deletes; uploads never) | file identity, alt, creator, credit, copyright, license, art-direction intent |
| Publication Global | `_status = published` | every field |

Draft saves and autosaves never write a versioned record's main row, so they
can never differ. A publish, an edit of published content, a newer rewrite
being published, an unpublish, trash and restore, a scheduled publish
(Payload's own `schedulePublish` task writes the main row) and deleting a
public record all do. Deletion records the mutation in `afterDelete` when
`beforeDelete` found the record public, inside the same transaction.

**Deliberate over-invalidation.** A public Media field edit advances the
revision whether or not any published content references the asset (finding
references would mean querying Lexical JSON). Organizational and machine
fields (folder, uploader, preparation status and timestamps, manifests) never
do. A correction edit on a published story always counts.

**Future-dated corrections.** A correction "shown publicly from" a future time
is hidden from the snapshot (as from Live Preview) until then; its save queues
`advance-public-revision` on the `publication` queue with `waitUntil` at that
time, which records one public mutation in its own transaction.

**Media preparation.** Preparation itself never advances the revision. When a
Phase 5 generation is promoted, the media task re-queues
`prepare-public-snapshot` for the current revision (no bump): a snapshot that
was waiting for that asset completes; otherwise the job no-ops. This prevents
"revision R, snapshot not ready, media now ready, no job left".

**The Phase 8 import** sets `context.bylineImport = true`, which suppresses
per-document bumps (`publicRevisionSuppressed`). After a completed import it
must record exactly one mutation (`recordPublicMutation(req, "import",
{ force: true })` in a transaction, or run `publication:snapshot:prepare` after
an explicit bump). Integrations that write public data with raw SQL must call
`recordPublicMutation` themselves.

## Producer version

`PUBLIC_SNAPSHOT_V1_PRODUCER_VERSION` (`src/public/snapshot/version.ts`)
versions what THIS code projects and how it serializes it. It is separate from
the snapshot schema version (v1, the consumer contract), the public content
revision and Phase 5's media recipe version. A completed pointer is usable
only when `completed_revision = current_revision`, `completed_schema_version =
1` and `completed_producer_version` is the running producer's. Bump the
producer version whenever projection or compatibility serialization changes:
after deploying, discovery reports "not ready" (`outdated-producer`) until
`publication:snapshot:prepare` (or the next job) writes a new artifact for the
**same** revision. It is never written into the v1 JSON envelope, whose top
level is closed.

## Snapshot preparation

Task `prepare-public-snapshot`, queue `publication`, concurrency key
`public-snapshot`, `exclusive` and `supersedes`: one runs at a time and a newly
queued job deletes older pending ones. Run only by the publication worker,
never in a Next request.

1. Read the state. If the pointer is usable for the current revision and the
   artifact verifies, finish (`reused`).
2. Capture R; collect the complete public projection (`collectPublicSnapshot`)
   without a transaction or row locks.
3. Validate (shared v1 validator, producer checks, every manifest, privacy).
4. Serialize the exact UTF-8 bytes (`serializePublicSnapshot`, the one
   serialization the digest, store and endpoints use).
5. Reread the revision: changed → `stale`, nothing written.
6. Store the immutable artifact; 7. promote `WHERE current_revision = R`; lost →
   `stale` (`promotion-lost`); 8. retention.

Outcomes `ready`, `reused`, `stale` (normal coalescing) and `not-ready`
(referenced media still preparing; the media task re-queues) complete the job.
Everything else fails it with a classified `PublicSnapshotError`
(`invalid-projection`, `unsupported-story-content`, `storage-failure`) whose
message names Story/Media IDs, headlines, filenames and issue paths, never
private bodies, and the job retries twice.

## Immutable storage and retention

```text
<BYLINE_PUBLICATION_MEDIA_DIR>/
  objects/<aa>/<sha256>                 Phase 5 prepared media (append-only)
  snapshots/v1/snapshot-v1-r<R>-<sha256>.json
```

The same persistent volume as prepared media, separate code
(`src/public/snapshot/store.ts`). A write creates a uniquely named temp file
exclusively, writes, fsyncs, closes, then hard-links it to its final
content-addressed name (a link never replaces a file) and fsyncs the directory.
An existing identical artifact is reused; different bytes under an existing
name are a storage failure. The pointer is promoted only after the file exists.
An orphaned artifact from stale work is harmless.

Retention runs only after a promotion: the current artifact always, the four
newest, anything younger than one day (a reader that discovered it can
finish), at most twenty in all; temp files older than an hour are removed.
Prepared media objects are **not** garbage-collected in this phase; snapshot
retention now records which generations retained snapshots can still name,
which a future, separate GC needs.

## Build endpoint contract

All three use the Phase 5 credential and shared `src/build/auth.ts`:
`Authorization: Bearer $BYLINE_BUILD_TOKEN` (≥32 characters, constant-time
comparison, never logged, never a query parameter), `Cache-Control: private,
no-store`, and 404 for everything when no token is configured.

| Route | Answers |
| --- | --- |
| `GET /api/byline/build/snapshot` | 200 `{ schemaVersion: 1, revision, generatedAt, digest, bytes, url }` when the pointer is usable; **503** `{ code: "byline_snapshot_not_ready", currentRevision, completedRevision, reason }` (`no-completed-snapshot`, `older-revision`, `outdated-producer`, `unsupported-schema`); 500 `byline_snapshot_pointer_corrupt` for an unusable recorded pointer. A database read only; never generates. |
| `GET /api/byline/build/snapshot/:sha256` | streams exactly that artifact (strict 64-hex digest, no paths, no listing); 404 when it is gone; never regenerates |
| `GET /api/byline/build/direct?revision=R` | recovery only: 409 unless R is current, 409 `byline_snapshot_ready` when a completed snapshot exists, else collects with the job's collector, validates, rereads the revision and returns the exact v1 bytes only if it is still R (409 `byline_snapshot_revision_changed` otherwise); 503/500 with a classified code for media-not-ready or invalid projections |
| `GET /api/byline/build/media/:sha256` | Phase 5, unchanged |

The pointer URL is `BYLINE_NEWSROOM_URL` (else the request origin) +
`/api/byline/build/snapshot/<digest>`.

## The build

`apps/web/scripts/astro-with-publication.mjs` chooses one source:

1. `BYLINE_BUILD_SNAPSHOT_FILE`: a deliberate local snapshot.
2. `BYLINE_NEWSROOM_BUILD_URL` (e.g. `https://newsroom.example/api/byline/build`)
   with `BYLINE_BUILD_TOKEN`: Payload.
3. The existing WordPress pointer + artifact (`BYLINE_BUILD_SNAPSHOT_URL` or
   derived from `NEXT_PUBLIC_WP_API_URL`). No build token; an ordinary
   WordPress 503 is never treated as the Payload recovery contract.
4. `BYLINE_LEGACY_REST_BUILD=1`.

A deployed newsroom never turns a WordPress build into a Payload one; Phase
10/cutover sets the variable deliberately.

**The Payload state machine** (`apps/web/lib/build-acquisition.ts`):

| Discovery | Then |
| --- | --- |
| 200 | fetch the advertised artifact (only from the configured origin, at exactly `…/snapshot/<digest>`); verify byte count, SHA-256, schema, revision, `BYLINE_EXPECTED_REVISION`, every dataset and every embedded manifest. **Any** problem fails the build. |
| 503 `byline_snapshot_not_ready` | `GET …/direct?revision=<currentRevision>`; 200 → the same verification (revision must equal R); 409 revision changed/ready → rediscover, at most 3 attempts in all; anything else fails |
| anything else | fail: 401/403, unreachable, malformed JSON, an unrecognized 503 or other 5xx, an unsupported schema |

Recovery is for **absence**, never for corruption or an outage. Both modes
write the accepted snapshot to `.byline-build/public-snapshot.json` and set
`BYLINE_PREPARED_SNAPSHOT_FILE`; from there there is one code path.
`frontend-phases.json` records `dataMode` (`prepared-snapshot`,
`direct-source-recovery`, `fixture`, `legacy-rest-compatibility`),
`snapshotSource` (`payload`, `wordpress`, `file`), revision, digest, bytes,
attempts, request count and timings.

**Rendering stays local.** Astro starts with
`scripts/assert-snapshot-network.mjs`, which now forbids WordPress REST,
any `/api/byline` path and the newsroom build origins; a swallowed request is
still recorded and fails postbuild.

**Prepared media.** After the snapshot is accepted the wrapper collects the
closed, validated descriptor set of every embedded manifest
(`snapshotPublicationManifests` → `descriptorsFromManifests` →
`closedDescriptorSet`, recorded in
`.byline-build/publication-media-descriptors.json`). After Astro succeeds and
before npm's `postbuild`, it acquires them with Phase 5's
`materializePublicationMedia` (bounded concurrency, the build token, streaming
hash/size/type verification, atomic writes) into `out/_byline/media/` from
`BYLINE_NEWSROOM_BUILD_MEDIA_URL` or `<BYLINE_NEWSROOM_BUILD_URL>/media`.
Payload paths are already final (`/_byline/media/…`) and never pass through the
WordPress `/_wordpress-media` mirror; WordPress snapshots keep their existing
materializers. The build never copies or mounts the newsroom volume.
`verify-static-export.mjs` additionally forbids the build origin's `/api/` and
`/admin` in the output.

**Incremental builds** are unchanged: route `cacheKey`s stay fine-grained
dependency digests computed from the local snapshot, never the global revision.

## Snapshot v1 projection decisions

`src/public/snapshot/collect.ts`; every dataset is an explicit allowlist and
every dataset is present.

- **posts**: published main Stories (never `draft: true`), except Stories in an
  internal Section (excluded by design). A published Story without a Section
  or slug fails preparation (it has no public URL). `date`/`modified` are the
  publication's local wall time, `date_gmt`/`modified_gmt` UTC; `link` is
  `publicSite + /YYYY/MM/DD/<section>/<slug>/` dated in the publication
  timezone; `title`/`excerpt` are escaped headline and deck paragraphs;
  `content.rendered` is below; `categories` = the Section, `tags` = Topics,
  `sticky: false`; `byline`/`weeklyWildcat` carry presentation, alignment,
  reporting note, format and the normalized YouTube video; `contributors` is
  the ordered Payload byline; `corrections`; `_embedded` author / featured
  media (with this story's caption) / terms. `kicker` and live coverage have
  no v1 field yet (live arrives in Phase 11).
- **Contributors**: a staff Person with a profile page is `{ type: "user", id,
  name, slug, link }` and an `authors` record; a guest is `{ type: "guest", … }`
  (in `guests` only with a profile page). Staff without a profile page are
  credited by name like a byline-only guest, so no profile route is created.
  `author` (WordPress compatibility only) is the first such staff author, else
  0 with no embedded author: a guest-only story keeps its real byline.
- **authors**: non-guest People with a profile page from `publicPeople()`;
  `bylineProfile` carries pronouns, role, short bio, directory flag, the
  prepared portrait and the fixed socials record (Website, Instagram, TikTok,
  LinkedIn, X recognized by label; the explicit `publicEmail`). Never Users.
- **guests**: guests with a profile page. **categories/tags**: non-internal
  Sections and every Topic with `count` from the included posts only.
- **pages**: published Pages; their bounded prose converted on demand by
  Payload's Lexical HTML converter restricted to the prose features
  (`page-html.ts`); anything else fails preparation. `noindex` →
  `bylinePage.indexing`.
- **corrections**: only for included posts, publicly visible ones only, newest
  first; canonical type IDs (`editor-note`).
- **coverages**: `publicCoverages()` adapted (reading order, lead story, prepared
  square artwork); never the brief, team, interviews, tasks or resources.
- **schoolEvents**: every published event; `startDate`/`endDate` are publication
  local `YYYY-MM-DDTHH:MM` and `display` reproduces WordPress's `M j, Y g:i A`;
  the "upcoming" cutoff still runs at build time in `sourceTimezone`.
- **attachments**: only referenced Media (lead and body media, public
  portraits, public Collection artwork), each with a current Phase 5
  generation whose files are all in the store, else preparation reports
  `not-ready` naming the asset. `source_url` is the largest natural file,
  `media_details.sizes` the natural ladder, `bylineImage.artDirection` the
  focal point, crop rectangles and `legacyRenditionsFromManifest` (Social
  always), credits from the Media record, and `bylinePublication.manifest` the
  validated Phase 5 manifest (a namespaced build extension; the shared
  validator checks it). Never an original, Library preview, private URL or
  path.

`validatePublicSnapshot` runs the shared validator (`@byline/content`
`validatePublicBuildSnapshotV1`, now used by both the producer and Astro) plus
producer checks: timezone, canonical links, prepared attachments, body media
named by the catalog. `assertPublicSafe` is a sentinel layer (forbidden private
keys, newsroom URLs and storage paths, the build token) after the allowlists,
which remain the privacy boundary.

## Structured bodies in v1 (temporary bridge)

**Snapshot v1 compatibility serialization only; Phase 9 removes it.** v1 needs
`content.rendered: string`, but new stories are `byline-v1`. The producer
normalizes the stored body with `normalizePayloadStoryBody`, resolving Media
through the prepared catalog, and renders the canonical `ArticleBody` with the
canonical `@byline/ui` `ArticleBodyContent` (the same registry as
`StructuredArticleBody` and Live Preview) to its inner markup. Astro's legacy
body path wraps it in its one `.article-body`; `<div class="article-body">` +
the v1 HTML is byte-identical to `StructuredArticleBody` (unit-tested with the
fixture that uses every registered block). No Lexical JSON, no second block
switch: a block added to the registry is rendered by the registry. Unsupported
nodes, formats, unsafe links and blocks whose media disappeared fail
preparation naming the story; a block's unfinished parts are left out exactly
as Live Preview and publishing leave them out. Body images use the largest
prepared natural file (the canonical renderer has a single `src`); Phase 9's
structured contract can carry the full responsive set.

`react-dom/server` is loaded at run time through a specifier the bundler cannot see (`article-html.tsx`): the snapshot task is part of Next's route graph through `payload.config.ts`, and Next refuses a static import there. This was found by running a real newsroom server; unit and CLI paths do not catch it.

The newsroom tsconfig includes `packages/ui/src/**/*.tsx` so Payload's CLI
(`tsx`) compiles the shared renderer with the automatic JSX runtime in the
worker and the operational scripts, as Next and Vitest already do.

## Publication-local dates and routes

`@byline/content` `publication-dates.ts` is the one implementation of the
publication's calendar day, WordPress `date`/`date_gmt` and the article path
(`publicStoryPath`). Live Preview (`preview/payload-story.ts`, now given the
publication timezone) and the snapshot both use it, so an 11:30 p.m. Eastern
publication is `/YYYY/MM/<Eastern day>/…` in both, across DST changes.

## Publication Global

`publication` (`src/globals/Publication.ts`), administrators only, edited in
the raw System screens: typed fields for identity, location, locale, timezone,
public URLs, branding assets, appearance (Weekly Wildcat only), sections,
navigation, social profiles, feature switches, licensing and SEO. Versions and
drafts stage changes; the snapshot reads the main (published) Global through
`normalizePublicationConfig`. A draft never advances the revision; publishing a
different configuration does. There is no `revision` field
(`publication.revision` is the snapshot's R) and no secret. `urls.cms` is the
publication's public CMS fact, never Payload's `serverURL`.

Weekly Wildcat's configuration has one canonical, non-test source,
`@byline/theme-weekly-wildcat/publication`: every field default, the
unpublished fallback, Live Preview's default and the public site's fallback
(`apps/web/lib/publication.ts` re-exports it). After the Global is published it
is the CMS authority; Live Preview reads it too. `BYLINE_PUBLICATION_JSON` is no
longer read by the newsroom.

## Events

`events` (`src/collections/Events.ts`), administrators via System until a
Byline screen exists: title, slug, type, start/end instants, all day, location,
description, external URL, `eventStatus` (named so because Payload's drafts
`_status` would share its database enum), versions and drafts, trash, and the
legacy ID field so the Phase 8 import keeps WordPress IDs.

## Operations and deployment

```text
newsroom-web          next start                  BYLINE_BUILD_TOKEN, both volumes
newsroom-media        npm run jobs:media          queue media (Phase 5)
newsroom-publication  npm run jobs:publication    queue publication (snapshots, timed public changes)
newsroom-scheduled    npm run jobs:scheduled      queue default (Payload scheduled publish)
```

Same image, same two volumes, no public port for the workers. Each queue has
exactly one owner. (`npm run jobs` runs every queue for development.)

```sh
npm run publication:snapshot:status --workspace @byline/newsroom
npm run publication:snapshot:prepare --workspace @byline/newsroom
```

`status` prints the current revision, ready/not ready, schema and producer
versions, the completed pointer (revision, producer, digest, bytes,
generatedAt, filename, artifact present), retained artifacts and pending
snapshot jobs; never the token, paths or account data. `prepare` runs the job's
preparation synchronously (exit 2 not ready, 3 stale).

Deploying Phase 7 (or a new producer version):

1. `payload migrate` (creates the state table at revision 0, Events and the
   Publication Global).
2. Start `jobs:publication` (and `jobs:scheduled`).
3. `publication:snapshot:prepare`, then `publication:snapshot:status`: ready,
   artifact present.
4. Only then point a test build at `BYLINE_NEWSROOM_BUILD_URL`.

**Recovery.** Discovery 503 "not ready": read `status`; if media is preparing,
wait for `jobs:media`; if a job failed, read its error (it names the story or
asset), fix the content, run `prepare`. 500 "pointer corrupt" or a missing
artifact: the build fails by design; run `prepare` (a missing artifact is
re-prepared for the same revision) and rebuild. Never point a build at direct
recovery to escape corruption.

## Acceptance

- `apps/newsroom/tests/integration/public-snapshot.test.ts` (real PostgreSQL,
  Jobs Queue, Sharp): revision rules for drafts, autosaves, publish, edits,
  rewrites, unpublish, trash/restore, delete, scheduled publish, every public
  collection and every private one; rollback when the job insert or a later
  hook fails; coalescing; the revision fence (deterministic races, lost
  promotion, superseding, producer version); privacy sentinels in every private
  domain plus key allowlists; draft isolation for Stories, Pages, Events and the
  Global; prepared media, not-ready media and re-queue without a revision;
  unsupported content; local dates; DST events; the endpoints over HTTP with
  the build's own acquisition client: completed snapshot, recognized not-ready
  → direct recovery identical to the artifact, bounded races, corrupt pointer
  and missing artifact.
- `apps/newsroom/tests/public-snapshot-units.test.tsx`: dates/paths and Live
  Preview agreement, the renderer bridge parity, Pages HTML, the store and
  retention, the privacy sentinel.
- `apps/web/tests/build-acquisition.test.ts`: the state machine, including every
  never-fall-back case.
- `apps/web/tests/payload-media-seo.test.ts`: prepared SEO and social images.
- `apps/newsroom/scripts/payload-snapshot-parity.ts`: the parity gate. Seeds a
  deterministic newsroom with real photographs, builds the complete static site
  from the completed snapshot and again through direct recovery of the same
  revision, each through postbuild verification, and compares the accepted
  snapshot, descriptor set, routes, route keys and every output file.

## Phase 9 blocks and snapshot v1

The v1 bridge renders any native body whose blocks need only Media (every
new media block, Data Table, Chart / Map, footnotes and so on): the footnote
list and every block come from the canonical renderer. A body that needs
Related Coverage, a Poll or a Repository Interactive cannot be rendered by v1
(it carries no references and no interactive registry): preparation fails with
`unsupported-story-content` naming the story and block, rather than leaving the
block out. These stories need snapshot v2. The v1 gates (`payload-snapshot-parity`,
`public-snapshot.test.ts`) seed from `FIXTURE_FIRST_PHASE_BODY`.

## What Phase 9 changes

Snapshot v2 carries `PublicArticleBody` and the prepared-media manifests
directly; the v1 HTML bridge, WordPress-shaped attachments and the
`bylinePublication` extension go away for v2 consumers. The revision,
transactional mutation, fence, storage, endpoints and acquisition state
machine stay.
