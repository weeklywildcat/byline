# Byline Home

Open **Planning → Today** or **Byline → Home** to start newsroom work. WordPress
owns the stories, accounts, permissions, tasks, media requests and activity.
Home is a custom React application, independent of the public site.

## Daily work

Today is an editor's morning desk. It is organized around questions instead of
the storage type behind each piece of work, one Card per question:

1. **This week — what is on the calendar?** Seven site days, Sunday to Saturday
   in the newsroom timezone (`weekAgenda` in `newsroom-model.ts`). Each day shows
   its story deadlines, planned publication targets, actual schedules and the
   reader's confirmed exact appointments, with the calendar's fixed category
   icons (publication `CalendarCheck`, deadline `Flag`, appointment `Mic`, photo
   shoot `Camera`); hue only repeats the icon. A weekday from today on with
   nothing planned or scheduled to publish says **Nothing planned** in the one
   warning color and offers **Plan a story** (New story). Ordinary task and
   production due dates stay in My Work instead of appearing twice. A schedule
   takes precedence over a planned target on the same site day. Previous/next
   move whole weeks; a legend row counts what is already planned next week.
   When Home is too narrow for seven readable columns the strip scrolls
   sideways and opens on today.
2. **My Work — what do I need to do?** One personal queue combines assigned
   tasks, reviews an editor can act on, reporting appointments that need
   scheduling, the signed-in user's production assignments, missed personal
   story deadlines, and urgent unassigned production that needs an editor.
   Underlying objects stay separate — a production assignment does not become a
   task — but Today normalizes their urgency into **Needs attention**, **Today**,
   **Tomorrow**, **This week**, and **Later**, each with its count. Overdue work
   and urgent blockers lead; nonurgent scheduling reminders cannot outrank
   already overdue work. Due dates are right-aligned and overdue ones use the
   warning color; an appointment still needing a time carries a reporting
   **Needs scheduling** badge. The first ten rows are shown and **View all
   work** opens the rest of the bounded feed. Ordinary task completion/editing
   still uses the canonical task APIs and optimistic rollback. My Work is always
   personal.
3. **Desk — where do stories stand?** A stacked bar and a Stage · Stories · Last
   change table of active stories by workflow stage, in workflow order and
   colored by the workflow badge spec. Each stage links to Stories filtered to
   it. The planning feed carries no time-in-stage, so the age is days since the
   least recently changed story in the stage last changed; Reporting over seven
   days and Editing over five use the warning color.
4. **Site — is the public site healthy?** The website's publication state
   (where the host reports deployments), the next real schedule in the agenda,
   and content-health warnings linking to Content health. A failed publication
   remains a page-level alert as well.
5. **Budget — what publishes when?** A table (stacked rows on a narrow Home) with
   three tabs: **This week** (planned or scheduled this site week),
   **My stories** (the reader's active stories: canonical co-writers, assigned
   editors and the legacy primary author) and **Unscheduled** (active stories
   with no planned or scheduled publication). Rows show section, people,
   workflow, art (`productionSignal`) and the publication date, or its overdue
   days; they open Story Peek and keep the Stories List's hover preview and
   context menu. Published and dropped stories are excluded.

Editors get a **Mine | Newsroom** toggle (default Newsroom). It scopes This
week, Desk and Budget — Mine is the reader's own stories — and is remembered
per reader where the host keeps preferences: Payload Preferences
(`byline:home:preferences:v1`) in the newsroom, this browser in WordPress.
Writers always see their own stories.

Ready-for-review work, production assignments and interview scheduling do not
create separate Today cards. They appear in **My Work** with enough story/type
context to explain why each row is present. Editors do not inherit every
colleague's ordinary production assignment merely because they can review the
newsroom; they see their own production work plus urgent unassigned production
that genuinely needs an editor.

