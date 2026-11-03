# Byline MCP inside WordPress

The Byline plugin serves its remote MCP endpoint at **`https://<your-cms>/mcp`**.
For Weekly Wildcat that is `https://cms.weeklywildcat.com/mcp`. The hostname is
an installation example, not a hard-coded default.

Install/update the normal Byline release ZIP. There is no separate MCP service,
Cloudflare Worker, KV namespace, Durable Object, Node process, deployment or
manual encryption-key configuration. Astro remains the static public build client.

## Setup

1. Update the installed Byline plugin with the complete release ZIP.
2. The CMS needs HTTPS, PHP **8.2+** and OpenSSL. WordPress must route normal
   permalinks through its front controller. No permalink flush is needed.
3. Connect your MCP client to your CMS URL followed by `/mcp`, using OAuth.
4. Sign in to WordPress and approve the named client. You act as that WordPress
   user, with their current permissions on every call.
5. Try “What needs attention in the newsroom today?”

Your **WordPress → Users → Profile → Byline MCP** section shows the endpoint and
lets you disconnect individual clients. Site settings, keys and auth storage are
created automatically. On older PHP the rest of Byline still works; the MCP
endpoint returns a clear unavailable response and the profile explains the requirement.

## Architecture

```text
MCP client → WordPress /mcp → PHP MCP SDK → typed newsroom adapter
                                            ↓ authenticated WordPress user
                                   rest_do_request(/byline/v1/...)
                                            ↓ normal permission callbacks
                                   existing Byline domain/storage
```

`wordpress-plugin/includes/mcp/` owns the runtime. The official `mcp/sdk` PHP
library handles the current **2026-07-28** protocol and older Streamable HTTP
handshake clients. `league/oauth2-server` handles authorization codes, S256 PKCE,
access tokens and rotating refresh tokens. The build locks and bundles these
libraries under the private `BylineMcpVendor` namespace to avoid other plugins’
dependency versions. End users do not install Composer or another plugin.

`packages/mcp-contracts/` is development-only: it owns the shared Zod schemas,
generated tool metadata, reference adapter and SDK tests. Its TypeScript is not
executed on the CMS. There is no second newsroom database, remote HTTP proxy,
shared administrator or MCP-specific role system. PHP adapters dispatch locally
through the same protected canonical REST routes and domain permissions.

## Authentication and revocation

- Public OAuth metadata is served at `/.well-known/oauth-authorization-server`
  and `/.well-known/oauth-protected-resource/mcp` relative to the CMS base URL.
- Dynamic registration at `/mcp/register` supports public clients with exact
  registered redirects, HTTPS web callbacks and loopback HTTP callbacks.
  It does not fetch client-supplied URLs or advertise CIMD support.
- `/mcp/authorize` uses the actual WordPress login and an explicit consent form.
  WordPress nonces bind consent to the user and complete OAuth request. Client
  names are self-reported, escaped and accompanied by the exact return address.
- The maintained OAuth library validates codes, redirect matching and PKCE.
  Only S256 is accepted. Five-minute codes are single-use; redemption and refresh
  rotation are serialized. Access tokens last 15 minutes, refresh tokens up to
  30 days, with a maximum connection lifetime of 30 days.
- JWT signatures, times, issuer, resource audience, active grant and current
  WordPress account permissions are checked on each request. A WordPress browser
  cookie alone never authorizes `/mcp`.
- No WordPress Application Password is created, stored or passed to a client.
  There is no upstream credential to copy or clean up. The WordPress-native
  login removes the need for the former Worker’s Application Password bridge.
- The plugin automatically generates signing/encryption keys and stores them
  encrypted using the installation’s WordPress salts. Back up the database and
  `wp-config.php` together. Keys never ship in the ZIP or public snapshots.
- `byline.disconnect`, `/mcp/revoke` and the owner’s WordPress profile disconnect
  invalidate the connection’s access and refresh tokens immediately. Other
  connections are unaffected. Password reset and account deletion revoke the
  user’s grants; capability removal takes effect on the next request.
- OAuth state, rate counters and compatibility handshake metadata live in a
  dedicated WordPress auth table. It contains no newsroom record copies.
  Expired entries are removed by an hourly WP Cron job. Modern MCP is stateless;
  older clients’ bounded compatibility state is scoped to their OAuth grant.

## Permissions, privacy and trust

Every route executes its ordinary WordPress/domain permission callback. Tool hiding only improves discovery; it is not authorization. The Worker obtains capability flags anew on each request, avoiding persistent role assumptions.

`story.get` reuses the canonical Workspace aggregate. Contributors, editors, photographers, task holders and reporting participants retain the existing visibility distinctions. Assignment-only participants receive only their assigned reporting/production/task records and no activity trail or Core Notes summary. Their canonical-field writes remain forbidden. Task mutations retain the existing task domain's stronger edit-story checks; seeing an assigned workspace task does not add a new permission to edit it.

