# Payload public build snapshots

Payload projects its published records into the native **Public Snapshot v3**
contract in `@byline/content`: Snapshot v2's content plus Byline Data's
published projects and release descriptors ([Byline Data](byline-data.md#snapshot-v3)).
Builds still read v2. The artifact is the complete content input for
the static Astro build. The renderer gets canonical public Stories, including
their semantic bodies, and renders them with the same article presentation
builder and components as Live Preview.

```text
Published Payload records
  → explicit public projection
  → validated Snapshot v2
  → immutable artifact
  → local .byline-build/public-snapshot.json
  → Astro static HTML, feeds, sitemaps and redirects
  → materialize the declared prepared Media blobs
  → verify the static export
```

## Revision semantics

`byline_publication_state` has one row. It stores the current public content
revision and the completed pointer (revision, schema version, SHA-256, byte
length, generation time, filename and producer version). It stores the
public revision's timestamp separately from the artifact's generation time.

A committed public change advances the revision and queues
`prepare-public-snapshot` in the same PostgreSQL transaction. Drafts, autosaves,
private planning changes and Media preparation do not advance it. The worker
coalesces pending work and always prepares the current revision. Media that
becomes ready can requeue a snapshot for the same revision.

The snapshot captures publication-local canonical routes with
`publicStoryPath()`. Timed Corrections and Poll windows are evaluated at the
public revision's clock. A delayed job advances the revision when the
visibility or voting window changes. Two acquisitions of the same revision
therefore see the same timed state. Collection modification time records the
latest public change to the Collection. Older Collections without that
timestamp use their creation instant.

The version numbers serve separate purposes.

- **Snapshot schema version 3** identifies the public wire format (v2 is still read).
- **Producer version 4** identifies this projection and serialization. Bump it
  when changing the bytes that would otherwise be reused for the same revision.
- **Public content revision** advances only on a committed public change.
- **Publication Media recipe version** identifies the preparation algorithm for
  immutable files.

A completed pointer from another schema or producer version is treated as
`byline_snapshot_not_ready`. The publication worker queues preparation on
startup if it needs a current pointer. Replacing the pointer at the same
content revision requires no publication-state migration or revision bump.

## The revision fence

1. Capture current revision R and its clock.
2. Collect published main records and prepared Media without holding a
   transaction or locking records.
3. Validate the full projection and run `assertPublicSafe`.
4. Serialize the exact UTF-8 bytes and reread the public revision. A change
   during collection makes the result stale.
5. Write the immutable artifact and promote the pointer with
   `WHERE current_revision = R`. A writer who commits after the reread and
   before promotion causes the promotion to lose.

The worker and direct recovery both call `buildPublicSnapshotBytes`.
Concurrent changes can make a collection temporarily inconsistent. The
revision fence distinguishes such races from invalid public records.

## Immutable artifact

```text
<BYLINE_PUBLICATION_MEDIA_DIR>/snapshots/v3/
  snapshot-v3-r<R>-<sha256>.json
```

Data Releases use the same immutable artifact store
(`public/artifacts/store.ts`) under `data/v1/<sha256>.json`.

`SnapshotStore` stages a file in the final directory, fsyncs it and finalizes it
atomically without replacing a previous file. It verifies an existing file
before reuse. The SHA-256 and byte length in discovery cover the exact stored
bytes. Retention protects the current artifact, keeps recent artifacts with
reader grace, enforces a hard bound and removes abandoned staging files. A lost
promotion can leave an unreferenced artifact until a later prune.

## Build endpoints and recovery

The three endpoints share the build-only bearer token `BYLINE_BUILD_TOKEN`
and return `Cache-Control: private, no-store`.

| Request | Result |
| --- | --- |
| `GET /api/byline/build/snapshot` | The completed pointer for the current revision, or 503 with `byline_snapshot_not_ready`. A corrupt pointer fails. A build that names its readable versions in `X-Byline-Snapshot-Versions` gets 406 for any other. |
| `GET /api/byline/build/snapshot/:sha256` | The exact retained bytes for the advertised digest. |
| `GET /api/byline/build/data/:sha256` | The exact bytes of a dataset's current Data Release; 404 for an obsolete or unknown one. |
| `GET /api/byline/build/direct?revision=R` | Builds the same validated artifact if discovery reports not ready and R is current. A revision race or a newly completed pointer returns 409 so the build can rediscover within a bounded retry. |

The build verifies the schema, revision, digest and size of an advertised
artifact. It uses direct recovery only for the specific not-ready response.
Credential failures, corrupt artifacts, unsupported schemas and newsroom
outages fail the build. Both acquisition paths converge on
`.byline-build/public-snapshot.json`.


## Public-site deployment hook

Snapshot preparation and static deployment are separate durable jobs on the
`publication` queue. When `prepare-public-snapshot` finishes with a current
`ready` or `reused` Snapshot v2 pointer, it queues `deploy-public-site`.
That task POSTs the private HTTPS `BYLINE_DEPLOY_HOOK_URL` and retries provider
or network failures independently of snapshot preparation.

All deploy jobs share one exclusive, superseding concurrency key. A newer
pending revision replaces an older pending deploy, and a job that reaches the
front of the queue re-reads `byline_publication_state` before sending HTTP. If
the public revision moved on, the obsolete deploy is skipped; the newer
snapshot will queue its own deployment. This keeps a Cloudflare/provider
outage from invalidating a good immutable snapshot and avoids deploying a
known-stale revision.

The hook URL is a credential-like deployment secret. Keep it only in the
newsroom/worker environment; never store it in the Publication Global or
expose it to the static build. If the variable is absent, snapshot production
continues normally and no deploy job is queued.

Set `BYLINE_NEWSROOM_BUILD_URL` to the newsroom's build API root and
`BYLINE_BUILD_TOKEN` to the shared credential. `BYLINE_EXPECTED_REVISION`
can set a minimum public revision. An offline file supplied with `BYLINE_BUILD_SNAPSHOT_FILE` is validated against the same contract. If it names prepared media, also configure the build media endpoint and token.

Astro renders from the local snapshot and the build network assertion rejects
any newsroom request in that process. After rendering, the build wrapper
derives a closed descriptor set from `datasets.media`. The existing Media
materializer downloads those exact files from the authenticated Media build
endpoint, verifies SHA-256, byte length and MIME type, and atomically writes
them under `out/_byline/media`.

## Native datasets

The envelope contains `schemaVersion`, `revision`, `generatedAt`,
`publication`, `datasets`, `counts`, optional `frontPage` and (v3) `data`. The JSON Schema documents the wire
format and `validatePublicBuildSnapshotV2` checks its runtime invariants.

| Dataset | Public facts |
| --- | --- |
| Stories | Canonical `PublicStory<number>` with publication instants, Sections, Topics, contributors, lead Media ID, presentation, video, Corrections, live coverage and `PublicArticleBody`. |
| People | Editorial identity, bios, public contact and links, visibility settings and portrait Media ID. |
| Sections and Topics | Public taxonomy IDs, names, slugs, descriptions and routes where the site has one. |
| Pages | Published bounded prose HTML, indexing, publication instants and the route including public parents. |
| Corrections | Published correction, clarification, editor-note or substantive-update with its public Story ID. |
| Collections | Public coverage or series facts, artwork Media ID and ordered public Story IDs. |
| Events | Start and end instants, all-day flag, type, location and status. Astro formats times with the publication locale and timezone. |
| Polls | Public definitions used by articles, current window state and public aggregates for finished polls that reach the minimum response threshold. |
| Media | Public metadata and one validated `PublicationMediaManifest` per referenced prepared asset. |
| Redirects | Permanent public routes, reserved for persisted redirects. |

The runtime validator checks counts, IDs, canonical routes, relationship
integrity, each ArticleBody, referenced Story and Poll facts, Media descriptors,
and registry keys supplied by the publishing and rendering hosts. Astro uses
native Stories for articles and article SEO. Older homepage, archive and
directory views have a web-only adapter. Article route cache keys include the
native record, render dependencies and its prepared Media. Content revision
alone does not invalidate every route.

### Article bodies and repository interactives

`normalizePayloadStoryBody()` produces the same `ArticleBody` that goes into
the snapshot. The semantic block and inline-footnote contract goes from the
published record to `buildArticlePresentation()`, `StoryArticle` and
`ArticleBodyContent`. Imported stories can explicitly carry
`{ format: "legacy-html", html }`.

The body carries a small Media table. The top-level catalog owns all natural
and crop renditions, SEO and social images, focal points, animation and file
descriptors. The public image host selects from the prepared ladder for the
sizes the block declares. Live Preview retains its private image sources.

Related Coverage uses projected Story facts and prepared thumbnails. A Poll
block shows the public question, choices, availability and results when
released. Online voting is currently unavailable.

A Repository Interactive stores its stable key, title and description. The
repository registry supplies the static fallback. The article loads the
dispatcher when an interactive is present, and the dispatcher imports only
the client chunks for keys on that page. The fallback remains readable with
JavaScript disabled. The build fails for a missing key or declared client.

### Privacy

Projection starts from published main records and names only public fields.
A newer draft or autosave stays private. The artifact excludes planning,
sources, assignments, private Collection fields, accounts, vote rows, private
Media locations and newsroom infrastructure. Live update authors are currently
account relationships, so native live updates carry no account attribution.
The shared validator rejects unexpected fields in closed records, and
`assertPublicSafe` checks for private keys, endpoints, paths and credentials
before bytes can be promoted or served directly.

## Operations and verification

- `npm run jobs:publication --workspace @byline/newsroom` runs the publication
  queue. `jobs:media` prepares assets and `jobs:scheduled` handles Payload
  scheduled publishing.
- `npm run publication:snapshot:status --workspace @byline/newsroom` reports
  the current revision, pointer, verification and pending jobs.
- `npm run publication:snapshot:prepare --workspace @byline/newsroom` runs
  the same builder and promotion as the worker. A not-ready outcome identifies
  the missing prepared asset. A stale outcome means a newer revision won.

The Phase 9 gate is `apps/newsroom/scripts/payload-snapshot-parity.ts`. Use an
empty migrated PostgreSQL database, disposable original and publication
Media directories, and Playwright Chromium. Run
`npm run payload --workspace @byline/newsroom -- run scripts/payload-snapshot-parity.ts <output-dir>`.
An installed Chrome channel can be selected with
`BYLINE_PARITY_CHROME_CHANNEL=chrome`.

The gate publishes a Story with every registered block (the shared fixture),
inline footnotes and Source references,
plus people, Media, Pages, a Collection, a Correction, an Event and
timezone-sensitive coverage. It clears only the completed pointer between
builds. It compares accepted v2 content except `generatedAt`, prepared Media
descriptors, route manifests, cache keys and every static file. The only
volatile output is `_byline/build-metrics.json` and the build timestamp in
`_byline/manifest.json`. It checks rendered facts and private sentinels, and
exercises the interactive in Chromium with JavaScript enabled and disabled.
