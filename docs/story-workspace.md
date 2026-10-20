# Story Workspace

The Story Workspace is the newsroom's coordination page for **one story**:
what it is, who is on it, who still needs to be interviewed, when those
interviews happen, what photos are needed, where the draft lives, and what comes
next. It replaces the shared "where are we on this story?" spreadsheet. It does
**not** replace Google Docs or Gutenberg.

```
WordPress story (the canonical `post`)
  ├── brief                       private plain text
  ├── contributors / editor       existing Byline contributors and workflow
  ├── reporting plan
  │     ├── sources               story-scoped targets (a person, an org, "Name TBD")
  │     └── appointments          where and when someone has to be
  ├── tasks                       existing `byline_task`
  ├── media / production          one or more production assignments
  ├── resource links              Google Docs, folders, any URL
  └── activity                    existing private activity stream
```

Open it from Home's Story Peek (**Open full story workspace**), a Planning Quick
View, the Calendar, or directly:

```
/wp-admin/admin.php?page=byline-planning&story=123
/wp-admin/admin.php?page=byline-planning&story=123&appointment=<uuid>   # opens that appointment's scheduler
```

It is a view of the Planning screen (Stories stays highlighted in the sidebar),
not a second Stories menu. Its primary actions, **Edit article** and **Preview**,
open the real WordPress editor and preview.

## Principles (from SNO FLOW, Kordiam and Superdesk)

Reviewed against the vendors' current public documentation on 2026-10-20.
Interaction and data principles were adopted; no UI was copied.

- **A story is the central planning object, and different work around it has
  different owners and deadlines** (SNO FLOW *Creating and Assigning Stories*:
  writing, photo, design and video assignments each have their own deadlines;
  Kordiam: tasks hang off the story). Byline therefore has *tasks*,
  *appointments* and *production assignments* as separate objects that all point
  at the same story. There is intentionally **no Writing assignment**: the
  WordPress story, its contributors and its workflow already are the writing work.
- **Checklists are small actions; the story can live elsewhere** (SNO FLOW
  checklists and Google Drive integration). Tasks stay `byline_task`; the draft
  stays a Google Doc and Byline links to it. There is no Drive API, OAuth,
  Picker or synchronization.
- **Task deadline ≠ appointment time** (Kordiam story card). A photographer may
  need to *arrive* at 2:30 PM while photos are *due* at 5 PM.
- **Story status, task/production status and publication status are separate**
  (Kordiam status levels). See the vocabulary table below.
- **An event is not the article** (Superdesk planning items, events and
  coverages): one story can involve several interviews or coverage moments, and
  each is its own record.
- **Templates seed repetitive structure** (Kordiam story templates, SNO
  checklists): Byline presets seed workflow, deadline offset, starter tasks and
  production assignments — never sources, article text or fake appointments.

## Feedback and undo

Workspace mutations use Sonner toasts for lightweight confirmation. When the
server has an exact compensating mutation, the success toast stays for ten
seconds and offers **Undo**. Undo always writes back to the server; it never
pretends to restore something only in the React cache.

Undo is offered for brief edits, workflow/detail edits, writer changes, task
completion/reopen, task creation, link changes, and source/appointment/production
adds or edits. Deleting a source, appointment, or production assignment keeps an
explicit confirmation and has no Undo action because recreating the record would
change its identity (and source removal can also clear appointment links).
Removing a link is different: the linked document is untouched and no newsroom
record points at the link ID, so removal is immediate and reversible from the
toast.

## Date semantics

These are different things and are never synchronized or labelled just "Due":

| Concept | Meaning | Stored as |
| --- | --- | --- |
| Story deadline | internal deadline for the whole story | date (`_wwh_story_deadline`) |
| Planned publication | editorial publishing target | instant (`_byline_story_planned_publish_at`) |
| WordPress schedule | actual native scheduled publication | `post_date` of a `future` post |
| Task due | deadline of one small action | instant |
| Production due | delivery deadline of a photo/graphic/video | instant |
| Appointment | when someone interviews / covers / shoots | instant (`startAt`/`endAt`) |
| Target window | when something should happen, exact time unknown | date-only `windowStart`/`windowEnd` |

Everything is read in the **WordPress site timezone** — never the browser's.
Exact appointment times are stored as UTC instants; a target window is date-only
and is **never converted to a timestamp**, so "next week" never becomes a
fabricated Monday-at-nine. Shared client logic lives in
`src/workspace/schedule-model.ts` (tested across a DST boundary and a UTC/site
day mismatch).

