# Byline durable jobs

The WordPress plugin now has a small durable job adapter for backend work that
must survive a missed WP-Cron request. New jobs are private `byline_job` posts:
the post content is a versioned JSON envelope and execution fields live in
separate post meta. Ordinary job payloads are immutable; the deployment
coalescer may replace a still-queued envelope with the newest expected
revision. The cron event carries only the numeric job ID. No existing post
type, option, or design-schedule record is migrated.

## Job contract

The stable public fields are `jobId`, `id`, `type`, `status`, `createdAt`,
`dueAt`, `startedAt`, `completedAt`, `attempts`, `maxAttempts`,
`retryDelay`, `nextAttemptAt`, `idempotencyKey`, `payloadHash`, `actorId`,
`lastActorId`, `lastError`, and safe lease/cancel/retry flags. The operational
statuses are:

- `queued`
- `running`
- `retry_waiting`
- `succeeded`
- `failed`
- `cancelled`

Enqueue is idempotent by `(type, idempotencyKey, payloadHash)`. A reused key
with a different payload is a conflict. Claims use an expiring lease; a stale
lease is recovered by the next runner. Retryable failures use bounded
exponential backoff, while manual retry requeues a failed or cancelled job
without changing its identity. Cancellation of a running job is cooperative.

Existing `byline_design_job` records are not rewritten. They are available in
the protected job listing through `byline:design-schedule:<id>` and retain the
design scheduler's immutable snapshot, lock, conflict, and reschedule rules.

## Deployment and revisions

Deployment requests use a durable `deployment` job. Existing generic-hook
options and both legacy deployment event names remain valid. The existing
`byline_publication_revision` option is the monotonic public build revision;
the deployment payload records the exact `expectedRevision`. The diagnostic
manifest compares that value with its `publicationRevision` and reports the
safe lifecycle `queued`, `building`, `live`, `failed`, `needs_configuration`,
or `unknown`.

### The revision a published site still owes

Every public change records the revision it needs deployed in
`byline_deployment_expected_revision` **before** anything is scheduled, and
independently of whether a deploy hook exists. Publishing on an install with no
deployment target therefore does not lose the expected revision: the lifecycle
becomes `needs_configuration`, the Distribution website channel reports
`needs_configuration`, and the article's post-publish panel says the website
update requires configuration and offers Retry once a target is set up.

The reachable-manifest fallback — treating any reachable manifest as live —
now applies only to installations that predate revision-aware deployment, that
is, only when there is no recorded expected revision at all. Every revision a
current Byline generates is recorded durably, so a reachable but stale manifest
can no longer be reported as Live.

### Manual retry

`POST /byline/v1/admin/deployment/trigger`, `wp byline deployment retry`, and
the Retry action in the article post-publish panel all call
`byline_retry_deployment()`, which:

- requeues an existing failed, cancelled, or backing-off deployment job through
  `byline_retry_job()`, keeping its attempts, actor, timestamps, and errors;
- returns an already queued or running job untouched, so repeated clicks cannot
  produce a second deploy request;
- otherwise creates a new tracked job for the revision the site owes, with its
  own `deployment:<revision>:manual-<n>` idempotency key;
- never sends a deploy-hook request itself. Execution belongs to the job runner,
  so REST, WP-Cron, and WP-CLI share one lifecycle.

The one remaining direct-request path is `byline_trigger_deployment()`, kept for
the pre-adapter legacy cron event and for installations without durable job
storage.

The legacy distribution `status` values remain unchanged, with
`needs_configuration` added. New consumers can use `deployment.lifecycle`,
`deployment.expectedRevision`, and the matching public-manifest fields without
exposing the deploy-hook URL.

## Running and health

The plugin registers a five-minute best-effort WP-Cron runner and a one-shot
job wake event. Protected WordPress REST routes are available under
`/byline/v1/admin/jobs`; when WP-CLI is available, the equivalent command is
`wp byline jobs run`, with `status`, `retry`, and `cancel` subcommands, plus
`wp byline deployment retry` and `wp byline deployment status`. Every path uses
the same lease-aware runner and omits payloads, lease tokens, and protected
configuration.

Diagnostics report status counts, overdue work, runner source, and whether
catch-up is recommended. Health marks overdue traffic-driven WP-Cron work and
disabled cron explicitly; an external authenticated or WP-CLI run records its
source for operators.

## Admin observability

The article post-publish panel and Byline Doctor surface the safe deployment
lifecycle, expected/public revision evidence, and cron catch-up health. A
dedicated jobs history table is intentionally not duplicated in Studio: the
protected `/byline/v1/admin/jobs` routes and `wp byline jobs` commands remain
the operator interface for detailed status, retry, cancel, and run actions.
