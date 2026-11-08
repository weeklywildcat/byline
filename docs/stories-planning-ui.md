# Stories and Planning on Nova

Planning (Stories, Collections, Calendar, Media Desk, Content Health,
Feedback) is the third screen of the newsroom workflow UI, built on the same
stack as [Home](byline-home.md) and the [Story Workspace](story-workspace.md):
React 19, TypeScript, TanStack Query, Tailwind 4, shadcn base-nova on Base UI,
Lucide, and WordPress `apiFetch`. There is one design system, one quick view of
a story, and one full detail page.

| Level | Component | Purpose |
| --- | --- | --- |
| Collection | Stories (Board, List, Calendar), Collections, Media Desk… | See many stories |
| Inspect | `StoryPeek` (`src/story/StoryPeek.tsx`) | Quick context, from any row, card or event |
| Coordinate | `StoryWorkspace` (`?page=byline-planning&story=<id>`) | Reporting, tasks, production, links |
| Write | Gutenberg | The article |

A test (`tests-js/story-peek-single.test.ts`) pins that there is exactly one
`StoryPeek` implementation and no Planning quick view.

Peek puts open tasks and production before supporting reporting context.
Collections and explicitly linked interviews/resources share one collapsed
summary below that work; expanding it exposes navigation and the existing
relationship pickers. Empty reporting has one workspace action instead of
separate source and appointment buttons. The full workspace keeps the expanded
Collection controls.

## Bundles and routing

| Address | Bundle (private React 19) |
| --- | --- |
| `page=byline-planning` (Today) | `home` |
| `page=byline-planning&tab=stories\|collections\|calendar\|media\|content-health\|feedback` | `planning` |
| `page=byline-planning&story=<id>` | `story-workspace` |
| Settings, Newsletters | `index` (WordPress React; out of scope here) |

`planning` externalizes only `wp-api-fetch` and `wp-i18n`. `@wordpress/i18n` has
no React coupling, so the existing `__()` strings stay translatable
(`wp_set_script_translations` is registered for the handle). `scripts/package-plugin.sh`
fails the release if the planning manifest ever lists a WordPress React or
component handle.

Everything mounts in `.byline-ui-root` through `AdminRoot` (portals, tooltips,
toasts). `src/planning/style.css` imports the shared `@byline/newsroom-ui/styles.css` and the
Schedule-X shadcn theme; the PostCSS scoping loader prefixes every selector, and
`tests-js/admin-style-scope.test.ts` fails if any compiled selector could reach
wp-admin, Gutenberg, Users or the Media Library. Only on these three screens a
body class (`byline-nova-page`) repaints wp-admin's grey canvas white.

## Shared code (`src/story/`)

`StoryPeek`, `StoryPeekHost` (owns which story is open, focus return and the
Add task dialog; every surface just calls `openStory(id)`), `StoryCreateDialog`
and `TaskCreateDialog` (Home and Stories share them), `useCompleteTask`, the
query keys and `invalidateStoryData`, `createStoryFetchers`, shared rows, and
small presentation pieces (`StoryTitleButton`, `StoryDueLabel`, `StorySignals`,
`ProductionSummary`, `WorkflowBadge`). Planning keeps `planning-api.ts`,
`planning-model.ts` and `calendar-model.ts`: React-free transport and domain
logic. The Media Desk is the shared `@byline/newsroom-screens/media/MediaWork`
(with `media-desk-model.ts`), which the Payload newsroom also renders as Media
Work ([media-workspace.md](media-workspace.md)).

Server state is TanStack Query: `["byline","planning",filters]`,
`["byline","workspace",id]` (shared by Peek and the workspace),
`["byline","schedule",from,to,tasks]`, `["byline","media-desk"]`, and so on. Any
change to a story calls `invalidateStoryData`, so Home, Stories and the Calendar
agree. Selected view, open menus, drag state and form text stay local.

## Stories

`StoriesPage` lives in `@byline/newsroom-screens` and is shared by the WordPress
admin and the Payload newsroom. It knows no CMS: what only one host has arrives
as an optional capability. `renderCalendar` supplies the Calendar presentation
(WordPress mounts the shared Schedule-X Calendar from
`@byline/newsroom-screens/calendar` there; the Payload newsroom passes none,
offering Board and List only, because its Calendar is its own destination), and
`locationHref` supplies a location's address (WordPress: `planning-routing.ts`;
default: `scope=` or `view=` on the current address).

