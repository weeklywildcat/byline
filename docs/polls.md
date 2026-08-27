# Polls

WordPress is the authoritative CMS and datastore for Byline polls. Poll
definitions, answers, lifecycle, schedules, results, and individual vote records
all live in WordPress. Cloudflare remains the public runtime, but only as a thin
same-origin proxy; there is no Cloudflare D1 dependency.

```
WordPress
  byline_poll post type            question, lifecycle, schedule, ordered answers
  wp_*_byline_poll_votes           poll_id, option_id, voter_key, created_at
  /byline/v1/polls/*               public REST API
        ▲
        │  thin same-origin proxy (apps/web/src/worker.js)
        ▼
/api/polls/*                       relative, publication-agnostic
        ▲
        │
PollWidget                         static Next.js export
```

## What replaced what

The retired implementation kept a Cloudflare D1 database (`polls`,
`poll_options`, `poll_votes`) and reimplemented the whole poll domain twice: once
in `apps/web/src/worker.js` and once in `apps/web/lib/polls.ts`. Both copies ran
SQL, counted votes, evaluated open/closed state, and derived voter hashes. The
WordPress Polls screen was informational only.

Now WordPress owns all of it, the Worker owns none of it, and
`apps/web/lib/polls.ts` is a types-and-constants contract module.

## Content model

A poll is a `byline_poll` post.

| Field | Storage |
| --- | --- |
| Public poll id | `_byline_poll_id` post meta, minted once, never rewritten |
| Question | `post_title` |
| Answers | `_byline_poll_options` post meta: ordered `{id, label, position}` |
| Voting state | `_byline_poll_status` post meta: `draft`, `open`, `closed` |
| Opens / closes | `_byline_poll_opens_at` / `_byline_poll_closes_at`, UTC `Y-m-d H:i:s` |
| Created / modified | `post_date_gmt` / `post_modified_gmt` |
| Author | `post_author` |

Answers are structured post metadata rather than a second SQL table: they are a
small ordered list read and written as a unit, always alongside their poll.

### Identifiers

Poll and answer ids are opaque (`poll_ab12cd34`, `opt_ab12cd34`) and generated,
never derived from wording. Rewording an answer or reordering the list cannot
move a vote. Vote rows reference these ids, and the D1 import preserves the
legacy ids verbatim (`website-coverage`, `news`, `sports`, `features`) so
existing cookies and frontend references keep resolving.

### Lifecycle

The domain status is its own value, not a re-reading of `post_status`. WordPress's
lifecycle is used where it genuinely helps and nowhere else:

- an unpublished or trashed poll can never be open, whatever its meta says;
- a published poll is `draft`, `open`, or `closed` according to its meta;
- an `open` poll additionally has to be inside its window to accept votes.

`opens_at` is inclusive and `closes_at` is exclusive, matching the retired SQL.
Both are stored and compared in UTC, so a local wall clock is never compared
against a UTC value. The editor enters times in the site timezone and they are
converted on save.

### Active poll selection

Preserved behavior: a poll qualifies when its status is `open`, its post is
published, `opens_at <= now` if set, `closes_at > now` if set, and it has at
least one answer. The newest qualifying poll wins, ordered by `opens_at` when set
and otherwise by creation time. Exactly one poll is ever offered.

## Vote table

`{$wpdb->prefix}byline_poll_votes`, installed with `dbDelta`:

```sql
id         bigint(20) unsigned NOT NULL AUTO_INCREMENT
poll_id    varchar(64) NOT NULL
option_id  varchar(64) NOT NULL
voter_key  varchar(64) NOT NULL
created_at datetime NOT NULL
PRIMARY KEY  (id)
UNIQUE KEY poll_voter (poll_id,voter_key)
KEY poll (poll_id)
KEY poll_option (poll_id,option_id)
```

Votes are transactional rows, not posts and not postmeta. Column widths keep the
unique key at 512 bytes, inside the smallest historical InnoDB index limit.

