# Publication media

How a photo, PDF or audio file goes from a private newsroom upload to an
immutable file the static newspaper serves. This is the source of truth for
Phase 5 of the [Payload migration](payload-migration.md); the Media workspace
UI is in [media-workspace.md](media-workspace.md).

The invariant:

> Payload stores and prepares private editorial media. Astro selects a closed
> set of prepared publication assets. Cloudflare Workers Static Assets serves
> those immutable files. The public site never needs Payload, PostgreSQL, R2,
> an image proxy or camera originals at reader request time.

```text
upload (private original) ──► artDirection intent (focal point, custom crops)
        │                              │
        └──── publicationRevision ◄────┘   (bytes-affecting changes only)
                     │
          Payload Jobs: prepare-publication-media (queue "media", one per asset)
                     │  Sharp, recipe vN, off the request
                     ▼
   BYLINE_PUBLICATION_MEDIA_DIR/objects/<aa>/<sha256>   (immutable, content-addressed)
                     │  manifest on Media.publicationAssets (status ready, revision, recipe)
                     ▼
   Story Publish ── readiness service ── refuses unless every direct Media is current
                     │
   Astro build ── GET /api/byline/build/media/:sha256 (BYLINE_BUILD_TOKEN)
                     │  verify SHA-256, bytes, type; stage; promote
                     ▼
   apps/web/out/_byline/media/images/ab/marching-band--wide-1920--abcdef0123456789.webp
                     │  Cache-Control: public, max-age=31556952, immutable
                     ▼
   Cloudflare Workers Static Assets
```

## Two kinds of storage

| | Private uploads | Prepared publication files |
| --- | --- | --- |
| Setting | `BYLINE_MEDIA_LOCAL_DIR` | `BYLINE_PUBLICATION_MEDIA_DIR` |
| Holds | camera originals, Payload's `library` preview (≤640px WebP) | web renditions, crops, SEO/social images, exact PDF/audio copies |
| Read by | Payload's file route under Media `read` access (newsroom, Live Preview) | the media worker, the readiness service, the build-only endpoint |
| Public? | never | only through the static build, by content hash |

Both are persistent volumes and **must be separate**: the store refuses to be
inside the upload directory or contain it. Relative values resolve from the
newsroom app (`apps/newsroom`), never the process's working directory
(`src/publication-media/paths.ts`), so the Next server and the separate worker
always agree. Production should use absolute mount paths.

## Art direction is intent

`Media.artDirection` holds `ImageArtDirectionIntent` (`@byline/core`):

```ts
{ version: 1, focalPoint: { x: 0–100, y: 0–100 }, crops: { wide?, card?, standard?, square?, portrait?, social?: { x, y, w, h } /* 0–1 of the oriented original */ } }
```

- Only crops that differ from the automatic focal-point crop are stored, and a
  crop must be its shape's ratio (2% tolerance). No URLs, no renditions: those
  are generated output and live in the manifest.
- Payload's native focal point is **off** (`focalPoint: false`). In Payload
  3.92 a native focal change re-processes the upload synchronously; Byline
  prepares publication files in a job. Payload still keeps `focal_x`/`focal_y`
  columns because Media has an image size; Byline neither reads nor writes
  them, and a `beforeOperation` hook strips native focal and `uploadEdits`
  input so a request can never trigger that reprocessing.
- The only normal write path is `PUT /api/byline/media/:id/art-direction`
  (field access refuses `artDirection` in ordinary Payload writes; the system
  and the controlled import may write it).
- The legacy WordPress `ImageArtDirection` (with its generated `renditions`)
  is unchanged for the production WordPress path. `artDirectionIntentFromLegacy`
  imports a WordPress attachment's focal point and crops; its generated URLs
  are dropped and new content-addressed files are prepared instead (Phase 8).

### The editor

