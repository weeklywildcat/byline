# Byline newsroom OS

Byline keeps newsroom operations in WordPress and publishes a static, public
site. The editorial tools are designed to make planning, production, review,
distribution, and measurement visible without making private newsroom data
public.

## Operating model

- **Home / Today** is the personal starting page: one **My Work** queue unifies
  actionable tasks, review, reporting/scheduling and assigned production; **Coming
  Up** is reserved for real calendar commitments; **My Stories** keeps ownership
  context. System failures stay page-level instead of becoming editorial work.
  Story Peek preserves list context; Gutenberg remains the writing environment.
  See [Byline Home](byline-home.md) for the protected read model, private links,
  Nova components and validation.
- **Story Workspace** is the coordination page for one story: brief, writers and
  editor, a reporting plan (sources and appointments, including appointments whose
  exact time is not yet known), tasks, production assignments, resource links and
  activity. It sits around the canonical WordPress story and the Google Doc the
  team writes in; it replaces the shared tracking spreadsheet rather than the
  editor. See [Story Workspace](story-workspace.md).
- **Planning** is the daily queue: Stories Board/List, Calendar (story dates,
  appointments, production deadlines and a Needs Scheduling area), Media Desk
  (one row per production assignment), Coverage, Performance, Content Health,
  Feedback, and per-user saved views.
- **Editorial workflow** tracks pitch, assignment, reporting, writing, editing,
  ready for review, on hold, dropped, and derived published state. It is
  separate from WordPress `post_status`.
- **Collections** coordinate grouped reporting and optionally publish reader-facing coverage. The static `/coverage/`
  index links to each published `/coverage/<slug>/` page; coverage records and
  their linked stories are read from the public Byline API at build time.
- **Distribution and newsletters** are provider adapters. They compose from
  canonical stories and keep provider credentials and delivery state private.
- **Feedback, corrections, contributors, and content health** have dedicated
  editorial surfaces. Public responses contain only information intended for
  readers.

## Data and permissions

WordPress is the canonical datastore. Legacy `ww_*` post types, metadata, poll
cookies, and `/weekly-wildcat/v1/*` aliases remain compatibility contracts;
canonical Byline endpoints adapt them rather than creating a second source of
truth.

Public pages are static and may use optional build data for features that are
not installed. Editorial, planning, scheduling, analytics, health, feedback,
and integration endpoints are protected by WordPress capabilities and should
fail closed: an unauthenticated or unauthorized request must receive no
private records and must not mutate state.

## Publisher runbook

1. Open a story's workspace to see who still needs to be interviewed, what is
   scheduled, what is due and where the draft lives. Record an appointment as soon
   as someone is responsible, even if the date is only "next week".
2. Use Planning to filter the queue by workflow, editor, deadline, planned
   publication, coverage, or readiness. Treat the Calendar as the publication
   plan, not as a replacement for WordPress post status.
3. Review the fixed homepage after the static build. Story placement follows automatic selection rules, including the sticky lead.
4. Before a public launch, run readiness and Content Health checks, confirm
   media requests are resolved, and review corrections/notes and contributor
   attribution.
5. Use provider-specific test sends before sending a newsletter. A failed
   provider call must leave the issue retryable and must not expose API keys or
   subscriber data in logs or REST responses.
6. After publication, use Performance and provider reports as signals, not as
   replacements for editorial judgment. Investigate search gaps and broken
   links while preserving the public static export contract.

## Safety and operations

- Never expose admin nonces, deploy hooks, OAuth/Discord secrets, provider API
  keys, or private editorial metadata through public REST, static manifests, or
  client bundles.
- Keep CORS limited to the configured public site origin. Rate-limit public
  feedback and validate URLs before remote health checks.
- Keep scheduled jobs idempotent and lock-protected. Record external provider
  IDs before retrying a send, and make cancel/reschedule transitions explicit.
- Use feature detection for optional WordPress capabilities (including Notes)
  and render a clear unavailable state rather than guessing or writing a
  fallback field.
- Preserve static export settings (`output: "export"`) and verify generated
  routes, media mirrors, and the updater/plugin identifiers before release.
- Run the relevant TypeScript/PHP tests and a static build before deployment;
  inspect the generated Coverage index and at least one coverage detail page
  whenever coverage data or routing changes.