Stories is the one home of **every** story. It is the same Stories collection
(no second collection, API or sidebar destination); what changes is which stories
you are looking at. Published work is a first-class part of Stories, not a
filter you have to discover.

Four controls, four questions (`stories-scope.ts` holds the rules, free of React):

- **Which stories?** The **scope**, line `Tabs`: **Working · Published · All**,
  each with a quiet count.
  - *Working* (the default) is the newsroom work queue: every unpublished story
    (drafts, scheduled, any workflow stage) plus a published story only while it
    still has open work (`storyHasOpenWork`: an open task, unfinished production,
    an appointment to schedule, a review request).
  - *Published* is the publication record: every published story, finished or
    not, newest first (`published` sort, on `publishedAt`, never the plan).
  - *All* is the library: every story the reader may see, most recently
    updated first.
  Counts come from the planning response the screen already holds (the server
  narrows it by the refinements), so they need no request of their own and move
  with the filters.
- **How is it presented?** Board | List (| Calendar), a single-choice
  `ToggleGroup` (outline, `aria-label="Stories presentation"`) shown **only in
  Working**. Published and All are listed, so they render no presentation control
  at all. The Working choice is remembered across scope switches and in
  `byline:stories-view`.
- **Which of those stories?** The views picker: built-in presets (My stories,
  Ready for review, Overdue, Unassigned, Art needed, On hold; each scope lists the
  ones that mean something there, and there is no "Published" preset, because
  Published is a scope) and the reader's saved views. A built-in view refines
  the scope you are in; a saved view stays selected while edited and reads as
  *modified*.
- **How is it refined?** The toolbar, which follows the scope
  (`SCOPE_FILTER_CONTROLS`). Working: search, Workflow, Writer, Editor and More
  filters (visual status, deadline and planned ranges, Mine, Unassigned, Overdue,
  Needs review). Published: search, Writer, Editor and More filters (published
  range, Mine). All: search, Workflow, Writer, Editor, published range, Mine,
  Unassigned. A filter that is still on but not offered in the current scope is
  shown as a removable chip, never applied unseen. `publishedFrom`/`publishedTo`
  are a range on the day a story went live (newsroom timezone); WordPress does not
  query on it, the screen applies it.

**Addresses.** `scope=` and `view=` (plus `&tab=stories` in WordPress). Working is
implicit: `?view=board|list|calendar`. A library is `?scope=published|all` and
carries no `view` (`?scope=published&view=board` opens Published as a list).
Changing scope or presentation uses `pushState`, Back and Forward restore both, and
a reload lands on the same place. An unknown scope is Working. The earlier
`publication_state=published` always meant published stories, so an old bookmark
opens Published (`resolveStoriesRoute`), and that parameter is dropped from the
address on the next change.

**Saved views and the scope.** Saved views remain filters plus a sort. Published
is stored the way it always was, as `publicationState: "published"`: saving while
on Published keeps it, and applying a view with it opens the Published tab
(`promoteScopeFromFilters`) rather than showing Published stories under a Working
tab. Draft and Scheduled stay a refinement among unpublished stories (a chip, no
select) and move a reader off Published. Working and All are not stored.

**Published and All** are rendered by `StoryLibrary`: one table above a measured
width (shadcn `Table`) and compact `Item` rows below it, over a per-scope column
list (`libraryColumns`). Published is Story, Section, People, Published, Updated,
with newsroom-day separators (Today, Yesterday, then the date) while it runs
newest-first; All is Story, State, Section, People, Publication, Updated. Neither
edits a workflow stage or a deadline, and a published story is never a Board card
or movable (`canMoveFromMenu`). Section appears only when the host supplies
sections (the Payload newsroom does; WordPress does not yet).

One controller (`useStoryViews` in `StoryViews.tsx`) owns the story set: the
built-in and saved views, Save, Rename, Update, Delete and its **Undo** toast,
and the dialogs, rendered once. `StoryViewsPicker` presents it as one menu
beside the presentation control. Stories is one column beside the app sidebar:

```
Stories
The newsroom's stories, in progress and published.

Working 8   Published 7   All 14        [ All stories ▾ ]  [Board|List]
[Search] [Workflow] [Writer] [Editor] [More filters]
the scope's stories
```

There was a `StoryViewsRail` (a `sidebar-09`-style views pane beside the page
from a 1080px container width). It was removed: collection views did not
justify a second permanent navigation column next to the app sidebar, and on
real screens it competed with the List for width. The picker does the same job
in one control.

`onNewStory` is an optional host capability: WordPress, which has no global
Create, passes it and shows **New story**; the Payload newsroom omits it,
because the shell's Create is already beside Stories.

**Switching between stories while writing** is not Stories' job: in the Payload
newsroom an open story's sidebar becomes a Story workspace with a compact Story
switcher (My stories, Ready for review, All stories, plus search), built on the
same Planning API, presets and query cache (docs/payload-migration.md §7.2).

Saved views are the reader's own. WordPress keeps them in user meta behind its
REST routes; the Payload newsroom keeps them in Payload Preferences
(`byline:stories:saved-views:v1`). Either way a view has no owner field, and
stored views are normalized on read (`normalizeSavedPlanningViews`: at most 25,
names up to 80 characters, sanitized filters and sort).

### Board: Pragmatic drag and drop

**Layouts.** The board has three layouts, chosen from the **Board layout**
button (`LayoutGrid`) just left of the Board | List tabs, shown only on Board:

- **Lanes** (the default): one muted column per stage with compact cards
  (title, one who/when row, signals only when there are any; about 64px). Main
  stages, a thin divider, then the sidelined stages.
- **Dense**: bordered stages of one-line rows (about 50px; the first signal plus
  `+N`). Empty or folded stages narrow to a 148px "Drop here" slot; stages with
  stories keep at least 224px, and the board scrolls sideways rather than
  squeezing them. Sidelined
  stages leave the columns for a footer of chips; each chip is a drop target
  and opens its stories in a popover.
- **Stacked**: one section per stage, sidelined included, top to bottom, each a
  grid of Lanes cards. The page scrolls. An empty section is one line tall, and
  grows a dashed drop area while a story is being dragged.

Lanes and Dense fit the window: the board measures its own top and takes the
rest of the viewport height, columns scroll on their own, and auto-scroll is
registered on every column body as well as the horizontal scroller. Below
`sm` they keep the page scroll and card-width snap columns. Stacked uses window
auto-scroll only.

**Folding stages** (Lanes; Dense shares the state). A stage is folded when it is
empty, or when the reader folded it; Dropped starts folded. In Lanes a folded
stage is a narrow rail (count and a vertical badge) that expands on click. A
reader's explicit fold or unfold outlasts the empty rule. A folded stage is still
the drop target for its whole area and shows the same ring while a drag is over
it. Moving a story into a folded stage (or a closed sidelined chip) keeps the
fold: the rail, slot or chip flashes and takes focus instead of the hidden card.

Both are reader preferences in this browser, like `byline:stories-view`, and
never filters: the layout is `byline:stories-board-layout`
(`lanes|dense|stacked`, unknown values fall back to Lanes) and the folds are
`byline:stories-board-collapsed` (`{ [statusId]: boolean }`), both in
`src/planning/stories-board-layout.ts`. Neither appears in saved views or the
address.

`@atlaskit/pragmatic-drag-and-drop` owns draggables, drop targets and
monitoring; `…-auto-scroll` scrolls the board, its columns and the window;
`…-live-region` announces results. Nova owns every pixel. The hitbox package is
deliberately not installed.

**Ordering model.** Byline stores a story's workflow stage but **no order within
a stage** (the planning query sorts by modified, deadline or planned date). So a
drop means "move to this stage": columns keep their deterministic sort, and
nothing pretends an insertion point persists. If a canonical order field is ever
added, add `@atlaskit/pragmatic-drag-and-drop-hitbox` and relative insertion then.