`MediaArtDirectionDialog` (`@byline/newsroom-screens`) ports the WordPress
photo-crops behavior to Nova: focal point (click, drag, arrow keys, Shift for
bigger steps), react-easy-crop for the six shapes, Auto vs Custom, Reset to
focal point, placement previews (Immersive, cards and lists, social and
search), low-resolution warnings, one Save, a discard confirmation, full
screen on every size. It loads the private original for precision and uses
the Library preview for thumbnails. Animations keep their whole frame: only
the focal point applies.

The Media shell owns the one dialog (`useMediaWorkspace().editArtDirection(id)`);
the Media inspector, the Story lead image and the Photo block reach it through
`BylineEditorHost.editArtDirection`. Story blocks never know a Media endpoint.

Saves compare-and-swap on `expectedUpdatedAt` under a row lock. When the
inspector has unsaved file details and the reader saves crops, the inspector
adopts the crop save's `updatedAt` as its base only if the editor opened at
the inspector's own base (`rebasedUpdatedAt`): the reader's own crop save is
never a false conflict, while someone else's intervening edit still is.

## Publication revision

`Media.publicationRevision` (hidden, system-only) counts changes to what the
prepared files are made from:

| Moves the revision | Never moves it |
| --- | --- |
| upload, source replacement | alt, creator, credit, copyright, license |
| focal point | source URL, captured date, folder |
| custom crops | any other metadata |

The same write that moves it marks `publicationAssets.status = "preparing"`
and queues a job in the same transaction (`collections/Media.ts`). A person's
write can never set any `publicationAssets` field or the revision.

## Recipe version and effective readiness

`PUBLICATION_MEDIA_RECIPE_VERSION` (`@byline/content`) versions *how* files are
prepared; `PUBLICATION_MEDIA_SCHEMA_VERSION` versions the manifest's shape. A
generation is current only when **all** agree
(`publicationMediaReadiness()`, the one rule; never test `status` alone):

- `status === "ready"`
- `preparedRevision === publicationRevision`
- stored `recipeVersion` and the manifest's `recipeVersion` equal the current recipe
- the manifest validates

Library badges use `effectivePublicationStatus()`, so a stale generation shows
as not prepared, never ready.

## `publicationAssets` (system-owned)

`status` (`not-prepared | preparing | ready | failed`), `preparedRevision`,
`recipeVersion`, `sourceHash` (SHA-256 of the original), `manifest`,
`preparedAt`, `queuedAt`, `startedAt`, `attempts`, `failureCode`,
`failureMessage`. `manifest` and `sourceHash` are readable only by
administrators and the system; Byline's screens get a summary
(`MediaPublicationDetail`: state, reason, current vs prepared revision,
prepared time, failure message, warnings, `canRetry`) and never paths, hashes
or manifests. System transitions (`publication-media/state.ts`) are single
conditional SQL statements keyed on the revision and never touch `updatedAt`,
so preparation is never an edit for compare-and-swap.

## Jobs Queue

