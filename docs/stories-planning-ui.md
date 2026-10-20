# Stories and Planning on Nova

Planning (Stories, Calendar, Media Desk, Coverage, Performance, Content Health,
Feedback) is the third screen of the newsroom workflow UI, built on the same
stack as [Home](byline-home.md) and the [Story Workspace](story-workspace.md):
React 19, TypeScript, TanStack Query, Tailwind 4, shadcn base-nova on Base UI,
Lucide, and WordPress `apiFetch`. There is one design system, one quick view of
a story, and one full detail page.

| Level | Component | Purpose |
| --- | --- | --- |
| Collection | Stories (Board, List, Calendar), Media Desk, Coverage… | See many stories |
| Inspect | `StoryPeek` (`src/story/StoryPeek.tsx`) | Quick context, from any row, card or event |
| Coordinate | `StoryWorkspace` (`?page=byline-planning&story=<id>`) | Reporting, tasks, production, links |
| Write | Gutenberg | The article |

A test (`tests-js/story-peek-single.test.ts`) pins that there is exactly one
`StoryPeek` implementation and no Planning quick view.

## Bundles and routing

| Address | Bundle (private React 19) |
| --- | --- |
| `page=byline-planning` (Today) | `home` |
| `page=byline-planning&tab=stories\|calendar\|media\|coverage\|performance\|content-health\|feedback` | `planning` |
| `page=byline-planning&story=<id>` | `story-workspace` |
| Settings, Newsletters | `index` (WordPress React; out of scope here) |

`planning` externalizes only `wp-api-fetch` and `wp-i18n`. `@wordpress/i18n` has
no React coupling, so the existing `__()` strings stay translatable
(`wp_set_script_translations` is registered for the handle). `scripts/package-plugin.sh`
fails the release if the planning manifest ever lists a WordPress React or
component handle.

Everything mounts in `.byline-ui-root` through `AdminRoot` (portals, tooltips,
toasts). `src/planning/style.css` imports the shared `admin-ui.css` and the
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

Board, List and Calendar are `Tabs` because they are alternate presentations of
one filtered collection. The address always names the view
(`&tab=stories&view=board|list|calendar`); changing a tab uses `pushState`, Back
works, and a reload restores it. The sidebar's Calendar entry opens Stories on
Calendar, and a bare Stories link restores the last view (`byline:stories-view`).

The toolbar is search, Workflow, Writer and Editor plus **More filters**
(WordPress state, visual status, date ranges, Mine, Unassigned, Overdue, Needs
review). Anything set behind More filters shows as a removable chip. **Saved
views** are one menu (All stories, My stories, your views, Save current view…,
Manage views…); saving and renaming use a Dialog, and deleting is reversible so
it happens at once with an **Undo** toast.

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

### List

A native shadcn `Table` with seven columns (Story, Workflow, People, Deadline,
Publication, Work, Updated) and the existing sort; below about 820px of
available width it becomes compact rows. TanStack Table is not used: nothing
here needs column visibility, multi-sort, selection or pagination.

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
`InputGroup`, matching the Stories toolbar. Coverage keeps a `Card` per
coverage package because each package is a standalone object with its own
stories and controls. Feedback is an inbox-like `ItemGroup`, not a grid of
cards: each note is one scannable item with its status action attached.
Performance uses Cards for metrics and titled sections, while Content Health is
an `ItemGroup` queue with severity and fix actions. Pending actions use the
shared `Spinner` when the wait itself needs to be visible.

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