Dragging, and the **Move to** menu (keyboard and touch), call the same
`useMoveStory` mutation: optimistic update of every cached collection, save,
rollback of just that story on failure, and an announcement ("Canteen moved from
Assigned to Reporting."). After a move focus stays on, or returns to, the story's
title. A story that WordPress has published is not a board card and has no move
action. On narrow screens columns stay card-width and scroll sideways with snap.

Cards have no visible actions row. The three-dot `StoryActionsMenu` sits in each
card's or row's top-right corner and appears on hover or keyboard focus within
it (always on touch pointers), so **Move to** stays reachable by keyboard and
touch. Board cards also use the same native shadcn `ContextMenu` as List rows,
unchanged: right-click is an accelerator for Quick view, Workspace/article links
and **Move to**; dragging, the corner menu and keyboard/touch paths remain
first-class.

### List

A native shadcn `Table` with seven columns (Story, Workflow, People, Deadline,
Publication, Work, Updated) and the existing sort; below about 820px of
available width it becomes compact rows. TanStack Table is not used: nothing
here needs column visibility, multi-sort, selection or pagination.

The desktop List uses a collapsed, fixed-layout table with quiet horizontal
separators, a 36px header and approximately 48–57px rows. Headlines clamp at two
lines; full titles remain in the accessible title button and Story Hover Card.
Publication emphasizes the date, with only planned/scheduled qualifiers. Work
keeps two signals visible and discloses any others through a named `+N` popover;
other `ProductionSummary` consumers continue to show all signals. Bare cell
padding also opens Peek, while every descendant keeps its own interaction.
Scrolling stays with the document: the existing horizontal overflow wrapper
would trap a sticky header, so the List adds no nested vertical scroll region.

The List is also the fastest editing surface. High-frequency scalar values use
direct manipulation instead of forcing a Story Peek round-trip: click **Workflow**
to open the native shadcn `Select`, click **Deadline** or an editable planned
publication date to open the shared Popover/Calendar date picker. These edits use
optimistic TanStack Query updates and roll back only the affected story on
failure. WordPress scheduled/published timestamps stay read-only here because
they are canonical publication state rather than planning targets.

A row is wrapped in the native shadcn `ContextMenu`, so right-click exposes
Quick view, Workspace, Gutenberg/preview links, and the same **Move to** status
submenu as the visible three-dot menu. The context menu is strictly an
accelerator: the title, inline controls, and three-dot menu remain the primary
keyboard/touch routes. This avoids hiding required actions behind right-click
while still giving mouse and trackpad users a spreadsheet-style workflow.

### Calendar: Schedule-X

Schedule-X v4 (`@schedule-x/react`, `calendar`, `events-service`,
`theme-shadcn`, with `temporal-polyfill` pinned to the version `calendar` requires)
does layout, views and responsiveness. No premium packages are installed.
Schedule-X's drag-and-drop is premium (the free plugin stops at v3), so it stays
off. A host may opt in to **Byline's own day-level drag** with the `reschedule`
prop: Pragmatic drag and drop on the event chips, the day under the pointer read
from Schedule-X's day markup (`calendar-drag`), and what a drop means decided
by the pure `calendar-reschedule` model. Events move by whole days only: a time
of day (newsroom timezone) and a duration are kept, a day-only date stays a day.
Deadlines, planned publication, scheduled publication, exact appointments and
production due dates can move, each saved through the record that owns the date
(never by editing the rectangle); published dates, task due dates and shared
interviews cannot. The host says which kinds the reader may pick up and the
server stays authoritative. A move shows at once, is undoable from the toast,
and a scheduled publication asks for confirmation first. Without `reschedule`
(WordPress today) the Calendar is read-only. Drag is pointer-only: the date
fields on the story, appointment and production forms remain the keyboard and
touch path. Schedule-X's own modal is not used either.

The Calendar is shared (`packages/newsroom-screens/src/calendar`): WordPress and
the Payload newsroom mount one `NewsroomCalendar`. A host supplies the schedule
feed, the `CalendarLinks` an item opens, optional client navigation, and where
view/filter preferences live (WordPress: localStorage, through
`planning/calendar-host.tsx`; Payload: Payload Preferences). The date, the
filters and the view belong to one `CalendarWorkspace` store, so a contextual
sidebar and a Filters sheet read the same state as the toolbar.

Flow: the protected schedule feed → TanStack Query → one adapter
(`schedule-x-adapter.ts`) → `eventsService.set`. Schedule-X never fetches.
The Byline toolbar (Today, previous/next, view, Filters) and the mini calendar
drive it through a small controller plugin (`setDate`, `step`, `today`,
`setView`).

Date rules, all tested (including DST):

- exact appointment: `ZonedDateTime` in the **newsroom timezone** (the WordPress site timezone in WordPress);
- story deadline, production due date, task due date: `PlainDate` (the stored
  time on production and tasks is a placeholder);
- planned publication: a `PlainDate` unless it carries a real time; the noon the
  picker stores for a day-only choice (`T12:00`, or the instant for noon in the
  newsroom timezone) counts as a day;
- scheduled and published dates: `ZonedDateTime`;
- a fuzzy appointment window is **never** an event. It is listed under
  **Needs scheduling**, whose **Schedule** link opens that appointment's own
  editor in the workspace (`story=<id>&appointment=<uuid>`).

Six fixed categories (appointment, story-deadline, production,
planned-publication, publication, task-deadline) each carry an icon and a
label, so colour is never the only signal. Clicking an event opens Story Peek;
the agenda rows also offer Edit appointment. On narrow screens Schedule-X's own
responsive rules switch to the month agenda (view order in the config decides the
fallback). Its theme tokens are mapped onto Nova's inside `.byline-ui-root`, and
its own header is hidden (`.sx__calendar-header`) because the toolbar is Byline's.
Schedule-X sets the Week/Day grid heights on `<html>` while its theme declares
them `0` on `:root`; scoped to `.byline-ui-root` that blanked the grids, so
`calendar/calendar.css` makes them `inherit`.

## Other destinations

Media Desk is the shared `MediaWork` screen (`packages/newsroom-screens/src/media`):
a table of assignments with inline status, assignee and due date,
a Files popover built on `Attachment`, and a menu. WordPress passes its Media
Library as the `MediaPicker` and keeps its page header. Its search uses
`InputGroup`, matching the Stories toolbar. Its inline edits are optimistic,
and every assignment row also has a right-click menu for Quick view, Workspace
and status changes.

Collections own reporting coordination and an optional public coverage presentation.
The shared workspace has Overview, Stories, Reporting, Tasks, Resources and
Public; Activity is host-capability dependent (off in Payload). Public controls
live in their own section, separate from the private brief and reporting.
Creation requires a name and type. In Payload, Collections is its own
`/admin/collections` destination, with an open project, section and interview
in the query. A wide open workspace gets the global rail plus Collection
switcher; narrow screens offer Switch collection in a Sheet. Tabs scroll within
their strip on phones. Calendar remains the existing destination, scoped with
`?collectionId=`. See [Collections workspace](collections-workspace.md) for the
implemented Payload schema, shell, permissions and public projection, and
[Collections](collections.md) for WordPress persistence and legacy compatibility.

Feedback is an inbox-like `ItemGroup`, not a grid of cards: each note is one
scannable item with its status action attached. Status changes are optimistic
and reversible from the toast, and the row context menu exposes the same triage
actions without hunting for controls. Content Health issues likewise expose
Quick view, Fix and Recheck from their native context menu. Its line Tabs expose
Issues grouped by check, Stories and Ignored; the scanner stores durable results
and reports full-scan progress. See [Content Health](content-health.md). Pending actions use the shared
`Spinner` when the wait itself needs to be visible.

These choices follow the component semantics rather than using Cards as a
generic container: `Item` is for content + description + actions, `Field`
is for form controls, and `Card` is reserved for a distinct grouped object or
section. All secondary destinations share `PageHeader` and `ResourceGate`:
a skeleton, then either the content or a plain message with *Try again*.

## Verifying

`wordpress-plugin/tests/fixtures/seed-planning-newsroom.php` seeds a realistic
newsroom (19 stories across the stages, a five-writer story, an unassigned one,
overdue and undated ones, photo work, a story scheduled in WordPress, exact and
fuzzy appointments). Run it with `wp-env run cli … wp eval-file`. The E2E specs
are `planning.spec.ts` and `planning-destinations.spec.ts`.