Serious system problems are not mixed into personal editorial work. A failed
website publication or critical publishing-health check appears as a page-level
alert with its direct action. Informational **Recent Activity** is no longer a
Today section; story activity remains available in Story Peek/Workspace, and a
future Inbox can own newsroom updates without diluting the daily work queue.

### Layout

In the Payload newsroom Home's canvas is `bg-muted`, set on Home's `main` only,
so the white sidebar, header and Cards separate clearly; WordPress keeps
wp-admin's own canvas. Every section is a Nova `Card` 20px apart: a muted Lucide
icon, a title and description, and the section's action in the header, with no
header fill. Top to bottom: the page header (Today, the site date and ISO week,
the scope toggle), **This week** full width, then **My Work** beside **Desk**
above **Site** (7fr/4fr) once Home's container is at least 960px wide — a
tablet in either orientation stacks them — then **Budget** full width, then the
timezone line and Refresh. Hosts without Desk or Site data simply omit those
cards. Empty states use the compact Nova Empty treatment and group headings
render only when that group contains work.

Rows are continuous with quiet top separators (`border-border/50`), subtle hover
and plain group headings with a count; cards whose list continues end in a
muted footer. Story and task headlines remain prominent and clamp at two lines.
Real profile photos appear where available; missing photos render no
placeholder. Overdue dates retain warning text and color.

Wide task rows still align title/story context beside assignee, priority and
due-date controls. A container breakpoint moves those controls below the title
when a row becomes narrow, and a narrow row leaves out the assignee (always the
reader in My Work; Edit still changes it). Shared rows opt into this density
only on Today, so Story Peek and Collections retain their existing layouts.

### Newsroom shell

The Payload newsroom's sidebar shows the Weekly Wildcat logo (the paw alone
when collapsed to icons), open-work counts on Stories, Media and Collections and
a **Saved views** group (Ready for review, Unassigned, Art needed — built-in
Stories views) with counts, from `GET /api/byline/navigation-counts`, read as
the signed-in user. A Stories address names its filters (`workflow=`,
`needs_review=1`, `visual_status=`…, see `storiesHref` and
`storiesRouteFilters`), so these links and Home's open Stories already filtered.
The header shows "N online" beside newsroom presence.

All dates use the WordPress site timezone, including fixed UTC offsets. A
date-only story deadline remains a calendar date, independent of the browser's
timezone. Internal deadlines, editorial publication targets and actual WordPress
schedules remain independent values.

## Inspect, find and create

Story rows open a right-hand **Story Peek**. On a phone it fills the viewport.
The peek contains workflow, sections, canonical contributors, dates, open tasks,
structured visual needs, private links and recent activity. It never renders
the article body. **Edit article** or **Review article** opens Gutenberg;
**Preview** opens the existing protected preview link.

Editors can change deadline and planned target with a Calendar in a Popover.
Workflow and contributor changes use the existing editorial endpoints and
revision checks. Writers use a multiple Combobox with chips. The task assignee
uses a single Combobox and the canonical assignable-user roster.

**Cmd/Ctrl+K** opens the Home command menu. It searches authorized active story
titles, shows recent active stories and provides New story, New task, Upload
media, Stories and Calendar actions when permitted. It takes precedence over
WordPress's global shortcut on this screen. Escape closes the current overlay.
Closing Story Peek returns focus to its originating row. Completing a task moves
keyboard focus to the next useful control. Failures restore the task and show
an error. Successful instantaneous edits do not create a stream of save toasts.

**New story** requires only a title and creates a real WordPress draft owned by
the current user. Success opens its peek. **New task** creates a canonical
story-linked task; it is intentionally not a new Tasks product.

## Private resource links

A story can have up to 24 manually supplied links. Each contains a generated ID,
a label of at most 120 characters, an HTTP(S) URL of at most 2048 characters,
and a derived kind. Exact Google Docs/Drive hosts and known path prefixes map
to Google Doc, Google Sheet, Google Slides, Drive folder or Drive file. Other
hosts are External link. URLs with embedded credentials or control characters
are rejected. Labels are sanitized as plain text.

