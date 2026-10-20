# Byline Home

Open **Planning → Today** or **Byline → Home** to start newsroom work. WordPress
owns the stories, accounts, permissions, tasks, media requests and activity.
Home is a custom React application, independent of the public site.

## Daily work

- **Up Next** shows your visible open tasks. Overdue work comes first, followed
  by today, tomorrow, the next seven days, later work and undated work. Within
  each group, priority precedes the due time and stable task order. The first
  seven rows are shown; **View all work** opens the rest of the bounded result.
- **Coming Up** shows the next two weeks of commitments, initially six events.
  Tasks, story deadlines and visual assignments keep their distinct labels.
  A WordPress publication schedule takes precedence over a planned target on
  the same site day. Both values remain visible in story detail. Editors also
  see visible newsroom deadlines and publication events.
- **My Stories** includes canonical co-writers, assigned editors and the legacy
  primary author. Published and dropped stories are excluded. Six stories are
  shown, ordered by overdue status, deadline, planned target and recent activity.
- **Waiting for Me** summarizes overdue work and highlights a small number of
  missed story deadlines and visual assignments. Editors also see urgent
  unassigned visual work. Serious system failures are small links, shown only
  to accounts that can inspect the corresponding service.
- **Ready for Review** is shown only to accounts with `edit_others_posts`.
  **Photo & Visual Work** uses structured media requests; it is shown for an
  editor or when the current user has relevant work. No duplicate photo task or
  manual needs-photo flag is created.
- **Recent Activity** shows at most ten existing, authorized activity records.
  It has its own failure state and does not block assigned work.

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
| `GET /editorial/stories/<id>/quick-view` | Existing protected aggregate, extended with `homeContext` |
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
Tailwind 4, Base UI). `src/admin-ui/ui/` holds the generated Nova components
(MIT), shared by Home and the Story Workspace; the only local change is that
overlays portal into the `.byline-ui-root` container (`admin-ui/lib/portal.ts`).
`src/admin-ui/components/` holds the few Byline compositions over them (Panel,
ItemList, EmptyState, form fields, pickers). To update a primitive, regenerate it
with the shadcn CLI and re-apply the portal change; do not restyle it by hand.
Rows are `Item`, forms are `Field`, options are `Select`, empty states are
`Empty`. `src/admin-ui/admin-ui.css` is the one stylesheet: Nova's neutral tokens
(only `primary`/`ring` carry the Weekly Wildcat green, plus one `warning` token),
WordPress resets and overlay stacking. Layout is Tailwind utilities on the
components, so `home/style.css` and `workspace/style.css` only import it.

Home has a separate webpack entry and a private React 19 runtime. Supported
WordPress installations can still supply React 18 to their own screens. Home
does not replace that runtime, pass React elements across runtimes or load on
Gutenberg. Its only external dependency is WordPress `wp-api-fetch`.

Only Home routes enqueue `home.js` and `style-home.css` (the Story Workspace enqueues `style-story-workspace.css` the same way). Tailwind 4 imports its
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
`tests/integration/home.php` and `tests/e2e/home.spec.ts`.

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
