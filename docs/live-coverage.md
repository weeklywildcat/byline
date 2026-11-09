# Live coverage

Editors open **Story → Live coverage** in the WordPress editor, start coverage,
and post short text updates with an optional headline, photo, and pinned key
points. Every update records its posting author and UTC time. Updates can be
edited or deleted; pinning replaces the previous summary. Ending or resuming
coverage preserves the original start time and every remaining update.

WordPress stores updates as private `byline_live_update` child posts. The
editorial REST routes require story access, normal WordPress REST authentication
(including cookie nonces), and publication rights for writes to published stories.
`GET /byline/v1/live/<storyId>` exposes only published updates on a published,
non-password-protected story. Raw text and account IDs stay in the editor.
Paragraphs, line breaks, bullet lists, and HTTP(S) links are built from escaped
plain text; editor markup is never passed through.

Normal public revisions and durable deployment jobs produce a complete static
article and `/_byline/live/<storyId>.json`, including the full timeline, pinned
update permalinks, authors, and photos. The snapshot includes referenced update
photos. Both standard and immersive articles use the shared article UI. No
renderer makes runtime CMS requests.

While coverage is live, a small dynamically imported script polls
`/api/live/<storyId>` every 15 seconds in visible tabs. The Cloudflare Worker
reads the published-only WordPress projection and uses the same normalization,
publication timezone, and markup renderer as the static build. It owns no
storage and forwards no reader cookies or authorization. Protected CMS origins
use the existing Worker-only CMS credentials. The feed bypasses upstream cache;
Worker responses and static JSON carry `Cache-Control: no-store`. `_headers`
applies to static assets; Worker responses set their own headers as required by
[Cloudflare's header documentation](https://developers.cloudflare.com/workers/static-assets/headers/).
Hosts without this Worker retain the complete static archive; they need an
adapter for `/api/live/<storyId>` to receive between-build updates.

New, edited, removed, and repinned updates wait behind a reader-controlled
button. Polling never inserts them automatically, including the final updates
when coverage ends. The button applies the latest complete timeline, moves
keyboard focus to an update, and respects reduced motion. Relative times refresh
while live. Hidden tabs pause requests; becoming visible resumes them without
overlapping requests. Failures back off, requests time out, and ending coverage
stops network/clock work while leaving pending updates available.

Deployment saves normally debounce for 60 seconds. Coalescing caps that delay at
120 seconds after the first queued save, preserves the newest expected revision,
and keeps failed-job retry backoff. WP-Cron still needs to run; the cap is a
scheduling bound, not a guarantee of provider build completion.

Structured data includes `NewsArticle` and `LiveBlogPosting`, coverage times,
and the latest 50 updates. Every update remains in static HTML. Regular sitemap
modification times include update edits and coverage state changes. The news
sitemap retains the original publication time and
[Google's two-day publication window](https://developers.google.com/search/docs/crawling-indexing/sitemaps/news-sitemap),
including for running coverage.

## In the Payload newsroom

A Story stays one Story. Live coverage is not a second Story, a content type or a
tab: it is a **Story mode** with a timeline, edited in **Write** and captured from
**Field Mode**, over the same live-update records, permissions and activity.

### Two separate concepts

| Concept | Values | Where it shows |
| --- | --- | --- |
| **Story mode** | Standard · Live | the labelled `Standard / Live` toggle at the top of Write |
| **Coverage state** | Not started · Live now · Ended | the `● LIVE` badge, the prepared/ended status in the live section, Field |

Live mode with any coverage state is valid. After a game ends the Story stays in
Live mode with its timeline until an editor deliberately switches to Standard
(`domain/live-coverage.ts` holds the rules as pure functions). Ending coverage
never switches to Standard; switching to Standard ends running coverage first (after
a confirmation); switching back to Live restores the timeline and an ended session
stays **Ended** until it is deliberately resumed. A live update is never deleted by a
mode change.

### Where the state lives (and why)

Mode, coverage state and the start/end times are the unversioned
`story-plans.liveCoverage` group, **not** the versioned Story. Starting coverage
therefore never saves or publishes the article's unpublished draft: a published
Story with newer unpublished edits can go live while the public article stays the
previously published one and the draft edits stay unpublished (regression test:
`tests/integration/live-workflow.test.ts`). A version restore never rewinds
coverage. The public projection reads the plan (`public/snapshot/live.ts`); the
plan is a tracked public collection (`public/slices.ts#storyPlanPublicSlice`), so
going live, ending and resuming each advance the public revision and queue the
snapshot on their own, in the same transaction as the change. Existing coverage was
moved by migration `live_story_mode` (running or ended → Live mode in the same state
with its times; an unpublished Story cannot be "Live now"; everything else Standard).

### Who may do what

| | Staff on the Story | Staff with the Story's live grant | Editor / administrator |
| --- | --- | --- | --- |
| Capture private notes, photos, files | ✓ | ✓ | ✓ |
| Send live updates to the desk while coverage is Live now | ✓ | ✓ | ✓ |
| **Publish now** while coverage is Live now | | ✓ | ✓ |
| Edit / publish / unpublish / pin live updates | own drafts | any on this Story | any |
| Publish the article | | | ✓ (per role rules) |
| Change Standard/Live, set up, start, end, resume, choose direct publishers | | | ✓ |

The grant (`story-plans.livePublishers`, shown as **Direct publishing**) is for live
updates on that Story only: never the article, the mode, starting or ending coverage,
or any broader permission. It is offered to staff who work on the Story through
Byline's existing Story access (its creator, the byline's linked accounts, people
holding assigned work) and to anyone who already has it, never to editors
(`liveCandidates`). Only editor-level accounts change coverage, checked on the
server for each request (`changeLiveCoverage`).

### One rule for "can this become public now"

`publishBlock` (domain) and `canPublishLiveNow` (`access/live-context.ts`): the Story
is public (a published version, not trashed), it is in Live mode, coverage is Live now,
and the person holds the right. The live desk, the Field endpoint and the `live-updates`
collection's direct-publisher guard all use it, so Write and Field cannot disagree.
A Story cannot go live unless it is public (enforced on the server, 409 otherwise);
**Publish & go live** runs the exact normal publication action and its readiness
checks first, so it cannot go live when normal publication would be blocked.

### Delivery intent

A live update is created with the reporter's explicit intent, `delivery: "publish"` or
`"desk"`. `"desk"` is always a draft, even for someone who could publish. `"publish"` is
published only if, at that moment, `canPublishLiveNow` holds; otherwise it becomes a
desk draft and the response says why (`{ status: "sent-to-desk", reason }` with
`story-not-public`, `not-live-mode`, `coverage-not-started`, `coverage-ended` or
`permission-revoked`). A missing intent means the desk. Pinning is a publisher's call
and a draft is never pinned.

### Write

Under the article, in Live mode only: a status line (`● LIVE` / Not started / Ended ·
time), the composer and the timeline. Prepared (Live, not started) shows "Ready for
live coverage" with Go live (or Publish & go live) and Open Field Mode; staff see "Live
coverage is ready but hasn't started yet" and no start control. Publishers get
`[ Publish now ] [ Send to desk ]`; everyone else gets `[ Send to live desk ]`. The
timeline shows time, author, text, photo, **Published** or **Draft · at desk**, and **Key
update** in words; secondary actions are a menu. `?tab=live` (the old Live tab's
address) opens Write and moves focus to the live section.

Text is a headline (optional) and plain text (blank line = new paragraph, `- ` = bullet,
bare http(s) links become links), stored as bounded prose and rendered from escaped
text only. An update needs text. Photos are a Media asset: editors choose any; others
only a photo captured for this Story or uploaded by themselves.

### Public feed

`GET /api/byline/live/<storyId>` is the public, read-only, `no-store`
projection (no credentials, cookies or account details): the same shape
`normalizeLiveCoverage` validates for the static build and the Worker, only for
a published, untrashed story in Live mode with running or ended coverage, with its
published updates newest first. A Story switched back to Standard is a normal article
again (its updates are kept, not shown). Photos are the prepared public renditions; if one is not
yet prepared the feed omits photos until the next build. The Cloudflare Worker's
`/api/live/<storyId>` still reads WordPress (`/wp-json/byline/v1/live/<id>`);
pointing it at this endpoint is a cutover task with the poll proxy (Phase 11),
and photos in the feed only resolve on the deployed site after a build
materializes them.

