# @byline/newsroom-screens

Byline's newsroom screens and their models, independent of any CMS: Home,
Stories (Working, Published and All; Board and List in Working), the Calendar, Story Peek and hover cards, the Story
Workspace, the New story / task dialogs, the command palette, and the planning,
workspace, editorial and collection models they render.

They never fetch on their own. Each host passes **fetchers** that satisfy the
contracts in `home/home-api.ts` (`HomeFetchers`) and `story/story-fetchers.ts`
(`StoryFetchers`):

- the WordPress plugin builds them over `wp-api-fetch` (`createHomeFetchers`);
- the Payload newsroom builds them over its access-controlled endpoints
  (`apps/newsroom/src/ui/home/payload-fetchers.ts`).

Anything only one host has arrives as an optional **capability**, never an
import. `StoriesPage` takes `renderCalendar` (WordPress mounts the shared
Calendar there; without one Stories offers only Board and List and never shows
a Calendar tab) and `viewHref` (WordPress keeps its wp-admin addresses in
`planning-routing.ts`; the default sets a generic `view=` on the current
address).

The **Calendar** (`calendar/`) is Schedule-X with its shadcn theme behind one
adapter (`schedule-x-adapter.ts`), a controller bridging Schedule-X's signals
to Byline's toolbar and mini calendar (`calendar-controller.ts`), and one state
owner for the selected date, filters and view (`calendar-workspace.ts`,
provided with `CalendarWorkspaceProvider`). `NewsroomCalendar` is the schedule
surface; `CalendarControls` (sidebar-12's mini calendar and category list) is
rendered by the host wherever it fits, persistently or in a sheet, always over
the same workspace. Hosts supply the schedule feed (`getSchedule`), the
`CalendarLinks`, optional client `navigate`, and where preferences are kept
(`CalendarPreferenceStorage`). Its stylesheet, `calendar/calendar.css`, is
imported into each host's Nova stylesheet. Schedule-X and Temporal are this
package's dependencies.

**Media** (`media/`) is the Library (navigator, browser, inspector, upload,
picker, folder dialogs over `MediaLibraryFetchers`) and Work (`MediaWork`, the
production desk moved from the plugin; WordPress renders it as its Media
Desk). Hosts supply the fetchers, the `MediaPicker`, story links and optional
client `navigate`. See [docs/media-workspace.md](../../docs/media-workspace.md).

Styling is `@byline/newsroom-ui`. Each host's stylesheet must list this
package's `src` as a Tailwind `@source`.

Nothing here may import WordPress or Payload. Screens still in
`wordpress-plugin/src` (Collections, Content Health,
Feedback, the editor panels) move here as they are ported. Every module is a
package export; a moved module never leaves a duplicate implementation behind.

Tests for the shared modules live in `tests/` (`npm run test:newsroom-screens`,
part of `npm run test:packages`).
