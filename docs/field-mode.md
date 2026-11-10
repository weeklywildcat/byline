# Field Mode

`/admin/field` is the reporter's phone-first capture screen: the same
authenticated newsroom, with a deliberately small shell. It is not a second
CMS. Open it from the account menu (**Field Mode**) or ⌘K (**Open Field Mode**).

It does not render the desktop template, the article editor, the Front Page
Desk or Distribution.

## What am I covering?

The landing screen is built from work Byline already has
(`GET /api/byline/field`): appointments assigned to the person, their open
production assignments, and Stories in Live mode with coverage running that they
manage, work on or may publish live updates for. Items are grouped **Now**
(within about three hours before to two hours after, or live), **Today** and
**Upcoming** (seven days). **Find another story** (a `Command` search in a
Drawer) is the escape hatch, limited to Stories the person works on.

## One Story, two surfaces

Field is not a second CMS and live coverage is not a second Story: **Write** is the
full editorial surface, **Field** is fast phone-first capture, over the same Story,
live-update records, permissions and timeline (docs/live-coverage.md). The Story's
header has **Field Mode**, which opens `/admin/field?story=<id>&from=story` straight
to that Story, skipping the picker. `from=story` is the only return hint Field
understands (a fixed value, never a URL), so **Back** returns to the Story, while a
Story opened from the landing screen goes back to the assignments. **Open full story**
(in the overflow menu) returns to the Write workspace on the live section.

## One composer

A Story session shows its coverage context (time, place, appointment, assignment,
LIVE) and one composer (`InputGroup`): Photo, Record, Attach. What the buttons are
depends on the Story:

| Story | Composer | Buttons |
| --- | --- | --- |
| **Standard** | "What did you see or hear?" Capture only | Save note |
| **Live, not started** | capture only; editors see "Live coverage is ready" with **Go live**, staff see "Live coverage hasn't started yet. You can still save notes, photos and recordings." (a direct publisher cannot start coverage) | Save note |
| **Live now** | "What's happening?" header shows `Headline ● LIVE` | **Private** `Save note` · **Live update** `[Publish now][Send to desk]` for direct publishers, `[Send to live desk]` for everyone else |
| **Ended** | "Coverage ended · 10:42 PM"; editors get **Resume live coverage**; staff can still save notes, photos and files but not publish | Save note |

The timeline stays visible in Live mode. The overflow menu holds only secondary
actions: Open full story, and for editors Set up live coverage, Manage direct
publishers and End live coverage (an `AlertDialog`). The main live posting action is
never in the menu. Private notes and public live updates are always labelled apart.

Routing (`routeCapture`, docs/reporting.md):

| Action | Goes to |
| --- | --- |
| text + Save note | a private Reporting Note on the Story |
| text + Publish now / Send to desk / Send to live desk | a Live Update (published, or a draft for the desk) |
| a photo chosen while writing a live update | Media, attached to that update (one asset) |
| a photo otherwise | Media for the Story, linked to the person's open assignment when unambiguous (a Drawer asks when there are several) |
| Record or upload a recording (from an appointment) | a private Reporting File with the Story, appointment and source |
| Attach | a private Reporting File |

Photos record the uploader, Story, assignment, original file hash, the EXIF
capture time (read in the newsroom zone, else the file time) and, for staff,
the photographer's Person name as creator and credit. Rights and alt text stay
deliberate: outside photography is never marked cleared by uploading.

## Live permission and delivery

Story plans have **Direct publishers** (`livePublishers`, editors control it from the
Write setup sheet or Field's menu). The grant publishes, edits, pins and removes live
updates on that Story only while coverage is Live now. It never publishes or
unpublishes the article, never changes the mode, never starts or ends coverage and
never makes anyone an editor (`access/live-context.ts`, enforced by the `live-updates`
collection). Without it, anyone on the Story sends drafts to the live desk.

A live outbox item **freezes the reporter's explicit intent** (`delivery: "publish"` or
`"desk"`) when they tap, in IndexedDB, so it survives being offline, a reload, retries
and reconnects. The server decides again when it arrives: it publishes only if the
Story is public, in Live mode, coverage is Live now and the person still holds the
right; otherwise it stores a desk draft and answers `{ status: "sent-to-desk", reason }`.
Offline at 9:51 tapping Publish now, coverage ended at 10:00, reconnect at 10:05: the
update does not go public; it becomes a desk draft and Recent says so. An item with no
recorded intent (queued by an older version) is a desk draft.

## Outbox

Every capture goes into one IndexedDB outbox per account first
(`ui/field/outbox.ts`), then is sent. Each item says one of: **Saved**,
**Queued offline**, **Sending**, **Uploading 62%**, **Posted**, **Sent to live
desk**, **Failed — Retry**. A live update is only "Posted" when the server
stored it as published; a Publish now that could not publish reads, for example,
"Sent to live desk — coverage ended before this sent."

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

Primary controls are at least 44px with visible text, including the overflow trigger and menu items. The composer sits at the
top, so a software keyboard never covers it. Safe-area insets are respected;
there is no horizontal overflow at 320px. Secondary tasks (recording, choosing
an assignment, story search) use bottom Drawers; Field never uses Sheet for
small mobile actions.

## Validation

```sh
npx vitest run tests/field-outbox.test.ts tests/live-ui.test.tsx tests/live-coverage-domain.test.ts   # in apps/newsroom
npx vitest run --config vitest.integration.config.ts tests/integration/field.test.ts tests/integration/live-coverage.test.ts tests/integration/live-workflow.test.ts tests/integration/live-story-mode-migration.test.ts
```
