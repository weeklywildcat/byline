# Collections

Collections live inside Planning (`admin.php?page=byline-planning&tab=collections`).
A workspace uses `&collection=<id>`; an interview can be opened directly with
`&interview=<id>`. Collections are the single newsroom grouping primitive. They coordinate independent stories; membership never moves,
copies, or changes publication of a story.

## Workflow and presentation

The compact list supports search, status, lead/member, archived state, and sorting.
Overflow and context menus consume the same action definition. Creation requires
only a name and immediately opens the workspace. Duplication creates a Planning
shell with the existing brief, dates, type, and lead; it deliberately does not
copy reporting, people assignments, tasks, files, or story relationships.

The workspace has Overview, Stories, Interviews, Tasks, Resources, and Activity.
The brief includes lightweight key-angle notes. Large screens place editable
properties beside the reporting; narrower screens put properties after the brief.
There is no Collection calendar tab: View in Calendar scopes the existing calendar.

The implementation composes the current shared `admin-ui` Base Nova primitives,
`PeopleAvatars`, existing StoryList and the single StoryPeek, story creation and
workspace clients, task rows/dialogs, Media Library picker, activity rows, and the
existing appointment timing fields. Interview Peek is a right Sheet, full-width
on phones, with a scrolling form and fixed actions. Search pickers use Base UI
Combobox with fixed positioning inside the Sheet's portal so scrolling does not
place results beneath form controls. Coarse-pointer menu and picker actions have
44px targets. No independent theme or component library is introduced.

Stories show compact Collection memberships and only interviews explicitly linked
to that story. Add from Collection offers other reporting without automatically
injecting it. Removing membership preserves explicit interview/resource links.
Resources reference URLs or original Media Library attachment IDs; reusing an
existing resource preserves its identity. Link visibility does not change the
access policy of the external service or original WordPress attachment.

## WordPress ownership and persistence

Existing WordPress content conventions remain authoritative:

- Private, hidden CPTs: `byline_collection`, `byline_interview`, `byline_source`,
  and `byline_resource`. None is publicly queryable or registered with core REST.
- Scalar metadata stores Collection type/status/lead/dates/brief; Interview
  source/status/timing/follow-ups; Source contact; Resource URL/attachment identity.
- An Interview's `post_parent` is its Collection. Its reporting notes use post
  content. Sources have separate identities and contacts, ready for reuse later.
- `${prefix}byline_relationships` holds `(owner_id, relation, target_id)` edges
  with a unique primary key and reverse index. Relations cover story membership,
  members, interview stories/interviewers/recordings, shared resources and story
  references, and existing activity records. No serialized membership arrays.
- Existing `byline_task` persistence gains an optional private Collection ID. Tasks
  may be Collection-wide or reference one of its linked stories.
- Existing upgrade coordination creates/version-checks the relationship table.
  Permanent WordPress object removal cleans edges, distinguishing user targets
  from post targets even when their numeric IDs collide.

Collection brief writes accept `expectedBrief` and use metadata compare-and-swap.
Interview updates accept `expectedUpdatedAt` to reject stale snapshots. Scalar
updates write only supplied fields; relationship inserts are idempotent. Activity
uses existing bounded retention and safe projections, without notes/contact data.

## Protected API

All routes use `/byline/v1/editorial` and require `edit_posts`, plus object checks:

- `GET/POST /collections`, `GET/POST /collections/:id`
- `GET /collections/story-options` and `/collections/resource-options`
- `POST /collections/:id/stories` delegates normal story creation
- `POST /collections/:id/interviews[/:interview]`
- `POST /collections/:id/resources`
- `POST/DELETE /collections/:id/links/:kind/:target`
- `POST/DELETE /collections/:id/interviews/:interview/links/:kind/:target`
- `POST/DELETE /collections/:id/resources/:resource/links/resource-story/:target`
- `GET /stories/:id/collections`