## Status vocabularies (deliberately separate)

| Domain | Values |
| --- | --- |
| Story workflow | pitch, assigned, reporting, writing, editing, ready, on-hold, dropped, published (derived) |
| WordPress publication | draft, pending, future, publish, private … |
| Task state / priority | open, completed / low, normal, high, urgent |
| Production status | needed, assigned, in-progress, uploaded, selected, done |
| Source status | planned, contacted, waiting, needs-scheduling, scheduled, interviewed, declined, unavailable |
| Appointment status | planned, tentative, confirmed, completed, cancelled |

## Reporting plan

### Sources
Story-scoped, not a CRM. `label` is required and need not be a real name
(*Local reporter*, *Name TBD*). Optional `role` and `organization`. Up to four
assignees. Private plain-text `notes`. **No phone, email or contact fields**:
those belong in a linked Doc. "Interview three students" stays a *task* until
the individual people are known; then add them as sources.

### Appointments
`kind` (interview, meeting, event, photo, press-conference, game, performance,
reporting, other), `status`, `scheduleMode`:

- `unscheduled` — no timing at all.
- `window` — a date range (`windowStart` required, `windowEnd` optional, end ≥
  start). Quick choices *This week* / *Next week* / custom range.
- `exact` — `startAt` required, `endAt` optional (≥ start).

The server decides which timing fields survive from the mode, so switching modes
never leaves a stale value active. Optional free-text `location`, `notes`, an
optional link to a `sourceId`, and up to four assignees. Completed and cancelled
appointments remain in history.

Removing a **source** clears `sourceId` on its appointments and deletes nothing
else. Removing an **appointment** leaves its source, tasks and links alone.

### Storage and concurrency
Bounded private story meta (never a post type, never `show_in_rest`):

| Meta | Limit |
| --- | --- |
| `_byline_story_brief` | 4,000 characters |
| `_byline_story_sources_v1` | 30 sources |
| `_byline_story_appointments_v1` | 40 appointments |
| `_byline_story_media_assignments_v2` | 12 assignments |
| `_byline_story_resources` | 24 links |

Every collection write goes through `byline_story_collection_update()`
(`includes/editorial/collections.php`): read, derive the next list, write only if
the row still equals what was read (WordPress's compare-on-previous-value
`update_post_meta`), retry on a lost race, and return **409** when it cannot
resolve. Editing one record also accepts `expectedUpdatedAt`; a stale edit is a
409 instead of an overwrite. The brief takes `expectedBrief` likewise.

## Media and production assignments

Several assignments per story (photo, gallery, graphic, video, audio, other),
each with its own title, owner, due time, status and Media Library attachments.
Alt-text, credit, rights and featured-image awareness are unchanged and
computed per assignment by the same reconciliation code as before.

### Transition from the single request
Installed sites have `_byline_story_visual_request_v1`. That value is **never
deleted or rewritten**.

1. While `_byline_story_media_assignments_v2` is absent, reads *project* the
   installed request as one assignment with the stable id `legacy-v1`. Reads
   never write.
2. The first intentional v2 mutation (adding or editing an assignment) writes the
   projected assignment plus the change in one atomic add.
3. From then on the original single-request API (`/editorial/stories/<id>/media`,
   `byline_get_editorial_media_request()`, readiness, Planning rows) speaks for
   the story's **primary** assignment — the first unfinished one — so existing
   clients and tests keep working.

## Who can see and change what

`edit_post` alone is too narrow: co-writers, photographers and reporters hold
real work on stories they cannot edit. `byline_story_context()` (in
`includes/editorial/story-context.php`) answers who may **view** a story's
private context. A user with `edit_posts` may view when any of these hold: they
can `edit_post`; they are a real Byline contributor; they are the assigned
editor; they hold a task, a production assignment, or a source/appointment on it.

Viewing never grants canonical-field writes. Workflow, writers, deadline and
planning dates keep their existing capability checks.

| Role on the story | Brief, sources, appointments | Production | Canonical fields |
| --- | --- | --- | --- |
| `edit_post` / contributor / assigned editor ("manager") | add, edit, delete any | add and edit; assign others only with `edit_others_posts` | only with the original capabilities |
| Participant holding only assigned work | edit records assigned to them; create appointments for themselves only | status, notes and files of their own assignment | none |
| Everyone else | no access (403) | no access | none |

A participant's read model contains only the records assigned to them and no
activity trail.

## Read model and routes

One bounded aggregate (no per-source/per-task requests), never the article body:

| Route beneath `/byline/v1` | Purpose |
| --- | --- |
| `GET /editorial/stories/<id>/workspace` | story, brief, sections, contributors, statuses, tasks, sources, appointments, mediaAssignments, resources, activity, previewUrl, people, capabilities, `errors` |
| `POST /editorial/stories/<id>/brief` | save the brief (`expectedBrief` for conflicts) |
| `POST /editorial/stories/<id>/sources[/<uuid>]`, `DELETE …/<uuid>` | source CRUD |
| `POST /editorial/stories/<id>/appointments[/<uuid>]`, `DELETE …/<uuid>` | appointment CRUD |
| `POST /editorial/stories/<id>/media-assignments[/<uuid\|legacy-v1>]`, `DELETE …/<uuid>` | production assignment CRUD |
| `POST /editorial/stories/<id>/resources[/<id>]`, `DELETE …/<id>` | links, now with optional `purpose` |
| `GET /editorial/schedule?from&to[&includeTasks=1]` | note-free calendar feed: exact appointments, needs-scheduling, production due dates |
| `POST /editorial/stories` | now accepts `{title, preset?}` and returns the workspace payload + `workspaceUrl` |
| `GET /editorial/media` | adds `assignments` (one row per assignment); `requests` is kept |

Each optional section of the workspace payload is read independently: a failure
reports under `errors` and the rest renders. `GET …/quick-view` remains only as a
protected compatibility route (nothing in the admin calls it); Home, Stories and
the workspace all use the flat `/workspace` model.

## Files & links

Private URLs the team pastes. Deterministic recognition (Google Doc/Sheet/Slides,
Drive folder/file, external link) is unchanged and never fetches the remote
document. Optional `purpose`: draft, interview-notes, transcript, research, data,
folder, other (links stored before purposes existed read as `other`). Exactly one
`draft` link surfaces **Open working draft ↗** at the top of the workspace.
URLs with embedded credentials or control characters are still rejected.

## Templates

New-story templates are the existing Byline presets (`presets.php`). A preset can
now seed: workflow stage, deadline offset (only for users who may set deadlines),
a section, **starter tasks** (descriptors with `when: "always"` and a `title`) and
**production assignments** (`mediaAssignments`: title, type, optional
`dueOffsetDays`). Defaults are intentionally short: News (interview sources,
verify names/details, self-edit draft), Sports recap (confirm score/stats, file
recap), Photo story (a photo assignment). Editors can adjust them with the existing
preset endpoints. Templates never create sources, article text or appointments,
and a template that cannot fully apply never costs the reporter their draft.

## Activity and notifications

Activity actions: `source_added`, `source_status_changed`, `appointment_created`,
`appointment_scheduled`, `appointment_rescheduled`, `appointment_completed`,
`appointment_cancelled`, `media_assignment_created`, `media_assignment_assigned`,
`media_assignment_status_changed`. Records hold a human summary ("Gibson Bell
scheduled Interview Mrs. Hamby for Tuesday at 10:15 AM.") and a stable UUID —
never notes, locations, URLs or request payloads.

Notifications reuse the durable job system and each person's preferences. A new
**Interviews and appointments** preference covers: assigned to you, rescheduled
(exact time or place of something already scheduled) and cancelled. Production
assignments reuse the existing media-assignment preference. Notes edits, source
status changes and target-window edits send nothing. Payloads hold opaque
references; titles and times are resolved at delivery after re-checking access.
The due-work digest now also lists *confirmed* appointments starting within a day,
never target windows.

## Privacy

None of this is public. No field is registered with `show_in_rest`, none is
added to `wp/v2/posts`, RSS, SEO metadata, public manifests or Astro snapshots,
and none appears in Planning list responses beyond note-free counts and the next
appointment's title and timing. Deleting a story removes its private meta with it.

## Validation

```sh
npm run typecheck:plugin && npm run test:plugin && npm run test:php && npm run build:plugin
npx wp-env start --config=.wp-env.json
npx wp-env run cli --config=.wp-env.json wp eval-file wp-content/plugins/wordpress-plugin/tests/integration/story-workspace.php
npx playwright test --config=wordpress-plugin/e2e/playwright.config.ts story-workspace.spec.ts
```

`tests/story-reporting-regression.php` covers sanitization, limits, UUIDs,
compare-and-swap races, mode switching, timezone normalization, unlink-on-delete
and the permission matrix against an in-memory meta store;
`tests/integration/story-workspace.php` covers real REST, roles, media
projection/materialization, notifications and public non-exposure.
