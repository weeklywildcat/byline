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

Results are withheld entirely until `BYLINE_POLL_MIN_RESULTS_VOTES` (5)
responses -- not just the per-answer split. Below the threshold,
`resultsAvailable` is `false` and every count, including `totalVotes`, is
reported as `0`, so an unauthenticated caller cannot watch a small poll fill up
one vote at a time, or skip the widget and read the real total straight from the
API. `resultsAvailable` is the authoritative signal: `PollWidget` trusts it
outright rather than re-deriving visibility from a vote count, falling back to
comparing `totalVotes` against the threshold only when an older CMS omits the
field. Editors always see full, exact results in WordPress.

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

### Origin authentication

Not every CMS origin is anonymously reachable, and the Worker is the one client
of the WordPress poll routes -- so it is also the one place upstream credentials
belong. Two independent, optional mechanisms:

| Worker var/secret | Sends |
| --- | --- |
| `BYLINE_CMS_ACCESS_CLIENT_ID` + `BYLINE_CMS_ACCESS_CLIENT_SECRET` | `CF-Access-Client-Id` / `CF-Access-Client-Secret` -- a Cloudflare Access service token |
| `BYLINE_CMS_AUTH_HEADER` + `BYLINE_CMS_AUTH_VALUE` | one arbitrary header, for a gateway that is not Cloudflare Access (basic auth, a bearer token, a mesh header) |

Set them with `wrangler secret put`. Neither is required, and nothing in the
WordPress poll domain knows or cares which one, if either, is used -- the
Cloudflare Access pairing is the *Cloudflare adapter's* convenience, not a core
plugin dependency.

Credentials are built into every upstream request from Worker bindings alone,
never copied from the incoming request, so a browser cannot inject or forge one.
They are equally never copied onto the response the browser receives, even if
the CMS were to echo them back.

### Making the CMS poll routes non-public

The public REST routes (`/byline/v1/polls/*`) are reachable by design so the
Worker can proxy to them, but a deployment can additionally refuse to answer any
caller that is not the Worker. Set `BYLINE_POLL_PROXY_SECRET` on the Worker and
the matching `BYLINE_POLL_PROXY_SECRET` constant (or environment variable) in
WordPress, and every poll request without a matching `X-Byline-Poll-Proxy`
header is refused with `403`. This is off by default -- a publication that
serves poll routes straight from a reachable WordPress needs no secret -- and it
does not turn the routes into authenticated ones; it narrows who may call them.
Combine it with network-level restrictions (a firewall rule, a Cloudflare Access
policy on the CMS origin, or hosting the CMS off the public internet entirely)
for a deployment that wants the WordPress poll routes unreachable from arbitrary
public clients.

### Worker environment

| Variable | Purpose |
| --- | --- |
| `BYLINE_CMS_URL` | overrides the CMS origin discovered from the publication manifest |
| `BYLINE_CMS_ACCESS_CLIENT_ID` / `BYLINE_CMS_ACCESS_CLIENT_SECRET` | Cloudflare Access service token for a protected CMS origin |
| `BYLINE_CMS_AUTH_HEADER` / `BYLINE_CMS_AUTH_VALUE` | one arbitrary header for a non-Cloudflare protected origin |
| `BYLINE_POLL_PROXY_SECRET` | proves to WordPress that this Worker is the caller |
| `BYLINE_POLL_FREEZE_VOTES` | refuses `POST /api/polls/vote` with `503` without contacting WordPress; reads keep working |

None of these are ever read from a request, returned in a response, or written
to a static build artifact.

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

The strict, zero-loss production order:

```
1. Deploy the WordPress plugin.        WordPress poll API is live; no public traffic yet.
2. Set the OLD signing secret.         BYLINE_POLL_COOKIE_SECRET == the retired Worker's value.
3. Initial D1 export/import.           Historical data lands in WordPress.
4. Verify.
5. Freeze OLD D1 vote writes.          A deployment freeze, not a poll status change.
6. Final D1 delta export.
7. Import the delta (--votes-only).    Only vote rows; editorial state is left alone.
8. Verify.
9. Switch the Worker to WordPress.     BYLINE_POLL_FREEZE_VOTES cleared at the same time.
10. Smoke-test.                        Vote once; confirm the 409 on a second attempt.
11. Retire D1.
```

**The delta (steps 6-8) must land before the switch (step 9), not after.** A
voter whose last old-datastore vote is only in the final delta is unknown to
WordPress until that delta is imported. Switching first opens a window where
that voter can vote again in WordPress -- the delta import then absorbs their
old vote as a harmless-looking duplicate, silently hiding the double vote. See
`tests/poll-migration-cutover-regression.php`, which reproduces the race and
proves the correct order closes it.

**The write freeze (step 5) is a deployment mechanism, not a change to poll
state.** Do not use `UPDATE polls SET status = 'closed'` to stop writes: that
mutates domain data, and if the frozen source is later imported as a full
(non-delta) import, the mutated status would overwrite what an editor set in
WordPress. Options, in order of preference:

- take the old Worker offline, or point its route at a maintenance response;
- a Cloudflare (or equivalent) rule that returns `503` for `POST /api/polls/vote`
  against the old deployment;
- if neither is available, `BYLINE_POLL_FREEZE_VOTES` on the **new** Worker
  achieves the equivalent for the WordPress side of a brief overlap window --
  see [Worker environment](#worker-environment) below.

**Step 7 uses votes-only mode**, `wp byline polls import <delta> --votes-only`,
so the final handoff can only ever add vote rows. It cannot create a poll that
does not already exist in WordPress, and it cannot touch a poll's question,
answers, schedule, or status -- so anything the write freeze mutated at the
source, or anything an editor changed in WordPress since the initial import,
survives untouched. A delta vote for an answer WordPress no longer holds is
skipped and reported rather than resurrecting it.

### 5. Migration secret fail-safe

A `voter_key` is a one-way function of the signing secret, so importing vote
history while WordPress is on its automatically generated fallback secret would
silently produce keys that never match any cookie an existing visitor holds --
every one of them could vote again. `wp byline polls import` refuses this case
outright rather than relying on the documentation above being followed:

```
$ wp byline polls import polls-export.json
Error: This artifact contains 6 vote(s), but WordPress is using an automatically
generated poll signing secret. Imported voter keys would never match the
cookies existing visitors hold, so they could all vote again. Set the previous
poll signing secret in wp-config.php before importing: define(
'BYLINE_POLL_COOKIE_SECRET', '...' ); Confirm it with `wp byline polls secret`.
If this site has no voter continuity to preserve, re-run with
--allow-generated-secret.
```

The secret itself is never printed. A `--dry-run` is still permitted -- it is
read-only -- and reports the same warning so the counts can be checked before
the secret is configured. An artifact with no vote rows (poll definitions only)
is never blocked, since there is no continuity to lose. The check cannot prove
an *explicitly supplied* secret is the historically correct one; it only rules
out the one case it can be certain about. A brand-new publication with no
history to preserve passes `--allow-generated-secret` deliberately.

### 6. Retire D1

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
| WP-CLI schema guarantee, cutover order, votes-only delta safety | `wordpress-plugin/tests/poll-migration-cutover-regression.php` |
| Migration secret fail-safe | `wordpress-plugin/tests/poll-migration-secret-regression.php` |
| Worker proxy, cookies, failure modes, no D1 | `apps/web/tests/poll-worker.test.ts` |
| PollWidget behavior | `apps/web/tests/poll-widget.test.tsx` |
| Cross-language contract | `apps/web/tests/poll-contract.test.ts` |