Foreign keys are deliberately omitted — mixed engines and managed hosts make them
unreliable in WordPress — so referential correctness is enforced in application
code: a vote is only accepted for an answer that belongs to its poll, an answer
with votes cannot be removed, and the importer drops and reports vote rows it
cannot attach rather than orphaning them.

Schema installation runs on activation and on the first admin request after an
upgrade. It never runs from a public poll request: anonymous traffic cannot
trigger DDL. On multisite, `wp byline polls install-schema` installs it per site.

### Duplicate votes and concurrency

Duplicate protection is the unique key, never a read-then-write:

1. attempt the insert;
2. on failure, check whether the driver reported MySQL error 1062;
3. if so, return `409 Already voted.`; otherwise report a server error.

The error number is authoritative when reachable, and the textual fallback is
narrow (an explicit `1062` or a `Duplicate entry` message) rather than the
retired "anything mentioning a constraint" match, so an unrelated failure is
never reported to a voter as a duplicate.

## Anonymous voter identity

Unchanged from the retired implementation, and deliberately so:

```
signed anonymous voter cookie  ->  one-way voter key  ->  UNIQUE(poll_id, voter_key)
```

No login, email, name, or IP address is required. Only the derived key is
stored. The raw voter id, browser fingerprints, and full IP addresses are never
persisted.

This is casual duplicate-vote resistance, not identity verification. A determined
person can clear cookies and vote again. It is a newsroom opinion poll.

### Cookies

| Cookie | Purpose | Attributes |
| --- | --- | --- |
| `ww_voter_id` | signed opaque voter id | `HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=1y` |
| `ww_poll_voted_<pollId>` | this browser answered this poll | `Secure; SameSite=Lax; Path=/; Max-Age=1y` |

The names keep their historical `ww_` prefix. They are a public compatibility
contract; renaming them would make every existing visitor look like a first-time
voter. The "voted" marker is intentionally **not** `HttpOnly` because the poll
widget reads it client-side.

Signature format and key derivation are byte-compatible with the retired Worker:

```
cookie value = voterId + "." + base64url(HMAC-SHA256(secret, voterId))
voter_key    = base64url(SHA-256(secret + ":" + voterId))
```

### Cookies through the proxy

WordPress emits **host-agnostic** cookies — no `Domain` attribute — and the
Worker forwards them. Because the browser only ever talks to the publication
domain, a domain-less cookie binds to that host and the CMS hostname stays an
implementation detail.

The Worker hardens what it forwards rather than trusting it:

- only `ww_voter_id` and `ww_poll_voted_*` are forwarded in either direction;
  any other cookie the CMS sets (a login cookie, a session) is dropped, and any
  other cookie the publication sets never reaches the CMS;
- `Domain` is stripped, and `Path=/`, `Secure`, `SameSite=Lax` are enforced;
- `HttpOnly` and `Max-Age` pass through as WordPress set them, which is what
  keeps the voter cookie private and the voted marker readable.

On the WordPress side, poll cookies are sent as real repeated `Set-Cookie`
headers and deliberately not through `WP_REST_Response::header()`, which
comma-joins a repeated header — correct for most headers and wrong here, where
two cookies would reach the browser as one malformed value.
`byline_poll_issued_cookies()` records what a request issued so callers and tests
can see it without the list ever entering a response body.

## Signing secret

The secret is server-side only. It is never in `publication.json`, static build
data, browser configuration, a public REST response, or diagnostics.

Resolution order, most explicit first:

1. `BYLINE_POLL_COOKIE_SECRET` constant or environment variable;
2. `POLL_COOKIE_SECRET` (the retired Worker's name);
3. `VOTER_COOKIE_SECRET` (an older name);
4. an automatically generated, non-autoloaded `byline_poll_signing_secret`
   option.

The generated secret is created once, is stable across plugin upgrades, is not
regenerated per request, survives deactivation, and is per-site on multisite —
matching the per-site poll content it protects. `wp byline polls secret` reports
which source is active without printing the value.

### Migration compatibility

**This matters for the cutover.** The voter key derivation includes the secret,
so if WordPress signs with a different secret than the Worker used, every
migrated `voter_key` stops matching and returning visitors can vote again.

Before importing, put the retired Worker's `POLL_COOKIE_SECRET` in
`wp-config.php`:

```php
define( 'BYLINE_POLL_COOKIE_SECRET', 'the same value the Worker used' );
```

Confirm it with `wp byline polls secret`, which should report
`constant:BYLINE_POLL_COOKIE_SECRET`. A fresh publication with no history can
skip this and let the plugin generate its own secret.

## Public REST API

```
GET  /byline/v1/polls/active
POST /byline/v1/polls/vote
GET  /byline/v1/polls/{id}/results
```

All three are public. Every response carries `Cache-Control: no-store`: poll
endpoints are live state and must never be cached by the edge or the browser.

```json
{
  "id": "website-coverage",
  "question": "What should we cover more of next?",
  "options": [{ "id": "news", "label": "More school news", "votes": 42 }],
  "totalVotes": 96,
  "resultsAvailable": true
}
```

`POST /byline/v1/polls/vote` takes `{"pollId": "...", "optionId": "..."}` and
returns the poll on success. Errors return `{"error": "...", "poll": {...}}` with
the poll included when one is known. The user-facing messages are preserved:

| Status | Message |
| --- | --- |
| 400 | `Choose a poll option before voting.` |
| 400 | `That answer does not belong to this poll.` |
| 404 | `Poll is not open.` |
| 404 | `No active poll is available.` |
| 409 | `Already voted.` |
| 429 | `Too many poll requests. Try again shortly.` |
| 500 | `Poll voting is not configured yet.` |

Nothing depends on frontend validation: the poll must exist, the window is
evaluated server-side, and the answer must belong to that poll.

### Low-response privacy

Per-answer counts are withheld until `BYLINE_POLL_MIN_RESULTS_VOTES` (5)
responses. Below that, `resultsAvailable` is `false` and every `votes` is `0`,
while `totalVotes` still reports the true total so the client knows which state
it is in. The rule lives in the API, not only in the UI, so an unauthenticated
caller cannot skip the widget and read suppressed results. Editors always see
full results in WordPress.

### Abuse protection

Deliberately modest, and honest about it:

- identifiers are bounded (64 characters, `[A-Za-z0-9_-]`) and request bodies are
  capped at 2 KB;
- vote attempts are throttled per client in a 60-second window. The address is
  HMAC'd with the site's poll secret and the digest lives only in a short
  transient — no full IP address is ever stored;
- behind a proxy, define `BYLINE_POLL_TRUSTED_PROXY` so the forwarded address is
  used for bucketing. Without it every request buckets to the proxy's own
  address. The Worker forwards Cloudflare's `CF-Connecting-IP` (set at the edge,
  so not spoofable) and never passes on a browser-supplied `X-Forwarded-For`;
- edge rate-limiting rules on `/api/polls/*` are recommended and are deployment
  configuration, not code.

No browser fingerprinting is used.

## Cloudflare Worker

`apps/web/src/worker.js` proxies exactly two paths, each to one fixed upstream
route. There is no pattern that could forward an arbitrary `/api` path or an
attacker-chosen URL:

| Public | Upstream |
| --- | --- |
| `GET /api/polls/active` | `GET {cms}/wp-json/byline/v1/polls/active` |
| `POST /api/polls/vote` | `POST {cms}/wp-json/byline/v1/polls/vote` |

Everything else, including `/api/polls/results`, goes to the static asset
binding. The Worker preserves status, JSON body, request body, and content type;
forwards and hardens poll cookies; and sets `Cache-Control: no-store`. A network
failure or non-JSON upstream response becomes `502 Poll service is unavailable.`
so a CMS outage or WAF interstitial cannot leak through as poll state. No
permissive CORS header is added — the browser stays same-origin.

