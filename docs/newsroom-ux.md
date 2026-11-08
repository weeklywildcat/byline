# Payload newsroom workflows

Byline uses Payload's document form, locking, drafts, autosave, version history
and scheduled publication. The screens below are the normal editorial
interfaces. **System administration** remains the administrator escape hatch
for maintenance, migration and inspection.

| Records | Editable in Byline | System-owned or deliberately deferred |
| --- | --- | --- |
| Stories | Write: headline, deck, kicker, Section, Topics, ordered byline, lead Media and caption, body, format, YouTube URL, presentation, immersive headline position, reporting note and live coverage state (editors). Edit URL: slug and, for editors, first publication instant. History: publication, versions, corrections and copy tools. Editors can move a Story to Trash from its publication menu; any scheduled publication is cancelled as part of the same action. | IDs, joins, author attribution on versions, timestamps, generated video facts and import provenance are system-owned. Imported HTML stays read-only; reviewed conversion is separate. Live updates themselves use the existing System record UI. |
| Pages | Site → Pages: title, slug, published parent, summary, prose body, search indexing, native draft, publish/unpublish and schedule; History lists recent versions. | First publication instant and record metadata are system-owned. Comparing or restoring Page versions still uses the native Payload fallback. Code-owned institutional pages and the sports archive keep their existing public routing. |
| People | People / My profile: name, slug (editors), pronouns, newsroom role, short and long bios, portrait, status, directory/profile visibility, public email and social profiles. Administrators manage that Person's newsroom access, sign-in email and access level from the same Person screen; editors can create guest contributors without creating accounts. | IDs, the underlying auth record/link, Google subject, legacy IDs and timestamps are system-owned. Raw Accounts remain only in System administration as a maintenance fallback. |
| Media | Library: upload, filename display, alt text, creator, credit, copyright, license, source URL, capture date, folder, focal point and supported crops. | Filename, MIME, dimensions, original and generated files, uploader, hashes, preparation state and revisions are system-owned. Where used scans native article blocks and other known relationships. Imported HTML references and retained versions are not shown in the inspector; retained native Story versions still protect files from deletion. |
| Sections | Site → Sections: name, slug, description, internal visibility. | IDs, legacy IDs and timestamps are system-owned. An internal Section has no public Story paths. |
| Topics | Site → Topics: name, slug, description. Staff can create a Topic while editing a Story. | IDs, legacy IDs and timestamps are system-owned. Topic landing pages are not published; the topic facts are used in Story metadata. |
| Publication | Site → Publication: identity, location, locale, timezone, public URLs, branding assets and dimensions, section descriptions, ordered navigation and social profiles, feature switches, licensing and SEO defaults. Save draft and Publish settings are separate. | Weekly Wildcat is the sole supported theme. No theme builder, secret management, private newsroom URL or public revision field lives here. Feature switches do not install distribution providers. |

A Person may have zero or one Byline sign-in account. Administrators grant,
edit, enable and disable that access from the Person; an existing unlinked
account with the same email is connected instead of duplicated. Byline sends no
invitation. Administrators can set a local fallback password; if left blank at
creation, Byline uses an unknown random credential until one is set. Disabling
access never changes the public profile, historical bylines or story history.

Story notes are private threaded discussions about the entire Story, with
replies and resolution. They are not attached to a selection of copy. Native
Lexical node keys do not survive the complete save/restore lifecycle as durable
anchors; inline annotation is deferred. Distribution offers copy actions from
the published headline, deck and URL. No local channel state or delivery
provider is configured in Payload, so no send, newsletter or delivery controls
are offered. The legacy shared adapter still has no standalone task list or
secondary format write; Tasks and Write own those actions.

## Publication and URL changes

First publication normally stamps the time automatically. To migrate a Story
by hand, enter the original local time in Edit URL and set the Section and slug
to match the existing live address. Verify the pathname before publishing. Add
one row per migrated Story to
`apps/newsroom/tests/fixtures/permalink-parity.json` using the old live URL, the
original UTC instant, the Section segment from the live address, and the Story
slug. The included rows are synthetic Eastern-time boundary examples.
`npm run test:newsroom` checks pathname parity using the shared
`publicStoryPath()`; no WordPress numeric ID is required.

Publishing a changed Story or Page address confirms the new path. Updating a
Section slug in Site reviews the number of live Stories affected. Redirect
changes are written with their public mutation. A Section move or publication
timezone change recomputes the affected live Story paths; a Page move preserves
its published descendants' old paths. A Story remembers its last live path
while unpublished, so republishing after a URL change still preserves that
address. Aliases collapse to one hop. Manual
redirects are administrator-only and accept literal same-site paths. A record
whose destination is offline stays in Site, but is omitted from the deployment
until the target is public again. Fixed public pages can be redirect
destinations; code-owned paths remain reserved as sources.

The existing Snapshot v2 `redirects` dataset carries only ID, source,
destination and 301 status. The static build emits both slash variants for
directories and one exact rule for file paths in Cloudflare `_redirects`. The
public Worker does not look up redirects in Payload.

Scheduling is a native job, separate from a Story deadline and publication
target. Pending drafts and scheduled rewrites remain private to the Story's
managers. Only editors publish, schedule, unpublish or move Stories to Trash.
Moving a Story to Trash cancels its pending scheduled publication atomically;
the Story remains recoverable with its drafts, versions and newsroom planning.
Permanent deletion is administrator-only. Readiness reports fields, body
validation and publication Media issues; warnings are advisory. Content Health
is independent published-content maintenance.

## Operations

Run `npm run jobs:maintenance --workspace @byline/newsroom` alongside the existing
workers, with access to the same completed snapshot directory. A Content Health
scan uses the current completed snapshot; wait for snapshot preparation if the
public revision just changed. The worker persists results and progress and never
scans on a page load. External checks use bounded HEAD requests to public IPv4
addresses (DNS pinned; no redirects or credentials). Unreachable destinations
and transient HTTP errors do not count as confirmed broken links.

The UX migrations add `redirects`, a private last public path on each Story plan,
Story version attribution fields,
`story_activity`, `story_notes` and its replies, and private `content_health` scan
records. The maintenance task extends Payload's native job task vocabulary.
