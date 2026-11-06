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
`planning-model.ts`, `calendar-model.ts` and `media-desk-model.ts`: React-free
transport and domain logic.

Server state is TanStack Query: `["byline","planning",filters]`,
`["byline","workspace",id]` (shared by Peek and the workspace),
`["byline","schedule",from,to,tasks]`, `["byline","media-desk"]`, and so on. Any
change to a story calls `invalidateStoryData`, so Home, Stories and the Calendar
agree. Selected view, open menus, drag state and form text stay local.

## Stories

`StoriesPage` lives in `@byline/newsroom-screens` and is shared by the WordPress
admin and the Payload newsroom. It knows no CMS: what only one host has arrives
as an optional capability. `renderCalendar` supplies the Calendar (WordPress
passes its Schedule-X `StoryCalendar`; Payload has none yet, so it offers Board
and List and never shows a Calendar tab), and `viewHref` supplies a view's
address (WordPress: `planning-routing.ts`; default: `view=` on the current
address).

Three controls, three questions:

- **Which story set?** The built-in views (`story-views.ts`: All stories, My
  stories, Ready for review, Overdue, Unassigned, Published, On hold) and the
  reader's saved views. A built-in view is active only while the filters match it
  exactly; a saved view stays selected while edited and reads as *modified*.
- **How is it presented?** Board | List (| Calendar), line `Tabs`. The address
  names the view (`view=board|list|calendar`, plus `&tab=stories` in WordPress);
  changing a tab uses `pushState`, Back works, and a reload restores it. The
  WordPress sidebar's Calendar entry opens Stories on Calendar, and a bare
  Stories link restores the last view (`byline:stories-view`).
- **How is it refined?** The toolbar: search, Workflow, Writer and Editor plus
  **More filters** (publication state, visual status, date ranges, Mine,
  Unassigned, Overdue, Needs review). Anything set behind More filters shows as
  a removable chip.

One controller (`useStoryViews` in `StoryViews.tsx`) owns the story set: the
built-in and saved views, Save, Rename, Update, Delete and its **Undo** toast,
and the dialogs, rendered once. `StoryViewsPicker` presents it as one menu
above the collection (`[All stories ▾]   Board  List`) with the same views,
Save current view… and Manage views…. Stories is one column beside the app
sidebar:

```
Stories
Track everything the newsroom is working on.

[ All stories ▾ ]             Board   List
[Search] [Workflow] [Writer] [Editor] [More filters]
actual Board/List
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

`@atlaskit/pragmatic-drag-and-drop` owns draggables, drop targets and
monitoring; `…-auto-scroll` scrolls the horizontal board and the window;
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

Board cards also use the same native shadcn `ContextMenu` as List rows. Right-click is an accelerator for Quick view, Workspace/article links and **Move to**; dragging, the visible three-dot menu and keyboard/touch paths remain first-class.

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
Drag-to-reschedule is **intentionally absent**: an interview, a deadline, a
production due date, a planned publication and a WordPress schedule are
different dates changed in different forms, and dragging a rectangle must not
change one by accident. Schedule-X's own modal is not used either.

Flow: the protected schedule feed → TanStack Query → one adapter
(`schedule-x-adapter.ts`) → `eventsService.set`. Schedule-X never fetches.
The Byline toolbar (Today, previous/next, view, Filters) drives it through a
small controller plugin.

Date rules, all tested (including DST):

- exact appointment: `ZonedDateTime` in the **WordPress site timezone**;
- story deadline, production due date, task due date: `PlainDate` (the stored
  time on production and tasks is a placeholder);
- planned publication: a `PlainDate` unless it carries a real time; the noon the
  picker stores for a day-only choice (`T12:00`, or the instant for noon in the
  site timezone) counts as a day;
- WordPress scheduled and published dates: `ZonedDateTime`;
- a fuzzy appointment window is **never** an event. It is listed under
  **Needs scheduling**, whose **Schedule** link opens that appointment's own
  editor in the workspace (`story=<id>&appointment=<uuid>`).

Six fixed categories (appointment, story-deadline, production,
planned-publication, wordpress-scheduled, task-deadline) each carry an icon and a
label, so colour is never the only signal. Clicking an event opens Story Peek;
the agenda rows also offer Edit appointment. On narrow screens Schedule-X's own
responsive rules switch to the month agenda (view order in the config decides the
fallback). Its theme tokens are mapped onto Nova's inside `.byline-ui-root`, and
its own header is hidden (`.sx__calendar-header`) because the toolbar is Byline's.

## Other destinations

Media Desk is a table of assignments with inline status, assignee and due date,
a Files popover built on `Attachment`, and a menu. Its search uses
`InputGroup`, matching the Stories toolbar. Its inline edits are optimistic,
and every assignment row also has a right-click menu for Quick view, Workspace
and status changes.

Collections own reporting coordination and an optional public coverage presentation.
The Overview keeps public controls behind a compact row and dialog. See
[Collections](collections.md) for persistence, migration and compatibility.

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
