# Live coverage

Turn on live coverage with Story mode (Standard / Live) in Write. Write and Field Mode share the Story's updates. Staff can submit drafts; editors and staff with the Story's explicit live publishing grant can publish updates. See [Reporting](reporting.md) and [Field Mode](field-mode.md) for capture and delivery.

Live stories have a time-sensitive publication path. An editor can **Publish for later** from Live setup, the prepared Live panel, or the Story header. That publishes the Story shell after the normal publication/readiness checks and leaves coverage **Not started**, producing the stable public URL without requiring the ordinary Pitch → Reporting → Drafting → Review → Ready sequence. **Publish & go live** uses the same publication checks and then starts coverage. The review workflow remains available when the newsroom wants it; Live mode does not silently publish or start coverage.

An update contains bounded prose, an optional headline and photo, and a publication time. A single update can be pinned as key points. Ending coverage keeps the timeline, and resuming preserves the original start time. Draft updates, private account information, and updates on unpublished or trashed stories stay out of the public projection.

To announce coverage ahead of an event, publish the ordinary Story with a visible start-time note in its article text, then choose **Set up for later**. While coverage is **Not started**, the public page has no live timeline or auto-refresh; readers who opened it earlier must refresh once you select **Go live**. There is no automatic scheduled start time yet.

Write and Field share one desk: the same timeline actions (edit, publish or unpublish, pin, delete) through `ui/live/useLiveDeskControls.tsx`, and the same **Live update by … · Switch** for editors (`newsroom/posting-as.ts`), which credits an update to the reporter it came from. Crediting changes only the author: publishing is still the signed-in account's right, and the Story's activity records that account.

Readers see a byline on each update: the author's linked public Person, exactly as on an article (name, newsroom role, a link when they have a profile page, and their prepared portrait as a small avatar). Only the Person's ID is read from the account; account names, emails and IDs never leave. An author without a linked Person has no public byline.

Published updates advance the public revision. Each static deployment includes the full timeline in the article and a feed at `/_byline/live/<storyId>.json`. The article remains readable without JavaScript.

## How readers get updates

While coverage is **live**, the article page reads the newsroom directly. A published update reaches open pages on their next check, about 15 seconds later, instead of waiting for a deploy:

- The page is rendered with `data-source="<cms>/api/byline/live/<storyId>"`, built from the Publication's newsroom URL (`urls.cms`, HTTPS, or `http://localhost` for development). Only Payload stories with running coverage get it.
- In visible tabs the browser checks that feed every 15 seconds (`@byline/ui/live-updates`), validates it with `normalizeLiveCoverage`, and renders it with the same `createArticleLiveView`/`createLiveFeed` code as the static page. It offers a button to show new or edited updates. It never inserts them without being asked.
- If the newsroom does not answer, that check reads the static `/_byline/live/<storyId>.json` instead. Repeated failures back off to five minutes.
- A photo or byline portrait whose deploy has not landed yet fails to load from `/_byline/media/…`. The page then retries it once from `<cms>/api/byline/live/<storyId>/media?path=/_byline/media/…`, which serves the same content-addressed bytes.

When the feed reports that coverage **ended**, the page stops checking. A page built after coverage ended has no `data-source` and never contacts the newsroom. From then on the static build is the only copy, as for any other article. Published updates still advance the public revision and deploy as before, so the static timeline, search engines and readers without JavaScript catch up as each deploy lands. A page opened from a deploy made before **Go live** has no live timeline, so its readers must refresh once.

### The newsroom routes

Both routes are anonymous, read-only and published-only (`apps/newsroom/src/newsroom/public-live.ts`). They answer any origin without credentials.

| Route | Serves | Caching |
| --- | --- | --- |
| `GET /api/byline/live/:id` | The `LiveCoverage` projection the static build validates: a published, untrashed Story with live or ended coverage, and its published updates only. Otherwise 404. | `public, max-age=5` |
| `GET /api/byline/live/:id/media?path=` | One prepared publication file that this projection names: an update photo or a byline portrait. Anything else is 404. | `public, max-age=31536000, immutable` |

Every reader polls, so the newsroom reuses a Story's projection while the public revision is unchanged, for up to 30 seconds. Concurrent requests share one read. A photo still being prepared is left out of the feed until it is ready, without dropping the other photos. For large audiences, put a CDN in front of the newsroom: the five-second shared lifetime lets it absorb the polling.