The links are private `_byline_story_resources` post metadata with
`show_in_rest: false`. Every read/write requires `edit_post` on the story.
Add/remove operations compare the previous metadata value and report conflicts
instead of blindly replacing a colleague's list. Links are opened with
`noopener noreferrer`. There is no Google API, OAuth, remote preview fetch or
synchronization. Ordinary WordPress database backups include the metadata.

## Protected read models and mutations

| Route beneath `/byline/v1` | Purpose / boundary |
| --- | --- |
| `GET /editorial/home` | Bounded projection for the authenticated `edit_posts` user |
| `GET /editorial/home/search?query=…` | Title-only search; `edit_posts` plus story object checks |
| `POST /editorial/stories` | Create one WordPress draft; post type's `create_posts` capability |
| `GET /editorial/stories/<id>/workspace` | The flat read model Story Peek and the workspace share (the old `…/quick-view` aggregate remains only as a protected compatibility route) |
| `POST /editorial/stories/<id>/resources` | Add a sanitized private link; `edit_post` |
| `DELETE /editorial/stories/<id>/resources/<resource>` | Remove one link; `edit_post` |

Tasks, workflow, contributors and media continue to mutate through their
canonical domain endpoints. Home uses WordPress `apiFetch` with the existing
cookie session and REST nonce. It creates no database, authentication system,
planning record or duplicate editorial field. Responses contain summaries,
not article bodies.

The story candidates are bounded: 120 personal records and, for editors,
80 deadlines, 40 planned targets, 40 schedules, 40 review stories and 80 visual
requests. The collection deduplicates those IDs and applies object capabilities
and canonical membership. Up to 200 visible task-linked stories can supplement
the set. The exposed limit is 600 stories, 200 assigned tasks, 100 visual
requests and ten activity records. Search checks at most 60 title matches and
returns at most 20 visible results. Home is a prioritized bounded view, not a
complete newsroom export. Open Stories or Calendar for broader planning.

Tasks apply assignment/state filters before the result limit. Open counts for
Home's visible story IDs use one grouped task-domain query, including legacy
story links. No client-side per-story request waterfall is used. Tasks, stories,
visuals and activity have separate safe error fields. System checks use
independent queries. A failed optional service cannot suppress assigned work or
produce a misleading all-clear message.

## Nova, React and WordPress isolation

`wordpress-plugin/components.json` selects **shadcn base-nova** (neutral, Lucide,
Tailwind 4, Base UI) and generates into the shared `packages/newsroom-ui`
(`@byline/newsroom-ui`), which the Payload newsroom also uses. `ui/` holds the
generated Nova components (MIT); the only local change is that overlays portal
into the `.byline-ui-root` container (`lib/portal.ts`). `components/` holds only
CMS-independent Byline compositions over them:
`PeopleAvatars` (nobody, one `Avatar`, an `AvatarGroup`, or three plus an
`AvatarGroupCount` "+N"), `PersonAvatar`, form-field wiring and the status badges. The WordPress-bound
writer/assignee/date pickers and resource icon live in the plugin
(`src/editorial/pickers.tsx`, `src/workspace/resource-icon.tsx`). There are no
visual-system wrappers: sections are `Card`, rows are `Item` (a Media Library file
is an `Attachment`; an external link is an `Item` anchor), story facts are
horizontal `Field`s, a schedule mode is a `RadioGroup` choice card, a target
window is one range `Calendar` in a `Popover`, empty states are `Empty`,
overflow actions are `DropdownMenu`, and destructive confirmations are
`AlertDialog`. To update a primitive, regenerate it with the shadcn CLI
(it needs `@/*` aliases in `tsconfig.json` and `components.json` while it runs;
revert them and rewrite the generated `@/` and `"cn"` imports to relative ones)
and re-apply the portal change; do not restyle it by hand.
`@byline/newsroom-ui/styles.css` is the one stylesheet: Nova's neutral tokens
(black primary, plus one `warning` token),
WordPress resets and overlay stacking. Layout is Tailwind utilities on the
components, so `home/style.css` and `workspace/style.css` only import it.