- `jobs.enableConcurrencyControl = true`. Task `prepare-publication-media` on
  queue `media`, input `{ mediaId, revision, recipeVersion }`, concurrency key
  `publication-media:<mediaId>`, exclusive, `supersedes: true`: one preparation
  per asset at a time, and a newer queued generation deletes obsolete pending
  ones. Already-running work is not trusted:
  1. at start, reread the Media record; a different revision exits `stale`;
  2. mark it preparing only if still at that revision (conditional update);
  3. prepare, verify every object is in the store;
  4. reread again; promotion itself is `UPDATE … WHERE publication_revision = $rev`,
     so a stale job can never overwrite a newer result.
  A job queued by newer code than the worker (`recipeVersion` greater than the
  worker's) exits `worker-outdated` without writing.
- Byline queues as the system (`overrideAccess`); the Jobs API stays
  administrator-only. If queuing itself fails, the asset is marked Failed
  (`queue-failed`) so Retry is offered, never a silent "preparing" forever.
- **Retry** (`POST /api/byline/media/:id/publication/retry`) checks the Media
  collection's own `update` access (uploader or editor), then requeues the
  current revision as the system.
- Workers: `npm run jobs:media --workspace @byline/newsroom` (polls the `media`
  queue every 5 s, 4 jobs per pass) is the production process: same image,
  same two volumes, separate from Next. `npm run jobs` (all queues plus
  schedules, every minute) stays for development. Sharp never runs in a Next
  request.
- `npm run publication-media:requeue --workspace @byline/newsroom [-- --dry-run]`
  queues every asset whose generation is not current (after the Phase 5
  migration, after a recipe bump; `--include-preparing` for a stuck worker).

## The recipe (v1)

All numbers live in `apps/newsroom/src/publication-media/recipe.ts`.

- Decode once, **apply EXIF orientation before any crop or resize**, convert
  to sRGB; every output is re-encoded without metadata (no EXIF, GPS, XMP or
  camera data). Sharp's decompression limit stays on.
- **Natural family**: WebP at 320, 640, 960, 1440, 1920, 2560, never upscaled;
  when larger targets don't fit, the source width itself is added so the
  sharpest real file is offered (a 1600px source gives …, 1440, 1600). The
  largest natural file is the public fallback/source. Photos: WebP q80;
  graphics (PNG/GIF sources or real transparency): lossless WebP.
- **Explicit crops** (Wide, Card, Standard, Square, Portrait): physically
  cropped files at the shape's `IMAGE_CROP_SHAPE_DETAILS` widths, same
  never-upscale rule. Automatic crops are *not* generated: the site uses the
  natural files with the focal point as `object-position`.
- **SEO**: one 16:9 (Wide), 4:3 (Standard) and 1:1 (Square) candidate, up to
  2560px. An explicit crop's largest file serves its ratio; otherwise one
  automatic focal-point crop. Under 1200px adds a `low-resolution-seo` warning.
- **Social**: always a real 1200×630 JPEG (q84, mozjpeg) from the Social crop
  or the focal point; a smaller source gives a smaller image and a
  `low-resolution-social` warning, never invented pixels.
- **Animation** (animated GIF/WebP): a bounded animated WebP (≤960px, ≤300
  frames, ≤120 MP decoded) plus first-frame stills for natural/SEO/social. Over
  a limit fails clearly; an animation is never silently flattened.
- **PDF and audio**: validated (PDF header/EOF, MP3/M4A/WAV signatures) and
  published as exact-byte copies. No transcoding.
- **Every output** must be ≤ 25 MiB (Cloudflare Workers Static Assets'
  per-file limit) or preparation fails with an actionable message.
- No AVIF+WebP matrix, no six-shape × all-width matrix, no build-time Sharp.

### Tuning the recipe

The v1 quality values are conservative defaults, not measured on
representative newsroom photographs (none are in the repository). To tune:

```sh
npm run benchmark:publication-media --workspace @byline/newsroom -- /path/to/photos 1920 70,75,80,85,90
```

It prints bytes and PSNR per quality for each photo. Use a set that covers R7
and iPhone originals, dark stadium, gym and stage light; choose the lowest
quality whose worst dark/noisy case is acceptable; change `recipe.ts`, bump
`PUBLICATION_MEDIA_RECIPE_VERSION`, deploy, then run
`publication-media:requeue`.

## Manifest

`@byline/content` `publication-media.ts`: provider-neutral, validated by an
explicit validator, public-safe only (no filesystem paths, CMS URLs,
credentials or original paths). Every file descriptor has `sha256` (full),
`bytes`, `mimeType`, `publicPath`, and width/height for images.

```ts
type PublicationImageManifest = {
  schemaVersion: 1; recipeVersion: number; kind: "image";
  source: { width; height; animated; hasAlpha };
  focalPoint: { x; y };
  natural: ImageFile[];                       // smallest first
  crops: { [shape]?: { rect; renditions: ImageFile[] } };   // explicit only
  seo: { "16x9" | "4x3" | "1x1": ImageFile & { origin: "custom" | "auto" } };
  social: ImageFile & { origin };
  animation: (ImageFile & { frames }) | null;
  warnings: Array<{ code; target?; message }>;
};
type PublicationFileManifest = { schemaVersion: 1; recipeVersion; kind: "document" | "audio"; file: Blob };
```

Public paths come from one helper, `publicationMediaPath()`:
`/_byline/media/<images|documents|audio>/<sha[0..2]>/<filename-stem>--<label>--<sha[0..16]>.<ext>`.
The directory and fingerprint are derived from the bytes, so different bytes
never share a path and a path is never overwritten.

## Prepared blob store

`publication-media/blob-store.ts` is the only filesystem boundary:

```text
<BYLINE_PUBLICATION_MEDIA_DIR>/objects/<aa>/<full sha256>
<BYLINE_PUBLICATION_MEDIA_DIR>/staging/<random>.part
```

Writes stage, fsync, close, re-hash, then promote with a hard link (atomic,
refuses to replace). Identical bytes reuse the existing object; different
bytes under an existing name is a `store-corrupt` error. Nothing is deleted
when an asset changes or is deleted (see garbage collection). No database
BLOBs, no R2 dependency.

## Publishing

`publication-media/readiness.ts` answers "are these Media publishable now, and
why not?": the record exists, is the right kind (the lead image must be an
image), has no metadata gaps (alt and credit for images; rights or source for
everything), its generation is current by the rule above, and every manifest
object is in the store.

