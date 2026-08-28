# Byline newsroom OS

Byline keeps newsroom operations in WordPress and publishes a static, public
site. The editorial tools are designed to make planning, production, review,
distribution, and measurement visible without making private newsroom data
public.

## Operating model

- **Planning** is the daily queue: Stories Board/List, Calendar, Media Desk,
  Coverage, Performance, Content Health, Feedback, and per-user saved views.
- **Editorial workflow** tracks pitch, assignment, reporting, writing, editing,
  ready for review, on hold, dropped, and derived published state. It is
  separate from WordPress `post_status`.
- **Studio** owns shared homepage/design documents. Publishers can publish now
  or schedule a document, then reschedule, cancel, or rebase it when the live
  revision has changed.
- **Coverage** is a first-class public collection. The static `/coverage/`
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

Planned publication time is distinct from a story deadline and from
`post_date`. A schedule stores an immutable document snapshot, the base live
revision, an idempotency key, and its execution state. A revision conflict
requires an explicit rebase or cancellation; it must never silently publish a
stale snapshot.

## Publisher runbook

1. Use Planning to filter the queue by workflow, editor, deadline, planned
   publication, coverage, or readiness. Treat the Calendar as the publication
   plan, not as a replacement for WordPress post status.
2. In Studio, verify the document preview and current live revision. Schedule
   with the intended timezone and confirm the resulting status. If the live
   revision changes, inspect the diff and rebase deliberately before retrying.
3. Before a public launch, run readiness and Content Health checks, confirm
   media requests are resolved, and review corrections/notes and contributor
   attribution.
4. Use provider-specific test sends before sending a newsletter. A failed
   provider call must leave the issue retryable and must not expose API keys or
   subscriber data in logs or REST responses.
5. After publication, use Performance and provider reports as signals, not as
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
