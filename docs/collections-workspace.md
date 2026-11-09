# Collections workspace

A **Collection** is the canonical private newsroom reporting/project workspace.
It coordinates stories, a team, shared reporting and work. **Coverage** and
**Series** are optional public presentations of that Collection, never separate
newsroom destinations or a second authority. The newsroom product is Collections;
the public site keeps its `coverages` dataset and `/coverage/` URLs.

Collections are managed in Payload and projected into Snapshot v2 when public presentation is enabled.

## Ownership and schema

`apps/newsroom/src/collections/Collections.ts` defines three unversioned Payload
collections. Shared screens and contracts live in
`packages/newsroom-screens/src/collections`; Payload supplies `CollectionApi`,
links, capabilities, fetchers and the Media picker through `src/ui/collections`.
`src/newsroom/collections.ts` builds screen DTOs and handles semantic writes.
Authenticated `/api/byline/*` endpoints read and write as the enabled account
with `overrideAccess: false`.

| Record | Stored data and relationships |
| --- | --- |
| `collections` | Required `name`, `type`, `status`; private `brief`; `lead` and `members` referencing newsroom users; `startDate` / `endDate`; ordered `stories` membership; nested `publicPresentation`; `createdBy`, historical import ID and Payload timestamps. |
| `collection-interviews` | Required parent `collection` and `interviewee`; status and timing; location; interviewer users; linked member stories; notes, follow-ups, protected `privateContact`; linked resources; completion/creator metadata. |
| `collection-resources` | Required label and kind; web URL and/or Media reference; links to multiple Collections and stories; creator metadata. |
| `tasks` | The existing task engine gains optional `collection`; `story` becomes optional, with at least one context required. No separate Collection task engine. |

Types are `event`, `ongoing`, `series`, `project`, `other`; statuses are `planning`,
`active`, `wrapping-up`, `archived`. Dates are calendar-day text (`YYYY-MM-DD`),
never instants. The end date cannot precede the start date. Membership is unique
and ordered on the Collection; a story's Collections are derived from it. Adding
a story neither copies it nor changes its publication or permissions.

`publicPresentation` stores `enabled`, `format` (`coverage` or `series`), public
title, slug, description, plain-text overview, Media artwork, featured story and
public story order. Public wording is independent of the private name and brief.
Enabling requires title and slug; slugs are normalized and unique. Artwork must
be an image. Featured/order references must be member stories. Disabling keeps
the settings. Public format and newsroom type are independent choices.

## Workspace and navigation

Collections follows Media in the global navigation. `/admin/collections` is the
list; `?collection=12` opens a workspace, `&tab=reporting` selects its section and
`&interview=4` opens Interview Peek in Reporting. Back, Forward and refresh retain
that route. Moving within Collections uses native history, without a shell
remount. Collection briefs, interviews and public settings use explicit saves;
the workspace's dirty guard protects section changes, switching Collections,
shell navigation and history traversal. Reload/close uses the browser prompt.

| Section | Implemented surface |
| --- | --- |
| Overview | Private reporting brief, upcoming work, story progress and editable properties/team, with links into the other sections. |
| Stories | Readable member stories through the shared Story list/Peek; create a story or link/remove an existing one. |
| Reporting | Shared interviews, timing/status and linked stories; Interview Peek edits notes, follow-ups, contacts and resource links. |
| Tasks | Collection-owned tasks plus a separately labelled roll-up of open tasks from readable member stories. |
| Resources | URL/file resources, reuse, story links and unlinking. |
| Public | Optional Coverage/Series settings and full public reading order, saved explicitly. Shown to editors, or read-only when already public. |

Payload advertises `activity: false`, so no Activity tab is shown. Editors can
duplicate a Planning shell with brief, type, lead and dates, without copying
stories, team assignments, reporting, tasks, resources or public settings.
Global Create and New collection use
the same shell dialog: both name and an explicitly selected type are required.
It starts in Planning with its creator as lead, then opens its empty workspace.
Dates, team, brief, reporting and public settings are filled in there.