### CMS origin

The Worker needs no configuration. It reads `urls.cms` from
`/_byline/publication.json`, which every static export already publishes, and
memoises it. `BYLINE_CMS_URL` overrides it per deployment:

```bash
npx wrangler secret put BYLINE_CMS_URL
```

No CMS hostname appears in `PollWidget`, the Worker, or `wrangler.jsonc`.

Whichever source is used, it must be the canonical origin WordPress serves REST
from, with pretty permalinks enabled — the same `{cms}/wp-json/...` assumption
the publication build already makes. The proxy does not follow redirects: a
canonical-host or scheme redirect from the CMS surfaces as
`502 Poll service is unavailable.` rather than silently downgrading a `POST` to a
`GET`.

## Polls admin

Polls are the `byline_poll` post type's own top-level menu at position 28, gated
on the publication polls feature. The retired `admin.php?page=byline-polls` URL
redirects to the list table.

The list table shows Question, Status, Votes, and the voting window, with row
actions for Open / Close / Reopen, Duplicate, and Export CSV. Vote totals for the
page are read in one query.

The editor is server-rendered metaboxes, no JavaScript:

- **Answers** — order, label, and recorded votes per answer, plus blank rows to
  add more. An answer with votes shows as locked; clearing the text of a
  vote-free answer removes it. The poll's public id and post id are shown.
- **Voting** — Draft / Open / Closed, plus Opens and Closes in the site
  timezone. Empty Opens means immediately; empty Closes means no closing time.
- **Results** — total votes and per-answer counts and shares, a CSV export, and,
  for a user with the destructive capability, a confirmed reset.

Reordering is by editing the order numbers, which is why it needs no JavaScript
and cannot desynchronise from what is saved.

### Option edit safety

Once votes exist, rewording and reordering stay free. Removing an answer with
votes is refused: the answer is kept and the editor is told which ones survived.
Votes are never remapped onto a different answer. Permanently deleting a poll
deletes its votes with it rather than leaving rows nothing can resolve.

### Capabilities

Polls use a mapped capability family, so poll management never requires
`manage_options`:

```
edit_byline_poll / read_byline_poll / delete_byline_poll        (per poll)
edit_byline_polls / publish_byline_polls / delete_byline_polls  (and the
edit_others_ / delete_others_ / *_private_ / *_published_ variants)
```

Administrators and editors get the full family. Authors get the own-content
subset and, through `map_meta_cap`, cannot touch other people's polls. Viewing
and exporting results needs `edit_byline_polls`; resetting votes needs
`delete_others_byline_polls`. Public vote endpoints need no login.

### Export

`option,label,votes,percentage`, one row per answer. Voter keys are never
exported and never appear in the admin UI.

## Migrating from Cloudflare D1

The plugin never talks to Cloudflare. Export tooling lives in the repository so
no Cloudflare credential or API dependency ever ships to a WordPress install.

```
export D1 once  ->  JSON artifact  ->  import into WordPress  ->  verify  ->
cut the Worker over  ->  retire D1
```

### 1. Export

```bash
node scripts/export-d1-polls.mjs --database weekly-wildcat-polls --remote --out polls-export.json
```

It uses your already-authenticated `wrangler` and writes an artifact whose rows
mirror the D1 schema:

```json
{
  "schemaVersion": 1,
  "source": "cloudflare-d1:weekly-wildcat-polls",
  "exportedAt": "2026-08-27T12:00:00.000Z",
  "polls":   [{ "id": "...", "question": "...", "status": "...", "opens_at": null, "closes_at": null, "created_at": "..." }],
  "options": [{ "id": "...", "poll_id": "...", "label": "...", "position": 0 }],
  "votes":   [{ "id": "...", "poll_id": "...", "option_id": "...", "voter_key": "...", "created_at": "..." }]
}
```

### 2. Import

