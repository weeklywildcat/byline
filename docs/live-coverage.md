# Live coverage

Turn on live coverage with Story mode (Standard / Live) in Write. Write and Field Mode share the Story's updates. Staff can submit drafts; editors and staff with the Story's explicit live publishing grant can publish updates. See [Reporting](reporting.md) and [Field Mode](field-mode.md) for capture and delivery.

Live stories have a time-sensitive publication path. An editor can **Publish for later** from Live setup, the prepared Live panel, or the Story header. That publishes the Story shell after the normal publication/readiness checks and leaves coverage **Not started**, producing the stable public URL without requiring the ordinary Pitch → Reporting → Drafting → Review → Ready sequence. **Publish & go live** uses the same publication checks and then starts coverage. The review workflow remains available when the newsroom wants it; Live mode does not silently publish or start coverage.

An update contains bounded prose, an optional headline and photo, and a publication time. A single update can be pinned as key points. Ending coverage keeps the timeline, and resuming preserves the original start time. Draft updates, private account information, and updates on unpublished or trashed stories stay out of the public projection.

To announce coverage ahead of an event, publish the ordinary Story with a visible start-time note in its article text, then choose **Set up for later**. While coverage is **Not started**, the public page has no live timeline or auto-refresh; readers who opened it earlier must refresh once you select **Go live**. There is no automatic scheduled start time yet.

Write and Field share one desk: the same timeline actions (edit, publish or unpublish, pin, delete) through `ui/live/useLiveDeskControls.tsx`, and the same **Live update by … · Switch** for editors (`newsroom/posting-as.ts`), which credits an update to the reporter it came from. Crediting changes only the author: publishing is still the signed-in account's right, and the Story's activity records that account.

Readers see a byline on each update: the author's linked public Person, exactly as on an article (name, newsroom role, a link when they have a profile page, and their prepared portrait as a small avatar). Only the Person's ID is read from the account; account names, emails and IDs never leave. An author without a linked Person has no public byline.

Each static deployment includes the full timeline in the article and a feed at `/_byline/live/<storyId>.json`. The article remains readable without JavaScript. **While coverage is running, a published update is not a build**: readers get it from the newsroom (below), and the static build catches up once, when coverage ends.

## How readers get updates

While coverage is **live**, the article page reads the newsroom directly. A published update reaches open pages on their next check, about 15 seconds later, with no deploy:

- The page is rendered with `data-source="<cms>/api/byline/live/<storyId>"`, built from the Publication's newsroom URL (`urls.cms`, HTTPS, or `http://localhost` for development). Only Payload stories with running coverage get it.
- The page was built when coverage started, so a reader arriving mid-coverage first sees an older timeline. The browser therefore checks **on arrival** (in a background tab, when it is first seen) and applies the newsroom's timeline at once, without scrolling or taking focus.
- After that it checks every 15 seconds in visible tabs (`@byline/ui/live-updates`), validates the feed with `normalizeLiveCoverage`, and renders it with the same `createArticleLiveView`/`createLiveFeed` code as the static page. Later new or edited updates wait behind a button; they are never inserted under the reader.
- If the newsroom does not answer, that check reads the static `/_byline/live/<storyId>.json` instead. Repeated failures back off to five minutes.
- A photo or byline portrait whose deploy has not landed yet fails to load from `/_byline/media/…`. The page then retries it once from `<cms>/api/byline/live/<storyId>/media?path=/_byline/media/…`, which serves the same content-addressed bytes.

When the feed reports that coverage **ended**, the page stops checking. A page built after coverage ended has no `data-source` and never contacts the newsroom. From then on the static build is the only copy, as for any other article.

### What triggers a build

- **Go live** and **End coverage** change the Story's public projection, so each is one build. Ending carries every update into the static page, its feed and its structured data.
- A live update published, edited, pinned or removed **while coverage is running** advances nothing and builds nothing (`liveUpdatePublicSlice` is empty until coverage ends). Until the end-of-coverage build, search engines and readers without JavaScript see the timeline as of the last build, which is the start of coverage.
- An update changed **after** coverage ended is an ordinary public change and builds.
- Preparing a photo only re-queues a snapshot while the current revision has none completed. A finished snapshot was not waiting for it, so a Library upload or a Field photo is not a redeploy.

A page opened from a deploy made before **Go live** has no live timeline, so its readers must refresh once.

### The newsroom routes

Both routes are anonymous, read-only and published-only (`apps/newsroom/src/newsroom/public-live.ts`). They answer any origin without credentials.

| Route | Serves | Caching |
| --- | --- | --- |
| `GET /api/byline/live/:id` | The `LiveCoverage` projection the static build validates: a published, untrashed Story with live or ended coverage, and its published updates only. Otherwise 404. | `public, max-age=5` |
| `GET /api/byline/live/:id/media?path=` | One prepared publication file that this projection names: an update photo or a byline portrait. Anything else is 404. | `public, max-age=31536000, immutable` |

Every reader polls, so the newsroom reuses a Story's projection for up to 30 seconds (and drops it whenever the public revision moves). Updates do not move the revision while coverage runs, so an editor's change can take up to 30 seconds longer to show: about 45 seconds worst case. Concurrent requests share one read. A photo still being prepared is left out of the feed until it is ready, without dropping the other photos. For large audiences, put a CDN in front of the newsroom: the five-second shared lifetime lets it absorb the polling.