The list uses server-side search, view/filter, sort and pagination. The switcher
is a compact project list, not a folder tree or duplicate full list. It offers
Active, Mine, All and Archived, searches by name and lists up to 50 results. The
open Collection is pinned above results when excluded by the search/view/page.
The view is normalized and saved in Payload Preferences under
`byline:collections:switcher-view:v1`; search and scroll positions persist in the
mounted shell while switching Collections. All collections returns to the list.

## Responsive shell

There is one `SidebarProvider`, one collapse preference and one outer sidebar.
The list retains the normal 256px global sidebar. At viewport widths of at least
1280px, an open Collection composes the 48px global icon rail and switcher into
a 340px sidebar (`sidebar-09`). Collapsing leaves the rail and makes the hidden
pane inert. Below that workspace breakpoint the normal global sidebar remains;
Switch collection opens the same switcher content in a temporary Sheet.

The workspace uses container queries: properties move beside reporting when
space permits and stack on narrower screens. Section tabs scroll inside their
own strip rather than widening the page. Interview Peek uses a Sheet with a
scrolling form and fixed actions, full-width on phones. Shared coarse-pointer
controls have touch targets; controls remain available without hover.

## Tasks, reporting and resources

A task belongs to a story, a Collection, or a member story within a Collection.
Creation with both contexts requires both management permissions. Context cannot
be moved by an ordinary update. Story managers and Collection coordinators
manage applicable work; other assignees can update their assigned work under
the existing restricted-field rules. Observers do not gain all Collection tasks
just because they can browse the workspace.

A Collection interview is one shared reporting record, usable by multiple member
stories and multiple interviewers, or created before a story exists. It is not
a copied Story source or appointment. Status is `planned`, `scheduled`,
`completed`, `follow-up` or `cancelled`. Exact timing uses UTC instants interpreted
in `BYLINE_NEWSROOM_TIMEZONE`; windows stay date-only and unscheduled records
have no dates. Contacts are restricted to editors, lead and team, including at
Payload field access. Calendar and Home receive only scheduling fields.

Resources have kinds `link`, `document`, `recording`, `schedule`, `reference`.
They require an allowed web URL or a Media asset and retain that identity on
reuse; files are never copied into a second storage system. A resource may serve
several Collections and stories. Adding a story reference requires membership
in a linked Collection. Interview resources must already belong to its Collection.
Unlinking removes that Collection reference and relevant interview attachments;
it does not delete the shared record or Media file. Only editors can explicitly
delete an unused resource, and references from Collections/interviews block it.
External service/file permissions do not change when a link is shared.

Removing a story from a Payload Collection removes its interview links in that
Collection, clears `tasks.collection` for its Collection-linked story tasks and
prunes the public featured/order references. The story and its own work survive.
Administrator deletion removes Collection interviews and Collection-only tasks,
detaches the Collection from story tasks and shared resources, and keeps stories
and Media assets.

Brief writes compare `expectedBrief`, and edits that supply `expectedUpdatedAt`
reject a newer record with 409. These are explicit stale-edit checks; they do
not imply atomic compare-and-swap or Payload Story autosave/version semantics.

## Calendar, Home and Media

View in Calendar opens `/admin/calendar?collectionId=12`. A visible banner names
the Collection, links back and offers Show the whole newsroom. The Calendar
includes readable member-story dates, appointments and production work, plus
that Collection's interviews and tasks. Exact shared interviews appear once,
regardless of linked story count; windows and unscheduled interviews remain in
Needs scheduling. Interview events link to Reporting/Interview Peek; Collection
task events link to Tasks. `collection=` and `coverage=` remain accepted Calendar
query aliases. There is no second calendar inside a Collection.

Home includes assigned open Collection tasks through the canonical task read
model and interviews the account is conducting in upcoming/scheduling signals.
Collection links and command-palette results open the workspace; search results
use names, never briefs, contacts or resource addresses. The server provides a
story-Collections read endpoint; this slice does not claim a newly ported Story
editor Collections panel.