Home has a separate webpack entry and a private React 19 runtime. Supported
WordPress installations can still supply React 18 to their own screens. Home
does not replace that runtime, pass React elements across runtimes or load on
Gutenberg. Its only external dependency is WordPress `wp-api-fetch`.

Only Home routes enqueue `home.js` and `style-home.css` (the Story Workspace and [Planning](stories-planning-ui.md) enqueue their own bundles the same way). Story Peek lives in `src/story/` and is shared with Planning. Tailwind 4 imports its
theme and utilities **without Preflight**. The Home-only PostCSS pass prefixes
all selectors with `.byline-ui-root`, scopes generated theme selectors and
renames animation keyframes. Utility rules leave their cascade layer so they
can outrank wp-admin's unlayered form rules within that root. All dialog,
popover, combobox and tooltip portals remain inside the same root. Theme
variables, scoped compatibility resets and reduced-motion rules do not alter
WordPress's sidebar, toolbar or editor. Core admin notices have a marker outside
React, so WordPress can relocate notices without editing the Home header.

## Interaction research

Reviewed against the current official product documentation on 2026-10-20:

- [Linear My Issues](https://linear.app/docs/my-issues),
  [Inbox](https://linear.app/docs/inbox), and
  [Search](https://linear.app/docs/search): curated assigned work, separate
  notifications, compact metadata and keyboard commands.
- [Asana My Tasks](https://help.asana.com/s/article/my-tasks): assigned work
  arrives automatically; simple urgency groups help staff decide what to do.
- [Notion database layouts](https://www.notion.com/help/layouts): keep important
  properties near the top and inspect an object while retaining list context.
- [Kordiam Story Card](https://support.kordiam.io/hc/en-us/articles/25143941264412-New-Story-Card),
  [Task Management](https://kordiam.io/task-management), and
  [Story List](https://kordiam.io/blog/master-your-content-flow-with-story-list):
  tasks and visual assignments remain connected to their story and publication
  plan. Home adopts these interaction principles without cloning a product.

## Validation

Run the normal repository checks and packaging checks. Focused Home coverage is
in `src/home/newsroom-model.test.ts`, `tests/home-resources-regression.php`,
`tests/integration/home.php`, `tests/e2e/home.spec.ts` and
`tests/e2e/today-density.spec.ts`. The density spec checks actual row geometry,
loaded profile photos, contiguous separators, the task drawer, inline editors,
the week strip, Desk, Budget tabs and keyboard opening at desktop and phone
widths. Set `BYLINE_E2E_PROFILE_PHOTO`
to a local PNG to use a headshot in visual captures; CI uses a small image fixture.

```sh
npm run typecheck:plugin
npm run test:plugin
npm run test:php
npm run build:plugin
npx wp-env start --config=.wp-env.json
npx wp-env run cli --config=.wp-env.json wp eval-file wp-content/plugins/wordpress-plugin/tests/integration/home.php
npx playwright test --config=wordpress-plugin/e2e/playwright.config.ts home.spec.ts
```

If port 8888 is occupied, use `WP_ENV_PORT=8898` with wp-env and
`WP_BASE_URL=http://localhost:8898` with Playwright. The browser suite uses real
WordPress authentication and capabilities, draft creation, completion/rollback,
link mutations, peek focus return, command search and Gutenberg navigation.
It writes realistic editor screenshots at 1440, 1280, 1024, 768 and 390 pixels,
phone/desktop peek screenshots and a writer view to `/tmp/byline-home-qa/`.
It also checks overflow and an independently failed activity service.
