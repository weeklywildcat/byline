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

Stories with live coverage on (start it from Story details) get a **Live** tab.
Managers of the story post, edit and delete updates; an update is a headline
(optional), plain text (blank line = new paragraph, `- ` = bullet, bare
http(s) links become links), and an optional photo from Media. The text is stored
as bounded prose (paragraph, list, link, line break) and rendered to HTML from
escaped text only; there is no markup, formatting or HTML a writer can add.

Publishing follows the newsroom's rule: **only editors publish.** Staff on a
story save drafts (always, whatever they ask for) that only the story's managers
see; an editor publishes, unpublishes, pins and deletes anything readers can see.
That is enforced by the `live-updates` collection, not the screen, so it holds
over REST too. Until the story itself is published, everything is private.
Pinning replaces the previous key update. Unlike the WordPress panel, an update
needs text (a photo or headline alone is not enough).

`GET /api/byline/live/<storyId>` is the public, read-only, `no-store`
projection (no credentials, cookies or account details): the same shape
`normalizeLiveCoverage` validates for the static build and the Worker, only for
a published, untrashed story with live or ended coverage, with its published
updates newest first. Photos are the prepared public renditions; if one is not
yet prepared the feed omits photos until the next build. The Cloudflare Worker's
`/api/live/<storyId>` still reads WordPress (`/wp-json/byline/v1/live/<id>`);
pointing it at this endpoint is a cutover task with the poll proxy (Phase 11),
and photos in the feed only resolve on the deployed site after a build
materializes them.

