# Content Health

Content Health is maintenance triage for **published stories**. Draft readiness,
assignments, interviews and deadlines belong to the existing editorial workflow.
The checks are deliberately narrow; there is no health score or publishing gate.

Issues groups current occurrences by a stable check key. Stories provides the
inverse view, and Ignored retains intentional findings with restore controls.
Search, severity, category, finding state and selected view use `health-*` URL
parameters. Rows use Base Nova Item, Collapsible, line Tabs and the existing
StoryHoverCard/StoryPeek host. Fix still uses the validated structured Gutenberg
block, featured-image or Story sidebar locator; no ephemeral client ID is stored.

## Persistence and scanning

`_byline_content_health_snapshot` stores each story's latest completed scan in
post meta. Occurrence `id` includes the story/check identity (and URL hash for a
link); `checkId`/`type`, category, severity and state are separate fields. Check
metadata lives in `byline_content_health_definitions()`. Categories are currently
Links and Images & accessibility, reflecting only checks that actually run.
Missing featured images suppress dependent alt/credit checks. Successful URLs
produce no active finding. URL HTTP responses remain short-lived transients.

Consecutive scans label active findings New or Existing. Disappearing findings
leave a bounded 200-identity resolution history so later recurrence is Regressed.
Ignored check state is independent post meta (`_byline_content_health_ignored`),
with actor, time and optional reason. Managers can disable/enable a check globally;
that state lives in `byline_content_health_disabled_checks`. Neither ignored nor
disabled findings contribute to active totals. Scans still evaluate disabled
checks so restoring one can show the latest result.

Run scan starts or resumes a complete generation, with an upper story ID, keyset
cursor, eligible count, successful count, failure count and completion timestamp
in `byline_content_health_full_scan`. Each cron continuation scans one story;
requests do not scan the whole publication. A daily event starts the next full
generation. WP-Cron continuations advance independently of the browser; normal
WordPress cron traffic (or a host cron runner) is required. A short worker lock
prevents duplicate workers. Interrupted workers resume after lock expiry.

Each story checks at most 25 unique URLs from the first 100,000 content characters,
with the existing safe HTTP/DNS/private-address guard and bounded responses. HTTP
requests have a one-second timeout. These limits keep a worker bounded; checks
are advisory, and transient network failures should be rechecked before editing.

The queue reads durable results for all eligible published stories, with object
capability checks. It never crawls on page load. Missing snapshots, changed stories,
failed scans or a full-scan timestamp older than a day mark results outdated.
Totals distinguish durable snapshots from the current full-scan progress. The UI
polls only while a full generation is running. A failed generation never claims a
successful full-scan timestamp.

## Protected operations

All routes use `/byline/v1/admin/content-health`:

- `GET /`: current active/ignored findings, definitions and freshness/progress.
- `POST /scan`: initiate/resume the full scan; requires editorial management.
- `POST /story/:id/recheck`: scan one published story; checks object capability.
- `POST /disposition`: ignore/restore a check for a story, or disable/enable it
  globally (manager only). Global disabling uses an explicit confirmation dialog.

The older numeric story recheck aliases remain compatible. Arbitrary occurrence
strings are never used as story route IDs. Rechecks invalidate the shared query
and update triage in place, with Sonner success/failure messages.

`tests/integration/content-health.php` exercises actual WordPress REST, meta and
keyset scanning for more than 25 stories. Backend regression coverage tests URL safety, dependency suppression, durable
state transitions, permissions, ignores and full progress beyond 25 stories.
The Planning browser suite covers the triage workflows and responsive widths
1440, 1280, 1024, 768 and 390 pixels.
