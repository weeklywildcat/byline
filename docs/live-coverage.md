# Live coverage

Turn on live coverage with Story mode (Standard / Live) in Write. Write and Field Mode share the Story's updates. Staff can submit drafts; editors and staff with the Story's explicit live publishing grant can publish updates. See [Reporting](reporting.md) and [Field Mode](field-mode.md) for capture and delivery.

Live stories have a time-sensitive publication path. An editor can **Publish for later** from Live setup, the prepared Live panel, or the Story header. That publishes the Story shell after the normal publication/readiness checks and leaves coverage **Not started**, producing the stable public URL without requiring the ordinary Pitch → Reporting → Drafting → Review → Ready sequence. **Publish & go live** uses the same publication checks and then starts coverage. The review workflow remains available when the newsroom wants it; Live mode does not silently publish or start coverage.

An update contains bounded prose, an optional headline and photo, and a publication time. A single update can be pinned as key points. Ending coverage keeps the timeline, and resuming preserves the original start time. Draft updates, private account information, and updates on unpublished or trashed stories stay out of the public projection.

Published updates advance the public revision. Each static deployment includes the full timeline in the article and a feed at `/_byline/live/<storyId>.json`. While coverage is live, the browser checks this feed in visible tabs and offers a button to show new or edited updates. Update delivery therefore depends on successful snapshot preparation and deployment. The article remains readable without JavaScript.
