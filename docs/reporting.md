# Reporting

Reporting is the raw material a Story is built from. It lives **inside the
Story** (the **Reporting** section of the Story's Plan workspace, see
[the Story screen](story-screen.md#plan)), never as a separate app.

> Capture once. Preserve provenance. Route by context. Verify deliberately.
> Publish deliberately. Reuse everywhere.

> Journalists capture information; they do not file it into Byline's database
> architecture.

## The Story-centric model

| Layer | What | Where it lives |
| --- | --- | --- |
| Plan | brief, workflow, team, Sources, Appointments, tasks, production | existing Story planning (unchanged, authoritative) |
| Material | notes, links, photos, recordings, documents | the capture's canonical home (below) |
| Journalism | transcript, verified selection, Reported Quote, live update | transcripts, selections, the article body, Live |
| Output | website, Front Page, (Distribution) | the published Story, [Front Page](front-page.md) |

## Capture routing

A capture is routed to **one canonical home** by `routeCapture()`
(`apps/newsroom/src/domain/reporting.ts`), the only place the decision is made:

| Capture | Canonical home |
| --- | --- |
| typed private note | `reporting-notes` |
| pasted reporting URL | the Story plan's existing Files & links |
| photograph | Media (the one asset system), with capture provenance |
| interview recording, PDF, document | private `reporting-files` |
| imported transcript | `reporting-transcripts` |
| live text for readers | `live-updates` |

There is no polymorphic "materials" table. The **Story Material read model**
(`reporting/material.ts`, `GET /api/byline/stories/:id/reporting`) assembles one
chronological feed from those homes. It carries transcript *summaries* only:
a transcript body loads when it is opened.

## Context inheritance

`resolveCaptureContext()` (`reporting/context.ts`) resolves, once and on the
server, what Byline already knows: the Story, an Appointment (and its Source),
a Source, the person's one open production assignment (photos, when
unambiguous), the uploader and the time. A recording made from "Interview Coach
Smith" is filed with that Appointment and Source without anyone choosing them.
Screens pass where they were opened from; they never re-derive relationships.

Captures are idempotent on a client key (`clientKey`, unique per collection):
a retried submission returns the first record (`duplicate: true`).

## Ground rules

Sources record `groundRules` (`unspecified`, `on-record`, `background`,
`off-record`), `recordingPermission` and a note. These are facts a reporter or
editor enters; software never infers them. Captured material copies them as a
**snapshot** (`groundRules` on files, transcripts and selections), so a later
Source edit never rewrites what was agreed for an interview already recorded.

`quoteUse()` decides what a quote may do next:

- on the record: the normal verified-quote path;
- background or unspecified: allowed, with the restriction shown before any
  public-use action; Byline never writes attribution for background;
- off the record: kept, searchable and highlightable privately, but **never**
  offered for one-click insertion. An editor may approve public use with a
  reason (`/selections/:id/off-record-override`), which is recorded in the
  Story's activity. A Story save that references off-the-record words without
  that approval is refused (`guardOffRecordQuotes`).

## Confidentiality

Every reporting record has `confidential`. Access (`access/reporting-context.ts`)
is SQL-level, so lists, counts, REST reads and the file route all obey it:

| Material | Who sees it | Who changes it |
| --- | --- | --- |
| normal | the Story's managers and participants | creator, the Story's managers, assigned editor, administrators |
| confidential | **only** the creator, the Story's *assigned* editor and administrators | the same three |

Being an editor, a contributor or holding a production assignment does not
grant confidential material. A recording's confidentiality propagates to its
transcript and selections. Changes are logged in the Story's activity.

## Private files

`reporting-files` is a Payload upload collection with its own directory
(`BYLINE_REPORTING_LOCAL_DIR`, default `apps/newsroom/reporting-files`), never
Media's. Files are served only by Payload's file route, under the collection's
read access, with `Cache-Control: private, no-store`. Nothing here is in any
public projection, snapshot, feed or build. Promoting outside material for
publication is a separate, deliberate Media workflow.

Payload's multipart limit is the larger of Media's (50 MB, still enforced for
Media) and reporting's (300 MB, for long interviews).

## Transcripts and provenance

A transcript belongs to one recording and one Story and stores Byline's own
provider-neutral segments (`domain/transcript.ts`):

```ts
type TranscriptSegment = { id: string; startMs: number | null; endMs: number | null; speaker?: string; text: string };
```

plus state (`queued | processing | ready | failed`), origin (**MACHINE** or
**MANUAL TRANSCRIPT**), provider, model, language, duration, a plain-text search
projection and a failure summary. Segment ids are stable: editing words or
renaming a speaker keeps timing and ids; stale edits are a 409.

Manual import accepts `.txt` (untimed paragraphs, optional `[mm:ss]` stamps,
`Name:` speakers), `.srt` and `.vtt` (`<v Speaker>` voices).

Selections (`transcript-selections`) are **snapshots** of the words, timing,
speaker, attribution and ground rules, never character offsets. They start
**saved**; a reporter marks a quote **verified** after listening to the audio.
Changing the words un-verifies it. Machine transcription never verifies.

The chain stays inspectable (`GET /api/byline/reporting/selections/:id/provenance`):

```
Source → Appointment → Recording → Transcript → Selection → Verified quote → Reported Quote → Story
```

A Reported Quote inserted from Write's **Reporting reference** carries the
selection's id in a private block field (`reportingSelection`). The semantic
article body never includes it (tested), so it never reaches Live Preview, a
snapshot or the public site. Each Story save maintains the indexed reverse
relationship `transcript-selections.usedIn`; no rich text is scanned on reads.

## Transcription

The provider boundary is `reporting/transcription/provider.ts`. The initial
provider is self-hosted **faster-whisper** (`services/faster-whisper`, with VAD
and segment timestamps; word-level alignment is off by default because Byline
does not store it. The model and inference tuning are configuration and nothing
assumes a GPU):

| Variable | Meaning |
| --- | --- |
| `BYLINE_TRANSCRIPTION_PROVIDER` | `faster-whisper`, or unset (not configured) |
| `BYLINE_TRANSCRIPTION_URL` | the service's address (no credentials in the URL) |
| `BYLINE_TRANSCRIPTION_MODEL` | optional model name |
| `BYLINE_TRANSCRIPTION_LANGUAGE` | optional language hint |
| `BYLINE_TRANSCRIPTION_TIMEOUT_MS` | total processing limit; default 2 hours (max 4 hours) |
| `BYLINE_TRANSCRIPTION_PRIVATE` | default `1`: the newsroom's own service, so recordings queue automatically after upload. `0` for anything that leaves the newsroom: never queued automatically |
| `BYLINE_TRANSCRIPTION_TOKEN` | optional bearer token |

Jobs run on their own `reporting` queue (`npm run jobs:reporting`), so a long
interview never delays publication, snapshots or maintenance. The self-hosted
service also owns the expensive Whisper work as an idempotent background job:
Byline submits the recording once, then polls short status responses. A stable
run key means an automatic Payload retry reattaches to work that is still
running instead of starting a second transcription.

The service reports **Waiting for transcription worker → Loading Whisper model
→ Transcribing audio (percent) → Transcript ready**. Byline persists that
progress on the transcript; Reporting polls active work every five seconds and
the focused transcript view does the same, so progress survives navigation.
The service runs one Whisper job at a time by default
(`WHISPER_MAX_WORKERS=1`) to avoid several CPU-heavy interviews competing on
a newsroom server. CPU installs can tune `WHISPER_COMPUTE_TYPE=int8`,
`WHISPER_CPU_THREADS` and `WHISPER_BATCH_SIZE`; batch sizes above 1 use
faster-whisper's batched inference pipeline. `WHISPER_WORD_TIMESTAMPS=1`
exists only for deployments that explicitly need per-word alignment. Its
`/health` endpoint remains responsive while Whisper is working and reports
the active inference settings.

Temporary failures (network, 5xx, 429, model-loading failures and processing
timeouts) retry with backoff up to five attempts; a retry uses the same
service job where possible. Malformed or unsupported audio fails once with its
reason. Without a provider uploads and manual import work, and the screens say
"Transcription is not configured". The uploader is notified when a transcript
is ready.

## Screens

- **Plan → Reporting**: search, `+ Capture` (Note, Record or upload interview,
  Upload file, Upload photo, Add link, Import transcript), Up next, a single Material feed with
  view filters (All, Audio, Documents, Photos, Notes), and Sources and
  Appointments (a rail at ≥880px of the section, otherwise a Sheet), then the
  Story's saved quotes and whether each is verified. Capturing from
  a Source or Appointment pre-binds it. Ground rules are edited from the
  Source's badge. The interview panel records in the browser or uploads an
  existing audio file (MP3, M4A, WAV, AAC, Ogg, WebM, checked by
  `recordingUploadProblem` before sending); either becomes the same private
  recording with the bound Source and Appointment, and queues for
  transcription like any other.
- **Transcript** (`?transcript=<id>`, a focused view with Back to Plan): pinned audio, timestamps
  that seek, the active passage following playback, an `InputGroup` search
  with next/previous and a count, in-place speaker and text edits, and a
  selection bar docked in the layout (never over the words) with Save
  highlight, Save quote and Copy. Source, ground rules and saved quotes sit in
  a Resizable panel at ≥880px, otherwise a Sheet.
- **Write → Reporting reference**: the Story's saved quotes, notes,
  recordings and sources, searchable; a pane beside the article when there is
  room, otherwise a Sheet. Verified quotes: Play source, Copy, Insert quote
  (the existing Reported Quote block with words and attribution). Unverified:
  Verify before inserting. Off the record: no insert. Notes can be copied;
  transcripts open in full.

## Privacy

None of `reporting-notes`, `reporting-files`, `reporting-transcripts` or
`transcript-selections` is in `public/tracking.ts`; reporting writes never
advance the public revision (tested). Hard-deleting a Story removes its
reporting material and files.

## Validation

```sh
npm run typecheck:newsroom
npx vitest run tests/reporting-domain.test.ts                      # in apps/newsroom
npx vitest run --config vitest.integration.config.ts tests/integration/reporting.test.ts
```
