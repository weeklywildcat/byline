# Editorial collaboration

Byline keeps newsroom collaboration in the system that owns the job. The
editorial sidebar and Planning surface connect these systems, but they do not
duplicate their data.

## WordPress Notes

On WordPress versions that provide Notes, use Notes for copy-editing discussion:

- line- or block-level copy edits
- fact questions and wording suggestions
- mentions and asynchronous replies

**WordPress owns Notes.** A Note is a Core comment with `comment_type = note`.
Gutenberg and Core own creating, editing, replying, `@mentions`, resolving and
reopening, deleting, inline anchoring and the native email notifications. Byline
has no Note datastore, no `byline_comment` post type, no Multicollab and no write
endpoint: it never copies a Note's text into post meta, task records, activity
logs, Planning or Home responses, Astro snapshots or any second comments table.

Byline *reads and summarizes* them so an editor can see where unresolved copy
feedback exists and go fix it:

| Where | What Byline shows | Source |
| --- | --- | --- |
| Planning board and list | a quiet icon and open-thread count, only when it is above zero | `story.notes` (counts only, batched) |
| Story Peek | one row, "3 open notes", whose whole target opens the editor | `story.notes` from the workspace payload (no extra request) |
| Story Workspace | the **Article Notes** card: open and resolved counts, up to three recent open threads (author, time, plain-text excerpt, reply count), "+N more open notes" | `GET /byline/v1/editorial/stories/<id>/notes`, loaded lazily |
| Gutenberg sidebar | the existing availability signal, now **Review article notes** | `notes` in the editor bootstrap |

All of them link to the ordinary post editor. WordPress documents no URL that
opens the Notes panel directly, so none is invented (no `#wp-notes`); the action
is labelled for what it does.

### What is counted

`includes/editorial/notes.php` is the only code that touches Notes. It uses
`get_comments()` and always passes `type => 'note'`, because Core leaves Notes
out of ordinary comment queries unless the type is requested, and Byline never
treats a reader comment as a Note. Counts are **threads**: only top-level Notes
(`comment_parent = 0`). The Gutenberg editor writes an open thread as comment
status `hold` and a resolved thread as `approve` (resolving also adds a
text-less marker reply, which is not counted as a reply). Anchors, selected
text and block coordinates are private editor state and are never read.

Planning, Home and the workspace obtain counts for a whole page of stories in a
single comments query, memoised for the request. The `/notes` endpoint is read
only when the workspace actually has open threads to preview.

### Who may see Notes

Note visibility follows WordPress' article boundary, `edit_post` on that story,
**not** the broader Story Workspace context (`byline_story_context()`). A
photographer, interviewer or task assignee may see a story's planning context
without being entitled to its copy-editing discussion, so for them
`story.notes` is `null`: no counts, authors, times, excerpts, reply counts or
open/resolved state, and the Article Notes card is simply absent. The `/notes`
route uses the same `edit_post` permission as the rest of the editorial
workflow and refuses everyone else.

Notes remain progressive enhancement. When the installed WordPress, or the post
type, does not support Notes, the summary reports `available: false` with zero
counts and no URL, the UI renders nothing, and the workflow carries on.

## Byline Tasks

Use a Byline Task when somebody needs to perform a bounded piece of newsroom
work, such as arranging an interview, finding a source, requesting a photo, or
verifying a detail. Tasks have their own assignee, priority, due date, and open /
completed state. They are not a replacement for text-anchored copy feedback.

## Byline Workflow

Workflow stages describe the handoff state of the story: pitch, reporting,
writing, editing, ready for review, or a sidelined state. A stage is not a
comment and does not imply that a WordPress Note exists.

## Discord

Discord is for broad newsroom discussion and the story thread when one is
linked. The WordPress control plane exposes only safe configuration and link
state. Credentials and unlinked private integration settings never appear in
the public API.

## Notifications

Byline sends a small set of transactional assignment, review, media, task, and
publication-failure notifications through WordPress email when the recipient
has enabled them in the native **Byline Notifications** profile section. Due
work is coalesced into a daily digest. Notification jobs contain stable IDs,
are retried by the durable job runner, and recheck the recipient's current
capabilities before resolving private titles or sending mail.

Byline does not send Discord direct messages based on display-name or email
guessing. A future Discord delivery adapter needs an explicit, safe WordPress
user-to-Discord identity mapping; without one, Discord remains the broad
discussion surface above. WordPress Notes notifications are also left to Notes
and are not duplicated by Byline.

## Notes, Tasks, Reader Feedback and Discord

These stay separate. Notes are feedback tied to the article. A Task is bounded
work somebody must do (and may be created because of a Note, by a person). Reader
Feedback is the private reader-submitted correction/tip inbox and is never mixed
with staff Notes. Discord is broad conversation. Byline has no general Story
Discussion feature.

## Integration boundary

The Story sidebar leaves native Notes available and reports whether Notes are
available on the current editor. The Notes adapter uses only documented
WordPress APIs and reads existing Note data in place; it must not migrate or
duplicate stored content into Byline, and it must not add write routes for
Notes. `tests/editorial-notes-regression.php` (adapter rules, queries,
sanitization, permissions), `tests/integration/article-notes.php` (real Core:
roles, REST, public projections, snapshots, activity) and
`tests/e2e/article-notes.spec.ts` pin this.