Collections uses the shell's Media Library picker for public artwork and resource
files. Media deletion guards count both public artwork and Collection resource
references. Media's own navigator has no reporting-Collection folder/group or
Collection-scoped Work view in this slice. See [media-workspace.md](media-workspace.md).

## Access and raw Payload fallback

`src/access/collection-context.ts` owns Collection decisions. Every enabled
newsroom account can read Collections, their brief/team, interviews and resources;
the workspace remains private to authenticated newsroom users. DTOs include
only stories that the reader can already access and omit protected contacts.
Collection membership never grants access to an unreadable draft or Story plan.

| Action | Who |
| --- | --- |
| Create | Editor, administrator |
| Coordinate brief/status/membership/interviews/resources | Editor, administrator, Collection lead or member |
| Change lead/team | Editor, administrator or lead |
| Public presentation; archive/restore | Editor, administrator |
| Delete Collection | Administrator |

Raw Payload navigation is an administrator fallback via System administration,
not the staff destination. Raw `collections`, interviews and resources are hidden
from non-administrators in Payload admin. Thus editors can use Collections and
its API but cannot open `/admin/collections/collections`; administrators can open
that list and its document routes. This is distinct from raw Story routes:
`/admin/collections/stories` remains accessible to editors, and Story documents
remain the route into Payload's native form lifecycle. Hidden admin screens do
not replace data access controls.

The exact Next page `app/(payload)/admin/collections/page.tsx` resolves Payload's
reserved `collections` segment through its own `RootPage`, registering the view
internally at `/byline-collections`. `/admin/collections/<slug>` still uses the
existing Payload catch-all. The nav entry has `exact: true`, carried through
`BylineNav` to `BylineSidebar`, so raw collection screens do not highlight the
Collections destination and Story documents still highlight Stories.

## Public compatibility and migration

`src/newsroom/public-coverage.ts` implements the allowlisted public `coverages`
projection from enabled Collections with a public slug. It selects public
settings, dates/status, timestamps, published member-story identities and safe
artwork metadata. No private brief, name/team, reporting, contacts, tasks or
resources enter it. Reading order is featured story first, then saved order,
then remaining membership; duplicates/nonmembers are removed. Unpublished
stories and unpublished rewrites are excluded, and published parts are numbered
consecutively with no gaps. The Public tab lists the full readable membership,
including unpublished stories, so their saved place survives until publication;
there is no short preview limit that truncates the public order.

Status maps Planning → Upcoming, Active → Active, Wrapping up → Past and
Archived → Archived. The overview is normalized plain text with
`overviewParagraphs`; the renderer escapes it. Artwork is ID/alt/dimensions and
stories are identities and positions. The snapshot adds the prepared public artwork and full public story references. The public URL becomes available after the next deployment.

The committed migration `20261106_233140_collections` replaces the old thin
Payload `coverages` authority: each record keeps its ID, legacy ID and timestamps;
title becomes private name and public title; stories become membership and initial
public order; slug, format, description, overview and artwork become enabled
public settings. Series maps to type Series, otherwise Ongoing coverage. Status
uses the inverse mapping above; old instants become newsroom calendar days. The
sequence advances beyond retained IDs. Old tables/relations are dropped, and
`coverages` is no longer registered in Payload. It survives only as a public
compatibility dataset name. The down migration reconstructs the old public shape;
it cannot preserve all new private reporting data, so it is not a lossless rollback.

## Validation

`apps/newsroom/tests/integration/collections.test.ts` covers the semantic API,
roles/privacy, stale edits, membership, tasks, reporting/resources, Calendar/Home
and public compatibility projection on real PostgreSQL. The shell tests cover
routes, width/composition, pinned/current switcher behavior, navigation state and
the server navigation's exact-match flag. Shared Calendar and Media regressions live under `packages/newsroom-screens/tests`.