- Stories: a `beforeChange` hook refuses `_status: "published"` (Publish,
  Publish changes, scheduled publish) unless every Media the story publishes
  directly is ready: `featuredMedia` plus every Media in byline-v1 body blocks
  (`collectMediaIds()`: Photo, Gallery items, Document). Imported `legacy-html`
  bodies are not scanned (Phase 8). Drafts and autosaves are never blocked.
  The refusal is a Payload `ValidationError` naming each file and reason on
  `featuredMedia` or `body`. Publish permission stays editor-only.
- Story header: derives `lead=…&ids=…` from Payload's form state through a
  `useFormFields` selector (typing never changes it), asks
  `GET /api/byline/media/publication-readiness`, polls every 5 s only while
  something prepares, re-checks immediately before Publish, and explains a
  server refusal by its media reason. Problems link to the asset in Media and
  offer Retry where Retry is the fix.

## Live Preview

Preview projects Media through the same shared article geometry, with the
focal point from the intent and Payload's authenticated private URLs (original
plus Library preview). It never uses prepared publication files, so a custom
crop that is still preparing is never shown through an older generation: until
the public build, Preview frames every shape with the focal point. The crop
editor shows explicit crop placement exactly. Preview refreshes Media on
Payload's next supported population refresh; there is no custom transport.

## Build-only acquisition

`GET /api/byline/build/media/:sha256` (`publication-media/build-endpoint.ts`):

- exists only when `BYLINE_BUILD_TOKEN` (≥32 characters) is configured; a
  newsroom without one runs normally and the route answers 404;
- `Authorization: Bearer <token>`, compared in constant time, never logged;
- accepts exactly a lowercase 64-hex SHA-256, resolves only inside
  `objects/`, never lists, never reads `BYLINE_MEDIA_LOCAL_DIR`, no Media IDs,
  no database query per download;
- streams the object with `Cache-Control: private, no-store`.

`apps/web/scripts/publication-media.ts` (`materializePublicationMedia`) takes a
**closed** set of descriptors (or manifests), downloads each with bounded
concurrency, verifies SHA-256, byte count and file type while streaming,
stages, and atomically renames to the descriptor's `publicPath` under
`apps/web/out/`. Missing blob, wrong hash/size/type, unsafe path or a refused
credential fails the build. There is no fallback to a private original or any
other URL, no whole-Library copy, and no image transformation. CLI seam:

```sh
BYLINE_NEWSROOM_BUILD_MEDIA_URL=https://newsroom.example/api/byline/build/media \
BYLINE_BUILD_TOKEN=… npm run materialize:publication-media --workspace @byline/web -- --descriptors media.json
```

