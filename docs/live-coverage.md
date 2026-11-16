# Live coverage

Turn on live coverage with Story mode (Standard / Live) in Write. Write and Field Mode share the Story's updates. Staff can submit drafts; editors and staff with the Story's explicit live publishing grant can publish updates. See [Reporting](reporting.md) and [Field Mode](field-mode.md) for capture and delivery.

An update contains bounded prose, an optional headline and photo, and a publication time. A single update can be pinned as key points. Ending coverage keeps the timeline, and resuming preserves the original start time. Draft updates, private account information, and updates on unpublished or trashed stories stay out of the public projection.

To announce coverage ahead of an event, publish the ordinary Story with a visible start-time note in its article text, then choose **Set up for later**. While coverage is **Not started**, the public page has no live timeline or auto-refresh; readers who opened it earlier must refresh once you select **Go live**. There is no automatic scheduled start time yet.

Published updates advance the public revision. Each static deployment includes the full timeline in the article and a feed at `/_byline/live/<storyId>.json`. While coverage is live, the browser checks this feed in visible tabs and offers a button to show new or edited updates. A successful **Publish now** saves an update as published in Byline; it does **not** mean the update has already reached the public site. Delivery depends on successful snapshot preparation and deployment, and can lag behind the newsroom during builds. The article remains readable without JavaScript.