Notes stay lazy and read-only under `edit_post`. Shared interview contact fields, WordPress profile/auth fields, article bodies by default, raw deploy configuration and arbitrary diagnostics are excluded by output projections. Public REST, RSS and Astro snapshot builders gain no MCP fields. Inputs have strict schemas; outputs are allow-list projections validated before emission.

All newsroom prose is untrusted data. The server never interprets it as code or instructions. Private link labels/URLs are records only: neither links nor article resources are fetched. Existing Media Library IDs can be attached; no binary upload, URL downloader, SQL, generic REST proxy, arbitrary metadata writer or settings writer is exposed.

## Tools, resources and prompts

See the generated [complete tool catalog](mcp-tools.md) for every purpose, read/write classification, destructive hint, domain permission and API. Regenerate with `npm run mcp:catalog`; `npm run verify:mcp-catalog` detects drift.

Groups cover newsroom context, staff/workload, story search and planning, tasks, sources, appointments, production/media, private links, Collections, shared collection interviews, presets, article content/publication, sections/tags, Notes, activity, feedback, content health, poll reads and deployment. Descriptions distinguish attendance, work delivery, internal story deadlines, planned publication and actual publication.

Resources reuse the same authorized tool read models:

- `byline://newsroom/today`
- `byline://story/<id>`
- `byline://collection/<id>`
- `byline://staff/<id>`

The `daily-newsroom-review` prompt asks for a factual read-only review. It is not an autonomous agent. Every tool returns a schema-validated `structuredContent` envelope containing `ok`, `data` or `error`, and `requestId`, plus compatible text. Optional workspace section failures remain visible in `errors` rather than being treated as empty successful work.

### Sensitive actions

Content replacement, publish, schedule, unschedule, unpublish, Trash, permanent record deletion, template reset, connection revocation and deployment have explicit semantics and destructive annotations. High-impact article operations require `confirm:true` in addition to current version tokens. Clients should request user approval for them. These hints and arguments do not substitute for user intent or server authorization. Workflow `ready` never publishes anything.

Draft replacement accepts raw Gutenberg `blockMarkup` only for draft/pending posts. It never converts blocks to text. Version tokens cover content, excerpt, publication state/dates, terms, featured media, modification time and latest revision identity. Active WordPress editor locks are refused. Native posts-controller permission, sanitization, revision, taxonomy and publication behavior remains authoritative. Remote article writes serialize with each other; the normal WordPress cooperative editor lock remains relevant to concurrent native editors.

### Concurrency and idempotency

Read first, then supply the returned token:

| Operation | Required token |
|---|---|
| Story planning/workflow | `expectedRevision` |
| Story brief | exact `expectedBrief` |
| Source, appointment, production edit/delete | `expectedUpdatedAt` |
| Task edit/state/delete | task `version` as `expectedVersion` |
| Link mutations | workspace `resourcesVersion` as `expectedVersion` |
| Collection metadata | collection `version` as `expectedVersion` |
| Preset edit/reset | preset `expectedRevision` |
| Article mutation | article `version` as `expectedVersion` |

Versioned task/link/Collection operations translate to `If-Match` on their canonical REST route. A stale write returns a safe `conflict`, `retryable:true`, correlation ID and current revision where available. Never automatically reread-and-overwrite after a semantic conflict. Existing CAS remains authoritative for story record collections. Exact times require explicit offsets; date windows remain date-only in the site timezone.

Create tools require a caller-generated opaque `idempotencyKey` (16–128 letters, digits, `_` or `-`). Use the same key and body for retries of the same intent, with a new key for different work. WordPress atomically claims actor-scoped keys, stores request fingerprints and object references rather than private response copies, and reauthorizes a fresh object read on replay. Changing the body with the same key conflicts. Successful receipts expire after 30 days through WP Cron; sites should run WP Cron reliably.

A crash or failed callback can leave an **uncertain pending receipt**. It stays fenced rather than risking a duplicate. Inspect the original work before starting a new intent; administrators may remove the specific `_byline_receipt_<hash>` option after confirming its outcome. Do not clear all receipts or retry a creation blindly. Likewise, interrupted remote write locks (`_byline_remote_lock_<hash>`) require an administrator to confirm the PHP request ended before removing that specific lock. There is no claim of a cross-object transaction or automatic rollback of partially applied story setup.

Collection membership and bulk workflow operations require at most 20 explicit IDs. There are no wildcard mutations. Every item has its own result; workflow bulk changes and membership support dry-run permission/current-state checks. Dry-run results are observations, not reservations, and execution rechecks permissions.

## Limits and observability

Each connection is limited to 120 requests/minute; search/summary calls to 30/minute;
authentication endpoints to 30/minute per hashed network identity. Atomic WordPress
counters enforce limits across PHP workers. Tool bodies cap at 1 MiB, auth bodies at
16 KiB, draft markup at 512 KiB and individual canonical responses at 4 MiB. Existing
collection, search and bulk bounds remain in force.

