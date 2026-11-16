# Live coverage

Turn on live coverage with Story mode (Standard / Live) in Write. Write and Field Mode share the Story's updates. Staff can submit drafts; editors and staff with the Story's explicit live publishing grant can publish updates. See [Reporting](reporting.md) and [Field Mode](field-mode.md) for capture and delivery.

An update contains bounded prose, an optional headline and photo, and a publication time. A single update can be pinned as key points. Ending coverage keeps the timeline, and resuming preserves the original start time. Draft updates, private account information, and updates on unpublished or trashed stories stay out of the public projection.

Write and Field share one desk: the same timeline actions (edit, publish or unpublish, pin, delete) through `ui/live/useLiveDeskControls.tsx`, and the same **Live update by … · Switch** for editors (`newsroom/posting-as.ts`), which credits an update to the reporter it came from. Crediting changes only the author: publishing is still the signed-in account's right, and the Story's activity records that account.

Readers see a byline on each update: the author's linked public Person, exactly as on an article (name, newsroom role, a link when they have a profile page, and their prepared portrait as a small avatar). Only the Person's ID is read from the account; account names, emails and IDs never leave. An author without a linked Person has no public byline.

Published updates advance the public revision. Each static deployment includes the full timeline in the article and a feed at `/_byline/live/<storyId>.json`. While coverage is live, the browser checks this feed in visible tabs and offers a button to show new or edited updates. Update delivery therefore depends on successful snapshot preparation and deployment. The article remains readable without JavaScript.