List responses paginate at 100 Collections; the client loads all pages before
local filtering/sorting. Search options return up to 100 recent matches. Task
and global Interview schedule reads follow existing bounded 200-item patterns;
workspace Interviews and story memberships are not truncated. Activity shows the
latest 50 retained events. These are internal newsroom views, not a public API.

Newsroom users can view Collections. Editors create/duplicate; editors, leads,
and members coordinate a Collection. Story access and edits retain the existing
story context/edit capability checks; Collection membership grants no new story
permission. Collection-wide task assignees can work on their own tasks. Source
contacts are omitted for observers and returned only to editors/the Collection
team; only a Source's creator or an editor can change contacts, and shared Source
renaming/reuse is editorial. Resources may be reused only through visible
Collections; attachments require their existing edit capability.

Calendar and Home receive note/contact-free projections of shared interviews.
Exact interviews appear once, regardless of story count. Fuzzy windows remain
in Needs scheduling; timezone conversion and validation use existing appointment
helpers. No copied per-story appointment is created.

## Verification

`tests/integration/collections.php` exercises real WordPress REST/database writes,
normalized multi-membership, independent shared interviews, task completion,
permissions, stale edits, date modes, and anonymous/core REST non-exposure. The
standard WordPress E2E runner includes this integration test.

`tests-js/collections.test.ts` covers filters, action parity, idempotent changes,
API pagination, and appointment adapters. `tests/e2e/collections.spec.ts` covers
the reporting workflow and a realistic five-story/four-person/six-interview desk
at 1440, 1280, 1024, 768, and 390px, including popup geometry and document overflow.

## Optional public coverage

The Overview ends with a compact Public coverage section. A Collection remains
newsroom-only until a user with both Collection edit access and `publish_posts`
explicitly saves its public presentation. Publish as coverage opens a dialog;
public controls do not compete with reporting coordination on the overview.

The private `_byline_collection_public` meta object contains `publicEnabled`,
`publicTitle`, `publicSlug`, `publicDescription`, `publicOverview`,
`artworkAttachmentId`, `featuredStoryId` and `storyOrder`. Public wording is
independent from the internal name/brief. Dates reuse the Collection's existing
start/end fields. Story order references existing relationship edges; it cannot
add a second membership. The featured story appears first, followed by the
selected order and any newly linked stories. Unpublished, private and
password-protected stories are always excluded. Public settings writes validate
membership, unique URL slugs, image attachments and publication capability.
Disabling public coverage preserves its settings for later use.

Reader-facing `/coverage/` and `/coverage/:slug/` routes, SEO, breadcrumbs,
CollectionPage structured data and static path generation keep their existing
contracts. `/byline/v1/coverage` and `/byline/v1/coverage/:slug` are allow-list
adapters backed by public Collections. The build snapshot uses the same
projection. It never serializes Collection brief, people, interviews, tasks,
resources, notes, contacts or activity. Public settings/dates/status, membership
changes and artwork edits invalidate the existing public build revision.

## Legacy Coverage migration

The upgrade coordinator runs `byline_migrate_coverage_to_collections` after
installing the existing relationship table. Each legacy `byline_coverage` gets
its own private Collection; no matching by title or overlapping stories occurs.
The insertion includes `_byline_collection_legacy_coverage_id`, allowing retries
to resume an interrupted migration without duplicating the Collection. A lock
prevents concurrent migrations. Source records remain intact for recovery.

The migration carries title, exact public slug, dek/overview, dates, artwork,
public visibility, staff memberships and story relationships. Status maps
Upcoming → Planning, Active → Active, Past → Wrapping up, Archived → Archived.
Legacy source status remains recoverable. Public URLs resolve under the same
slugs without redirects. Legacy creation/editing routes and screens are retired;
only storage readers, the hidden legacy CPT and migration compatibility remain.

Old `tab=coverage` and `#/planning/coverage` bookmarks lead to Collections.
An old `coverage=<id>` query preserves the migrated Collection when possible.
Planning Performance bookmarks lead to Today. Analytics provider settings and
its protected metrics/test endpoints remain available in Settings.

A newsroom-wide Sources directory UI remains deferred.