The endpoint derives its host from WordPress and validates browser Origins. Native
clients without an Origin are supported. Browser deployments can allow additional
exact origins using the `byline_mcp_allowed_origins` WordPress filter. Do not use `*`.
Production requires HTTPS; loopback HTTP is accepted only for disposable WordPress
installations explicitly marked `WP_ENVIRONMENT_TYPE=local`.

Responses are not cached; consent pages use no-referrer and frame protections.
Errors never expose raw exception messages, stack traces, passwords or tokens.
The optional `byline_mcp_tool_event` action receives only request ID, tool, actor ID,
latency and status. Do not configure server/APM logging to capture Authorization
headers, OAuth request/response bodies or private tool content.

## Connecting clients

### ChatGPT

Where account/workspace policy permits, add a custom MCP server/plugin with your
CMS’s `/mcp` URL, choose OAuth and follow WordPress login and consent. Enable the
resulting connection in a new chat. See the current
[ChatGPT connection guide](https://developers.openai.com/plugins/deploy/connect-chatgpt).

### Codex

```sh
codex mcp add byline --url https://<your-cms>/mcp
codex mcp login byline
```

No WordPress password belongs in `config.toml`. See [Codex MCP documentation](https://learn.chatgpt.com/docs/extend/mcp?surface=cli).

### Claude Code and VS Code

```sh
claude mcp add --transport http byline https://<your-cms>/mcp
```

Use `/mcp` in Claude Code to authenticate. For VS Code:

```json
{"servers":{"byline":{"type":"http","url":"https://<your-cms>/mcp"}}}
```

Keep client approval controls enabled for publishing, content replacement,
deletion and deployment. Start with a read such as `byline.capabilities`.

## Development and release

Use Node 24+, PHP 8.2+, OpenSSL and Composer 2 on the build machine:

```sh
npm ci
npm run mcp:catalog
npm run typecheck:mcp
npm run test:mcp
npm run build:plugin
npm run package:plugin
npm run test:mcp:wordpress
```

`build:plugin` installs locked PHP dependencies, prefixes their namespaces and
bundles them into `wordpress-plugin/build/mcp/vendor/` before building admin assets.
`package:plugin` verifies that both the PHP SDK and OAuth server ship. CI and release
jobs perform this automatically. Do not commit vendor or build directories.

The disposable WordPress tests cover real local-domain authorization and mutations,
OAuth consent/PKCE/replay/refresh/revocation, plus browser-cookie authorization and
actual SDK clients for modern and legacy protocol eras. `mcp:catalog` generates both
`docs/mcp-tools.md` and the packaged `includes/mcp/catalog.json` schemas;
`verify:mcp-catalog` detects drift. Keep the PHP adapter and TypeScript reference
contract consistent when adding tools.

For MCP Inspector, run `npx @modelcontextprotocol/inspector`, select Streamable HTTP,
enter your CMS’s `/mcp` URL and follow OAuth. Test reads before mutations and use
only disposable drafts for publication tests.

## Troubleshooting

- **503:** check PHP 8.2+, OpenSSL and that the complete release ZIP was installed.
  If WordPress salts/site URL changed, the old signing key may no longer decrypt.
  Revoke/reset MCP grants and its encrypted key option with an administrator, then
  reconnect; no WordPress passwords need cleanup.
- **Login page instead of discovery/401:** ensure `/mcp`, `/mcp/*` and OAuth metadata
  reach WordPress and are not intercepted by a cache, extra login gateway or proxy.
- **401:** reconnect and verify the proxy preserves the Bearer Authorization header.
- **403:** the WordPress account or target object does not permit the action.
- **Conflict:** reread the object and decide whether to apply the change again.
  Never automatically overwrite a newer revision.
- **Partial story setup:** inspect `setup` and repair the surviving draft instead of
  creating a duplicate. Uncertain idempotency receipts remain fenced; inspect the
  original work before starting a new intent.
- **429:** honor Retry-After and pause. Do not retry creates with a fresh key.

## Intentionally unsupported operations

The first implementation leaves poll creation/editing/open/close in WordPress's native poll editor; only protected poll reads/results are exposed. The existing poll mutation surface is admin-form/nonce based, and a complete protected mutation API with vote-history concurrency is a separate canonical domain extension. No vote insertion, voter data or reset/export tool exists.

Collections are archived via typed status updates; permanent Collection deletion is not a current canonical route. Built-in presets can be edited/reset, not created as arbitrary new identities or permanently deleted. Core Notes writes/replies/resolution remain in Gutenberg/Core, matching Byline's deliberately read-only adapter. Feedback can be triaged; content-health issues are rechecked rather than falsely marked fixed. Retired Performance, sports management, arbitrary settings, secret diagnostics and remote file downloads are not exposed.