```bash
wp byline polls import polls-export.json --dry-run   # report only
wp byline polls import polls-export.json
```

The import preserves poll ids, answer ids, questions, statuses, schedules, voter
keys, and timestamps. An `open` or `closed` D1 poll becomes a published post; a
`draft` one becomes a WordPress draft. The domain status meta stays
authoritative either way.

Reruns are safe. A poll is matched by its preserved id and updated in place, and
re-importing a vote hits the unique key and is counted as already present. A
repeated import cannot duplicate a poll, duplicate a vote row, or inflate a
total.

### 3. Verify

```bash
wp byline polls verify polls-export.json
```

The report compares poll, answer, and vote counts plus per-poll vote totals
between source and destination, and reports anything the source contained that
could not be represented — for example a vote for an answer that no longer
exists. **Do not retire D1 until verification passes.**

### 4. Cut over

```
1. Deploy the WordPress plugin.               WordPress poll API is live; no traffic yet.
2. Export, import, verify.                    Historical data lands in WordPress.
3. Configure the secret.                      BYLINE_POLL_COOKIE_SECRET == the Worker's old value.
4. Deploy the new Worker.                     The single atomic switch: writes now go to WordPress.
5. Re-export, re-import, re-verify.           Backfills votes cast between steps 2 and 4.
6. Verify public voting on the live site.      Vote once; confirm the 409 on a second attempt.
7. Retire D1.
```

Step 4 is what avoids a dual-write window: the Worker is the only entry point, so
its deploy flips the datastore atomically and D1 stops receiving writes at that
instant. Steps 2-5 mean WordPress totals may lag by a few votes for the few
minutes between the bulk import and the cutover; the delta import in step 5
closes that gap, and step 5 is idempotent.

If you need a strictly zero-loss cutover instead, close the poll in D1 between
steps 2 and 4 (`UPDATE polls SET status = 'closed'`). Voting is then refused for
that window with the existing "Poll is not open." message rather than lagging.

### 5. Retire D1

Already done in this repository:

- `apps/web/migrations/0001_create_polls.sql` deleted;
- the `d1_databases` binding removed from `apps/web/wrangler.jsonc`;
- `POLLS_DB` and the `DB` fallback removed;
- the duplicated SQL and poll business logic removed from
  `apps/web/src/worker.js`;
- `apps/web/lib/polls.ts` reduced to the API contract;
- `apps/web/lib/voter-cookie.ts` reduced to the public cookie names.

Delete the D1 database itself only after verification passes and the live site
has been voting through WordPress.

## Feature flag

When the publication disables polls:

- the Polls menu does not register;
- `GET /byline/v1/polls/active` returns `404 No active poll is available.`;
- `POST /byline/v1/polls/vote` refuses votes with `404 Poll is not open.`;
- the homepage package does not render poll functionality.

Stored polls and vote history are kept. Disabling a module is not a delete.

## Static export guarantee

Nothing here adds a Next.js runtime requirement. The publication remains
`output: "export"`, and poll voting is served by the small Cloudflare Worker in
front of it. `npm run build:frontend` still ends in
`scripts/verify-static-export.mjs`, which fails if a server API directory appears
in the export.

## Tests

| Area | File |
| --- | --- |
| Content model, identity, lifecycle, selection, privacy | `wordpress-plugin/tests/poll-storage-regression.php` |
| REST, voting, duplicates, cookies, throttling | `wordpress-plugin/tests/poll-rest-regression.php` |
| Admin columns, actions, saves, export, reset | `wordpress-plugin/tests/poll-admin-regression.php` |
| D1 import, preservation, idempotency, verification | `wordpress-plugin/tests/poll-migration-regression.php` |
| Worker proxy, cookies, failure modes, no D1 | `apps/web/tests/poll-worker.test.ts` |
| PollWidget behavior | `apps/web/tests/poll-widget.test.tsx` |
| Cross-language contract | `apps/web/tests/poll-contract.test.ts` |
