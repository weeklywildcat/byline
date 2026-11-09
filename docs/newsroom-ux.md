# Payload newsroom workflows

Byline uses Payload's document form, locking, drafts, autosave, version history
and scheduled publication. The screens below are the normal editorial
interfaces. **System administration** remains the administrator escape hatch
for maintenance, migration and inspection.

| Records | Editable in Byline | System-owned or deliberately deferred |
| --- | --- | --- |
| Stories | Write: headline, deck, kicker, Section, Topics, ordered byline, lead Media and caption, body, format, YouTube URL, presentation, immersive headline position, reporting note and live coverage state (editors). Edit URL: slug and, for editors, first publication instant. History: publication, versions, corrections and copy tools. Editors can move a Story to Trash from its publication menu, which also cancels any scheduled publication. | IDs, joins, author attribution on versions, timestamps, generated video facts and import provenance are system-owned. Imported HTML stays read-only; reviewed conversion is separate. Live updates are posted from the Story's Live tab ([live coverage](live-coverage.md)). |
| Pages | Site → Pages: title, slug, published parent, summary, prose body, search indexing, native draft, publish/unpublish and schedule; History lists recent versions. | First publication instant and record metadata are system-owned. Comparing or restoring Page versions still uses the native Payload fallback. Code-owned institutional pages and the sports archive keep their existing public routing. |
| People | People / My profile: name, slug (editors), pronouns, newsroom role, short and long bios, portrait, status, directory/profile visibility, public email and social profiles. Administrators manage that Person's newsroom access, sign-in email and access level from the same Person screen; editors can create guest contributors without creating accounts. | IDs, the underlying auth record/link, Google subject, legacy IDs and timestamps are system-owned. Raw Accounts remain only in System administration as a maintenance fallback. |
| Media | Library: upload, filename display, alt text, creator, credit, copyright, license, source URL, capture date, folder, focal point and supported crops. | Filename, MIME, dimensions, original and generated files, uploader, hashes, preparation state and revisions are system-owned. Where used scans native article blocks and other known relationships. Imported HTML references and retained versions are not shown in the inspector; retained native Story versions still protect files from deletion. |
| Sections | Site → Sections: name, slug, description, internal visibility. | IDs, legacy IDs and timestamps are system-owned. An internal Section has no public Story paths. |
| Topics | Site → Topics: name, slug, description. Staff can create a Topic while editing a Story. | IDs, legacy IDs and timestamps are system-owned. Topic landing pages are not published; the topic facts are used in Story metadata. |
| Publication | Site → Publication: identity, location, locale, timezone, public URLs, branding assets and dimensions, section descriptions, ordered navigation and social profiles, feature switches, licensing and SEO defaults. Save draft and Publish settings are separate. | Weekly Wildcat is the sole supported theme. No theme builder, secret management, private newsroom URL or public revision field lives here. Feature switches do not install distribution providers. |

A Person may have zero or one Byline sign-in account. Administrators grant,
edit, enable and disable that access from the Person; an existing unlinked
account with the same email is connected instead of duplicated. Byline sends no
invitation. Administrators can set a local fallback password; if left blank at
creation, Byline uses an unknown random credential until one is set. Disabling
access never changes the public profile, historical bylines or story history.

Story notes are private threaded discussions about the entire Story, with
replies and resolution. They are not attached to a selection of copy. Native
Lexical node keys do not survive the complete save/restore lifecycle as durable
anchors, so inline annotation is deferred. Tasks and Write own the task list
and format actions for a Story.

## Reporting, Field Mode, Front Page and Distribution

The Story screen has a **Reporting** tab ([reporting](reporting.md)): one
notebook of notes, recordings, documents, photos, links and live updates, with
transcripts, verified quotes and the article's Reporting sheet. Field Mode
(`/admin/field`, [Field Mode](field-mode.md)) is phone-first capture with an
offline outbox. The Front Page Desk (`/admin/front-page`, [front page](front-page.md))
pins published Stories into the code-owned homepage's slots and publishes or
schedules those changes.

Use **History → Distribution** for a single Story and **Publish → Distribution**
for the editors' cross-Story queue. The desk uses a table with a compact row on
phones, and both routes open the same detail Sheet. Each copy or image field
follows the published Story until someone chooses Custom. The final link
field validates in place. A confirmed post freezes its sent content in the
item's private history. [Distribution](distribution.md)

## Notifications

The bell in the Byline header is each person's inbox and settings. The same
eight notifications as WordPress, each on by default, in the inbox and by email:

| Notification | Who is told | When |
| --- | --- | --- |
| Story assignments | A new story editor; a person added to a byline | The editor or byline actually changes |
| Ready for review | The story's editor (every editor when none is assigned) | Workflow moves into Editing or Ready, once per review |
| Story sent back | The story's writers | Editing or Ready returns to Pitch, Assigned, Reporting or Writing |
| Media assignments | New assignees of a production assignment | Assigned or reassigned |
| High-priority tasks | Assignees of a High or Urgent task | Newly assigned, or the task becomes High or Urgent |
| Appointments | New assignees of an appointment | Assigned or reassigned |
| Publishing failures | Editors and administrators | Public snapshot or media preparation fails for good |
| Daily due digest | Anyone with something due | 07:00 on the worker clock: open tasks, media work and story deadlines due today or overdue, and today's appointments |
| Transcripts | Whoever uploaded or requested the recording | A transcript finishes (asynchronous, so the uploader is told) |
| Front Page failures | Editors | A scheduled homepage change could not be activated |
| Distribution assignment | New owner | An editor assigns or reassigns destination work |
| Distribution approval | Editors | Staff mark a destination that needs approval Ready |
| Distribution failure | Owner and editors | A delivery reports a failure |

Nobody is notified of their own change, and imports notify nobody. A
notification stores only references (story, actor, a short detail); headlines
and names are read when it is shown or sent, and an inbox shows a headline only
to someone who can read the story. Notifications are private to their recipient
and never part of a public projection. Read notices are removed after 60 days
and unread ones after 120.

Each person chooses In Byline and Email per notification in the bell's settings.
Choices are the account's own Payload Preferences
(`byline:notifications:preferences:v1`), not a Users field; editors and
administrators also see Publishing failures. Email is optional: set
`BYLINE_SMTP_URL` (a nodemailer connection URL) and `BYLINE_EMAIL_FROM`. Without
them the checkboxes for email are disabled and every notification stays in the
inbox. A failed send retries three times, then is recorded as failed on the
notification; delivery never delays a save. The `deliver-notification` and
`send-due-digest` jobs run on the `maintenance` queue, and the digest is a
scheduled job, so that worker must run with `--handle-schedules` (the
`jobs:maintenance` script does) and with `TZ` set to the newsroom timezone for
the 07:00 digest.

## Publication and URL changes

First publication normally stamps the time automatically. To migrate a Story
by hand, enter the original local time in Edit URL and set the Section and slug
to match the existing live address. Verify the pathname before publishing. Add
one row per migrated Story to
`apps/newsroom/tests/fixtures/permalink-parity.json` using the old live URL, the
original UTC instant, the Section segment from the live address, and the Story
slug. The included rows are synthetic Eastern-time boundary examples.
`npm run test:newsroom` checks pathname parity using the shared
`publicStoryPath()`; no WordPress numeric ID is required.

Publishing a changed Story or Page address confirms the new path. Updating a
Section slug in Site reviews the number of live Stories affected. Redirect
changes are written with their public mutation. A Section move or publication
timezone change recomputes the affected live Story paths; a Page move preserves
its published descendants' old paths. A Story remembers its last live path
while unpublished, so republishing after a URL change still preserves that
address. Aliases collapse to one hop. Manual
redirects are administrator-only and accept literal same-site paths. A record
whose destination is offline stays in Site, but is omitted from the deployment
until the target is public again. Fixed public pages can be redirect
destinations; code-owned paths remain reserved as sources.

The existing Snapshot v2 `redirects` dataset carries only ID, source,
destination and 301 status. The static build emits both slash variants for
directories and one exact rule for file paths in Cloudflare `_redirects`. The
public Worker does not look up redirects in Payload.

Scheduling is a native job, separate from a Story deadline and publication
target. Pending drafts and scheduled rewrites remain private to the Story's
managers. Only editors publish, schedule, unpublish or move Stories to Trash.
Moving a Story to Trash cancels its pending scheduled publication atomically;
the Story remains recoverable with its drafts, versions and newsroom planning.
Permanent deletion is administrator-only. Readiness reports fields, body
validation and publication Media issues; warnings are advisory. Content Health
is independent published-content maintenance.

## Operations

Video stories get their YouTube facts (title, thumbnail, duration, upload date)
from the `refresh-video-facts` job on the `maintenance` queue, queued whenever a
video Story with a YouTube URL is saved and its video has no facts yet. Facts
are stored by video ID in the private `video-facts` collection, not on the
Story, so a lookup never creates a Story version and is shared by every Story
using the video. Set `BYLINE_YOUTUBE_API_KEY` for duration and upload date;
without it the job uses YouTube's keyless oEmbed (title and thumbnail only, no
`VideoObject.duration`). An unknown, private or deleted video is retried up to
four times, six hours apart, and the Story still renders with its embed. A
newly learned fact is a public change only when a published Story uses the
video. Live Preview shows the embed and headline; the duration badge appears
once published.

Run `npm run jobs:maintenance --workspace @byline/newsroom` alongside the existing
workers, with access to the same completed snapshot directory. A Content Health
scan uses the current completed snapshot; wait for snapshot preparation if the
public revision just changed. The worker persists results and progress and never
scans on a page load. External checks use bounded HEAD requests to public IPv4
addresses (DNS pinned; no redirects or credentials). Unreachable destinations
and transient HTTP errors do not count as confirmed broken links.

The UX migrations add `redirects`, a private last public path on each Story plan,
Story version attribution fields,
`story_activity`, `story_notes` and its replies, and private `content_health` scan
records. The maintenance task extends Payload's native job task vocabulary.
