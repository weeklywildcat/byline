# Distribution

Distribution is private newsroom work around a Story's publication. It shows where the Story still needs to go, who owns the work, and what actually went out.

## Policy

On a Story's first publication, Byline applies the first matching rule for each enabled destination. A rule can target a Story template, Section, or both. **Prepare** creates work the desk expects to start. **Eligible** creates work without flagging it for attention. **Optional** suggests the destination on the Story, where the team can add it.

The starter policy prepares Instagram and Facebook for published Stories and requires editorial approval for staff. Newsletter is eligible, School TVs are optional, and Discord, YouTube, and Other start disabled. Administrators can change this under **System administration → Distribution settings**. Later policy changes apply to first publications. A draft, autosave, unpublish, or republish leaves existing Distribution records and history intact. Seeding creates unassigned work silently.

## Working from a Story or the desk

Open **History → Distribution** to prepare a destination in context. Editors use **Publish → Distribution** to see work across Stories. The desk is a table, with the destination, status, and owner grouped under the Story on a narrow screen. Tabs and filters live in the URL so a desk view can be revisited. The Story and desk open the same destination Sheet.

Editors can assign an enabled account. A Story team member can claim unassigned work from the Sheet. Owners prepare their items there. **Needs attention** shows delivery failures, approval requests, overdue work, missing draft requirements, unstarted preparation with no planned time, and scheduled work still unconfirmed after two hours.

## Story copy and custom copy

While work is pending, each **Story** field follows the published headline, deck, or featured image. **Custom** overrides only that field. Returning a field to **Story** resumes inheritance and retains its custom value for later. Choose **None** when the destination allows sending without an image.

Custom copy autosaves. Closing the Sheet or changing a destination action first saves pending copy. If the save fails, the Sheet keeps the edit and offers **Retry save**. Field errors for a final link appear beside the link.

## Ready and approval

**Ready** means the copy and image meet the destination's requirements. At destinations that require approval, staff mark their work Ready and an editor can approve it. An editor marking work Ready approves it in the same action. An editor's direct edits retain approval. A staff edit to channel copy or image clears approval and requires another editor check before scheduling or posting. A Story needs to be published before Byline can record a new send.

## Manual scheduling and posting

All destinations are manual. Use the destination itself to post or schedule. **Scheduled…** records when staff scheduled the item on that platform, using the newsroom time zone. It records the time for follow-up and confirmation.

For Instagram and Facebook, paste the final post address and choose **Save link**. A valid permalink records the item as Posted in one action. Profile and short links need to be replaced with the full post address. Destinations that can go out without a permalink offer a direct confirmation such as **Mark sent**.

## What went out

At confirmation, Byline freezes the effective headline, text, Media IDs, Story URL, destination, final permalink, actor and time. Later Story edits leave that snapshot intact. Editors can reopen an item to record another attempt. Reposting appends a snapshot and keeps earlier attempts visible on the item. The desk shows the newest 200 matching Posted items, with older work available from its Story.

Failed is reserved for a delivery failure reported by the system. Late manual work appears in Needs attention. The future adapter interface lives in [`distribution/adapters.ts`](../apps/newsroom/src/distribution/adapters.ts).

## Privacy

Distribution lives in the private newsroom, with Story access or assignment checks on reads and server-side permissions on each action. The public Snapshot and Astro site use the Story's public facts. Internal copy, notes, owners, approval, timing, failure details and sent history stay in Byline, even when the external post is public.
