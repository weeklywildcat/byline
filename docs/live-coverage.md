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
