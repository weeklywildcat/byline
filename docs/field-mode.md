# Field Mode

`/admin/field` is the reporter's phone-first capture screen: the same
authenticated newsroom, with a deliberately small shell. It is not a second
CMS. Open it from the account menu (**Field Mode**) or ⌘K (**Open Field Mode**).

It does not render the desktop template, the article editor, the Front Page
Desk or Distribution.

## What am I covering?

The landing screen is built from work Byline already has
(`GET /api/byline/field`): appointments assigned to the person, their open
production assignments, and Stories with running live coverage that they
manage, work on or may publish live updates for. Items are grouped **Now**
(within about three hours before to two hours after, or live), **Today** and
**Upcoming** (seven days). **Find another story** (a `Command` search in a
Drawer) is the escape hatch, limited to Stories the person works on.

## One composer

A Story session shows its coverage context (time, place, appointment,
assignment, LIVE) and one composer (`InputGroup`): Photo, Record, Attach; then
**Save note**, and while coverage is live **Post live** or, without the grant,
**Send to live desk**. Nothing is called just "Save" when it could publish,
and a line under the buttons says what is private and what readers see.

Routing (`routeCapture`, docs/reporting.md):

| Action | Goes to |
| --- | --- |
| text + Save note | a private Reporting Note on the Story |
| text + Post live / Send to live desk | a Live Update (published, or a draft for the desk) |
| a photo chosen while writing a live update | Media, attached to that update (one asset) |
| a photo otherwise | Media for the Story, linked to the person's open assignment when unambiguous (a Drawer asks when there are several) |
| Record (from an appointment) | a private Reporting File with the Story, appointment and source |
| Attach | a private Reporting File |

Photos record the uploader, Story, assignment, original file hash, the EXIF
capture time (read in the newsroom zone, else the file time) and, for staff,
the photographer's Person name as creator and credit. Rights and alt text stay
deliberate: outside photography is never marked cleared by uploading.

## Live permission

Story plans have **May publish live updates** (`livePublishers`, editors
control it). The grant publishes, edits, pins and removes live updates on that
Story only. It never publishes or unpublishes the article, never changes the
Story's publication state and never makes anyone an editor
(`access/live-context.ts`, enforced by the `live-updates` collection).
Without it, anyone on the Story writes drafts for the live desk.

## Outbox

Every capture goes into one IndexedDB outbox per account first
(`ui/field/outbox.ts`), then is sent. Each item says one of: **Saved**,
**Queued offline**, **Sending**, **Uploading 62%**, **Posted**, **Sent to live
desk**, **Failed — Retry**. A live update is only "Posted" when the server
stored it as published.

- Client-generated idempotency keys; the server returns the first record for a
  retried key, so a lost response never duplicates.
- No Service Worker Background Sync: sending runs while Field Mode is open, on
  reconnect, on becoming visible and every ten seconds.
- One upload at a time; a live update waits for its photo.
- Connection errors and busy servers retry by themselves; a refused capture
  (403, 400) waits for the reporter's Retry.
- If the browser will not store a file (quota), the item says **Not safely
  queued — keep this page open**; it is never silently dropped.
- Sent files are removed from the device; sent items are kept a day for Recent.

## Layout

Primary controls are at least 44px with visible text. The composer sits at the
top, so a software keyboard never covers it. Safe-area insets are respected;
there is no horizontal overflow at 320px. Secondary tasks (recording, choosing
an assignment, story search) use bottom Drawers; Field never uses Sheet for
small mobile actions.

## Validation

```sh
npx vitest run tests/field-outbox.test.ts                          # in apps/newsroom
npx vitest run --config vitest.integration.config.ts tests/integration/field.test.ts tests/integration/live-coverage.test.ts
```