It is **not** wired into the WordPress `postbuild`: production media still
comes from the WordPress materializers until Phase 7 feeds this from the
Payload snapshot.

`verify-static-export.mjs` checks that every `_byline/media` file is named by
its own SHA-256, is within the static limit and carries no EXIF/XMP (a camera
original copied there fails), that acquisition staging is gone, and that the
output contains no build credential, build endpoint or private newsroom file
URL.

## Caching

`_headers`: `/_byline/media/*` → `Cache-Control: public, max-age=31556952,
immutable` (safe because paths are fingerprinted and never reused);
`/_byline/live/*` stays `no-store`.

## Failure and retry

| Failure code | Meaning | Fix |
| --- | --- | --- |
| `source-missing` / `source-unreadable` / `source-invalid` | the original is gone or not a valid file | re-upload, or restore the file and Retry |
| `file-too-large` / `output-too-large` | a published file would exceed 25 MiB | upload a smaller version |
| `animation-too-long` / `animation-too-large` | over the animation limits | shorter or smaller animation |
| `queue-failed` | Byline could not queue the job | Retry |
| `store-incomplete` / `preparation-error` | infrastructure problem | Retry; check the worker and volume |

Failed is a terminal state shown in the inspector and the Story header; Retry
is offered to the uploader and editors. A transient crash retries once
automatically.

## Phase 7–9 compatibility

- Snapshot v1 maps the largest natural file to the compatibility
  `source_url` (`largestNaturalImage`) and explicit crop families to
  `bylineImage.artDirection.renditions` (`legacyRenditionsFromManifest`; Social
  always present), keeping the focal point and crop intent.
- SEO and social descriptors are available to the Astro SEO layer.
- Phase 9 can consume the manifest directly instead of WordPress shapes.
- The materializer is the consumer; Phase 7 supplies descriptors from the
  canonical snapshot. Public rendering never depends on the newsroom's local
  storage layout.

## Object storage (later)

Off-site replication can be added behind `blob-store.ts` (copy each new
object to R2/S3 by its hash) without changing manifests, public paths or the
build endpoint contract. It is not a runtime or public-delivery dependency.

## Garbage collection (later)

Nothing deletes prepared objects today: a deployed or retained snapshot may
reference an older generation. When snapshot retention is defined (Phase 7+),
a collector can delete objects referenced by no current manifest and no
retained snapshot, after a grace period. Staging files older than an hour can
be cleared safely (`clearAbandonedStaging`).

## Deployment

```text
newsroom-web     next start          BYLINE_MEDIA_LOCAL_DIR, BYLINE_PUBLICATION_MEDIA_DIR, BYLINE_BUILD_TOKEN
newsroom-media   npm run jobs:media  same image, same two volumes (no public port)
PostgreSQL
volumes:  /var/lib/byline/media  (private uploads)   /var/lib/byline/publication-media  (prepared files)
```

The static build needs only `BYLINE_BUILD_TOKEN` and the build endpoint URL.
After deploying Phase 5, run `payload migrate`, start the worker, then
`publication-media:requeue`.

## Tests

- Contracts: `apps/web/tests/image-art-direction-intent.test.ts`,
  `apps/web/tests/publication-media-contract.test.ts`.
- Build: `apps/web/tests/publication-media-materializer.test.ts`,
  `apps/web/tests/static-headers.test.ts`.
- Newsroom: `tests/publication-media-units.test.ts`,
  `tests/media-art-direction-inspector.test.tsx`,
  `tests/live-preview-art-direction.test.ts`,
  `tests/integration/publication-media.test.ts` (permissions, revisions, the
  real Jobs Queue and Sharp, stale promotion, failures, Retry, publishing, the
  build endpoint and an end-to-end acquisition),
  `tests/integration/publication-media-migration.test.ts`.
- Browser: `tests/browser/publication-media.spec.ts` (needs a running newsroom
  and `jobs:media`).
