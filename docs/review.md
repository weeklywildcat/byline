# Review

Reporters press **Submit for review** and nothing else. The engine (`apps/newsroom/src/newsroom/review.ts`, pure rules in `domain/review.ts` and routing in `domain/newsroom-roles.ts`) settles the version, chooses the workflow, routes the first step and moves the Story to Review.

## Submitted versions {#submitted}

A review is of one exact, immutable Payload version, the one that was submitted. The writer keeps editing the draft; the reviewer never sees it change underneath them. **A newer draft exists** is shown when it has.

Review mode renders the submitted words (headline, deck, the body) with each text block numbered, so a comment can name the words it is about, and the actual **media of that version**: the lead image, photos and galleries, with captions, credit and alt text. The byline the version carries sits under the deck. A gallery keeps each picture's own caption, credit and alt text beneath it, and a file edited after submission is flagged on that picture ("may differ from what the writer sent"); Byline does not keep the old bytes, so it never claims to show them. Video, audio and documents appear as named files. Nothing is read from the live form. Imported (legacy HTML) stories are read through an inert DOM parse and shown as text; no markup from them is ever rendered.

Media files are not versioned. When a submission is sealed, each file's name and publication revision are recorded. If a file or its crop is edited afterwards, the image is flagged as edited after submission, never silently shown as if it were what was sent. A deleted file says so.

## Pipeline {#pipeline}

A run snapshots its workflow at submission, so editing a workflow never changes a review in flight. Each step has a target (whole story, copy or visuals), a resolver, and a state: pending, active, approved, skipped or stale. Steps are routed deterministically ([routing](newsroom-roles.md#routing)):

- one eligible person is assigned;
- several form a **queue** anyone in it may claim;
- none is a **routing failure**: the Story stays out of Review with a reason an editor can fix, and editors are told.

Submitting is idempotent: a double click or a retry never creates a second review. Every engine write locks the Story's plan row and compares the run's revision.

Reviewers become participants on the Story while the review is open, so they can read it.

## Review mode and feedback {#review-mode}

Reached by **Review submitted version** or a notification, never a tab. Select words to comment. Comments are **pending** (only their author sees them) until a decision publishes them:

- **Request changes** publishes the feedback and returns the Story to Drafting, to the same step.
- **Approve & send up** approves this step and routes the next, or marks the Story Ready after the last.

A reviewer decides with the revision they saw, so a retried decision does nothing twice. A reviewer who does not claim a queue step must claim it first.

### Feedback {#feedback}

Writers see published feedback under the Story header (over Plan and Write) and in Review, can reply, and can resolve. After changes, **Resubmit** returns to the same step and, usually, the same reviewer.

## Changes since your last review {#changes-since}

A reviewer who reviewed an earlier round gets a comparison of the version they last decided on and the version now in front of them, from the two immutable versions:

- **Text**: block by block in order; an edited passage is shown word by word, added and removed passages are marked, and a removed passage shows where it used to be.
- **Visuals**: each block's files compared, so a lead image or photo is reported as added, removed or replaced, and an alt-text-only change is reported as such. In the article itself, a replaced, added or alt-text-changed visual carries a label ("Photo replaced since your last review") and shows the new picture; a removed visual is listed at the top of the Changes lens.

The summary reads like "1 passage edited · 1 added" and "Photo replaced". The **Whole story / Changes since your review** control switches the lens; Changes repeats the summary above the article and shows only what moved. Comments are made in Whole story, because their anchors are offsets into the submitted words. Imported stories get the category summary only.

### Staleness

Approvals carry a fingerprint of the copy and the visuals at the time. Copy is the words a reader reads (headline, deck, kicker, body text, captions, reporting note). Visuals are what they see (lead image, the files in media blocks, alt text, layout). A caption fix is copy, so it does not send a story back to the Visual Desk. A later change that touches what an approval covered marks that step stale; planning (deadlines, checklist, assignments) is not on the Story document and never stales anything.
