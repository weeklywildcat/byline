# Live coverage

Turn on live coverage with Story mode (Standard / Live) in Write. Write and Field Mode share the Story's updates. Staff can submit drafts; editors and staff with the Story's explicit live publishing grant can publish updates. See [Reporting](reporting.md) and [Field Mode](field-mode.md) for capture and delivery.

Live stories have a time-sensitive publication path. An editor can **Publish for later** from Live setup, the prepared Live panel, or the Story header. That publishes the Story shell after the normal publication/readiness checks and leaves coverage **Not started**, producing the stable public URL without requiring the ordinary Pitch → Reporting → Drafting → Review → Ready sequence. **Publish & go live** uses the same publication checks and then starts coverage. The review workflow remains available when the newsroom wants it; Live mode does not silently publish or start coverage.

An update contains bounded prose, an optional headline and photo, and a publication time. A single update can be pinned as key points. Ending coverage keeps the timeline, and resuming preserves the original start time. Draft updates, private account information, and updates on unpublished or trashed stories stay out of the public projection.

To announce coverage ahead of an event, publish the ordinary Story with a visible start-time note in its article text, then choose **Set up for later**. While coverage is **Not started**, the public page has no live timeline or auto-refresh; readers who opened it earlier must refresh once you select **Go live**. There is no automatic scheduled start time yet.

Write and Field share one desk: the same timeline actions (edit, publish or unpublish, pin, delete) through `ui/live/useLiveDeskControls.tsx`, and the same **Live update by … · Switch** for editors (`newsroom/posting-as.ts`), which credits an update to the reporter it came from. Crediting changes only the author: publishing is still the signed-in account's right, and the Story's activity records that account.

Readers see a byline on each update: the author's linked public Person, exactly as on an article (name, newsroom role, a link when they have a profile page, and their prepared portrait as a small avatar). Only the Person's ID is read from the account; account names, emails and IDs never leave. An author without a linked Person has no public byline.

Published updates advance the public revision. Each static deployment includes the full timeline in the article and a feed at `/_byline/live/<storyId>.json`. While coverage is live, the browser checks this feed in visible tabs and offers a button to show new or edited updates. A successful **Publish now** saves an update as published in Byline; it does **not** mean the update has already reached the public site. Delivery depends on successful snapshot preparation and deployment, and can lag behind the newsroom during builds. The article remains readable without JavaScript.
