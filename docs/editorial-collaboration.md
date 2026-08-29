# Editorial collaboration

Byline keeps newsroom collaboration in the system that owns the job. The
editorial sidebar and Planning surface connect these systems, but they do not
duplicate their data.

## WordPress Notes

On WordPress versions that provide Notes, use Notes for copy-editing discussion:

- line- or block-level copy edits
- fact questions and wording suggestions
- mentions and asynchronous replies

Notes remain WordPress-owned comments. Byline does not copy Note text into task
records, activity logs, REST projections, or a second comments database. Notes
are progressively detected; older WordPress versions keep the existing Byline
workflow without a fatal error or a fake Notes control.

## Byline Tasks

Use a Byline Task when somebody needs to perform a bounded piece of newsroom
work, such as arranging an interview, finding a source, requesting a photo, or
verifying a detail. Tasks have their own assignee, priority, due date, and open /
completed state. They are not a replacement for text-anchored copy feedback.

## Byline Workflow

Workflow stages describe the handoff state of the story: pitch, reporting,
writing, editing, ready for review, or a sidelined state. A stage is not a
comment and does not imply that a WordPress Note exists.

## Discord

Discord is for broad newsroom discussion and the story thread when one is
linked. The WordPress control plane exposes only safe configuration and link
state. Credentials and unlinked private integration settings never appear in
the public API.

## Integration boundary

The Story sidebar leaves native Notes available and reports whether Notes are
available on the current editor. Any future Notes adapter must use a documented
WordPress API and read existing Note data in place; it must not migrate or
duplicate stored content into Byline.
