# Byline remote MCP

Byline MCP makes the existing newsroom programmable through typed actions. It is a separately deployed Cloudflare Worker in `apps/mcp/`, using MCP **2026-07-28**, TypeScript SDK **v2**, Zod 4 and `createMcpHandler` from `agents/mcp/server`. The pinned SDK version matches Agents' exact peer requirement. The endpoint also accepts legacy stateless Streamable HTTP clients. It has no standalone HTTP+SSE endpoint, `McpAgent` or protocol-session Durable Object.

## Architecture and ownership

```text
MCP client → Cloudflare OAuth resource server → typed newsroom adapter
                                                ↓ per-user Application Password
                                    protected WordPress /byline/v1 API
                                                ↓
                            existing Byline domains and WordPress storage
```

WordPress and the Byline plugin remain the durable control plane. The Worker does not query tables, own newsroom records, duplicate domain authorization, execute prompts, or involve Astro. Astro remains a static public build consumer. The Worker and Discord service are independently deployable and excluded from the plugin ZIP.

The canonical plugin extensions are available to other authenticated clients too:

- `/editorial/access`, `/editorial/staff`, `/editorial/system` and `/editorial/terms/{category|post_tag}` provide safe discovery.
- `/editorial/story-plans` creates a canonical draft/preset and explicitly reports each setup outcome. A setup failure preserves the draft, with per-step `ok` and HTTP status; it does not silently claim a complete plan.
- `/editorial/articles/{id}` and its named mutation routes guard content/publication writes and delegate to WordPress's native posts controller.
- Task, link and Collection version tokens, conditional REST writes, bounded idempotency receipts, delete preconditions and MCP activity context extend existing domains.
- The schedule includes distinctly typed story deadlines, planned publication and native WordPress schedules. Collection detail includes up to 50 stories' authorized reporting/work aggregates, with `hasMoreWork`.
- `/editorial/polls` exposes protected poll definitions and aggregate results only.

## Authentication and consent

The Worker hosts separate `OAuthAuthorizationServer` and `OAuthResourceServer` roles using Cloudflare's OAuth Provider. They share a deployment here; the resource validator calls the authorization server's public API. A future split can use the provider's service-binding topology without changing tools.

1. A client discovers RFC 9728 protected-resource and RFC 8414 authorization-server metadata. Tokens are bound to the canonical `/mcp` resource.
2. Cloudflare validates the client and exact redirect URI, with CIMD support and DCR compatibility. The browser consent page shows the client identity/domain, redirect host, local-app warning, and access being granted. Client strings are HTML escaped.
3. Cloudflare's consent and upstream helpers protect browser binding, CSRF, one-time state and expiry. Client authorization uses S256 PKCE. The consent POST also checks its Origin.
4. Only after consent, the user goes to the configured WordPress installation's `/wp-admin/authorize-application.php`, authorizing **Byline MCP** (with a unique connection suffix so multiple clients can coexist) with the stable configured `APPLICATION_ID` UUID.
5. WordPress sends its logged-in user's `user_login` and new Application Password to `/wordpress/callback`. The callback ignores supplied `site_url`, validates browser-bound state and uses a serialized replay claim.
6. The Worker authenticates to the **configured** installation, introspects the new password's UUID and `app_id`, then reads the authenticated Byline identity. A caller cannot choose another WordPress user without possessing that user's valid credential.
7. The credential is encrypted with AES-256-GCM using a random IV, key ID and connection-bound associated data. The auth-only `ConnectionVault` Durable Object stores ciphertext and minimal connection lifecycle metadata. It stores neither newsroom data nor MCP sessions. OAuth props contain only a random connection ID.
8. Each MCP request verifies the OAuth token/audience, active connection and current WordPress identity/capabilities. Tool calls use that exact user's REST credential. No shared administrator credential exists.

Raw WordPress passwords never go to MCP clients, tool results or logs. Access tokens last 15 minutes; refresh grants last 30 days. The `byline` OAuth scope identifies this resource's consent, not a parallel role system: WordPress capabilities still determine every operation.

### Application Password lifecycle and revocation

Every connection has its own password UUID and connection ID, including connections made by the same WordPress user. `byline.disconnect` immediately denies the connection before attempting upstream cleanup, revokes its OAuth grant and deletes exactly its own Application Password. Cleanup failure is reported as `credentialRevoked:false`; the vault retries hourly. No other password is deleted.

The normal OAuth RFC 7009 revocation endpoint is `/oauth/token`. Revoking a refresh grant removes its access tokens through the provider. The vault reconciles grant existence hourly and then deletes its WordPress password. An abandoned authorization that never exchanges its code is cleaned up after approximately 15 minutes. Provider KV expiry cleanup runs hourly.

Staff may also revoke the specific **Byline MCP** Application Password in **WordPress → Users → Profile → Application Passwords**. WordPress then refuses subsequent REST calls, regardless of OAuth token lifetime. Removing a client entry locally is not proof of server-side revocation: disconnect first, or revoke the WordPress password. Keep decryption keys available until all associated credentials have been removed.

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

The Worker limits each connection to 120 requests/minute, search/summary work to 30/minute and auth attempts to 30/minute per hashed network identity. Durable Object counters enforce the limit across Worker isolates. Bulk lists have 20-item bounds; search defaults to 50 and caps at 100 with bounded offsets. Canonical candidate scans may also be bounded, so results are samples, not an implicit database export. The schedule reports its 200-story candidate bound; Collection work reports its 50-story work bound and 100-story/interview detail bounds. Use stories.search with collectionId for further story pages.

MCP request bodies cap at 1 MiB; auth bodies at 16 KiB; draft markup at 512 KiB. Upstream JSON reads cap at 4 MiB and time out after 20 seconds. Redirects are refused for authenticated WordPress calls. The installation URL is configuration, never tool input. Production requests require HTTPS and the exact configured host; browser Origins are checked against exact configured origins. Requests without Origin are supported for native clients.

Logs contain request ID, tool name, numeric actor ID, latency, status and upstream HTTP status/error class only. Never log tokens, passwords, request bodies, callback URLs/query strings, article text, notes, locations or resource URLs. Worker invocation logs are disabled and Worker query-string redaction is enabled because WordPress's Core authorization callback carries a credential in its query. **Configure Cloudflare HTTP/Logpush/APM/WAF logging to exclude or redact the entire `/wordpress/callback` query**, and do the same in any additional proxy. Application logging cannot sanitize a platform access log that runs before the Worker. Responses use no-store and callback/consent pages use no-referrer protections.

Canonical activity events gain `source=mcp`, the validated tool name and correlation ID while retaining their actual WordPress actor. No conversation prompt is stored. Human activity summaries preserve the existing domain's private-content exclusions.

## Deployment

Deploy the updated plugin first; the Worker requires its protected extensions. The release ZIP still contains only the plugin. Use Node 24+ and a Cloudflare account with Workers, KV and SQLite-backed Durable Objects.

1. Create a dedicated OAuth KV namespace with `npx wrangler kv namespace create OAUTH_KV` from `apps/mcp/`; put its real ID in your deployment configuration.
2. Set a custom Worker domain/route. Set `PUBLIC_URL` to its HTTPS origin, `WORDPRESS_URL` to the canonical HTTPS WordPress installation root (subdirectories supported), and `ALLOWED_ORIGINS` to comma-separated exact browser origins you intend to allow. Native MCP clients generally omit Origin. No publication-specific domain is baked into the logic.
3. Keep `APPLICATION_ID` stable across redeployments. The supplied UUID identifies this application, not a user or a secret; another installation may configure its own stable UUID.
4. Generate a random 32-byte AES key locally and supply **only through a secret binding**. `CREDENTIAL_KEYS` is JSON such as `{"v1":"<base64 of 32 random bytes>"}`; `ACTIVE_KEY_ID=v1` selects the encryption key. Run `npx wrangler secret put CREDENTIAL_KEYS` interactively. Do not pass real keys/passwords in command arguments or commit them.
5. Keep the `CONNECTIONS` binding and `v1` Durable Object migration and the `OAUTH_KV` binding. These store auth state only. Retain the hourly trigger. Review account logging/redaction before enabling traffic.
6. Run `npm run typecheck:mcp`, `npm run test:mcp` and `npm run build:mcp`, then deploy with `npm run deploy --workspace @byline/mcp` using your configured domain/bindings.

Keep `global_fetch_strictly_public` enabled: the OAuth provider requires it for safe CIMD resolution.

The checked-in `wrangler.jsonc` deliberately has non-routable example origins and a placeholder KV ID. It must be configured before production use. No Cloudflare secrets or credentials are bundled into the plugin. Separate deployments must use separate bindings and encryption keys.

For rotation, first add a second key while retaining old keys, set the new `ACTIVE_KEY_ID`, then redeploy. Existing records decrypt by their stored key ID and new connections encrypt with the active key. Reconnect/revoke old connections before removing old keys. Back up the keyring securely: losing it prevents credential cleanup and requires staff to revoke the passwords directly in WordPress.

## Local development and validation

```sh
npm ci
npm run typecheck:mcp
npm run test:mcp
npm run build:mcp
npm run test:worker --workspace @byline/mcp
npm run mcp:catalog
npm run verify:mcp-catalog
npm run build:plugin
npm run test:mcp:wordpress
```

The WordPress command starts disposable `wp-env`, creates editor/writer/participant test users and records, checks real REST authorization/concurrency/publication/privacy, cleans up those records, and writes ignored synthetic response contracts for the SDK adapter tests. Run `npx wp-env stop --config=.wp-env.json` when finished. The ordinary root typecheck/test/build commands include MCP. CI also runs the WordPress tests in the real WordPress job and checks that plugin packaging excludes the Worker.

For a complete interactive OAuth loop use an HTTPS development hostname/tunnel and HTTPS WordPress installation with Application Passwords enabled. Set the canonical origins accordingly; the application does not relax production URL validation for localhost. Put local keys in ignored `.dev.vars`, and run `npm run dev --workspace @byline/mcp`. Test users/credentials must be disposable. Do not use a production administrator password for local testing.

### MCP Inspector

Against your configured HTTPS development endpoint:

```sh
npx @modelcontextprotocol/inspector
```

Choose Streamable HTTP, enter `https://<your-development-host>/mcp`, and follow OAuth. Check server discovery, tool schemas/annotations, resources, the newsroom prompt and a read such as `byline.capabilities`. Exercise a writer and an editor separately. Read before changing a record, intentionally retry a stale token, and confirm the structured 409. Create with an idempotency key twice and verify one object. Test schedule/publish/Trash only on disposable drafts with explicit approval. Disconnect and confirm subsequent calls fail and the exact Application Password disappears.

Automated protocol tests use the actual v2 client pinned to `2026-07-28`; no handwritten JSON-RPC substitutes for negotiation. OAuth tests use the actual Cloudflare provider, with test storage/runtime shims, for consent, state, PKCE, token issuance, grant revocation and password cleanup. A live client OAuth round trip and platform access-log configuration still require an operator-owned deployment.

## Connecting clients

### ChatGPT

Use a workspace/account where custom remote MCP connections are enabled. In the developer/custom-plugin connection flow, enter the production HTTPS `/mcp` URL, choose OAuth and complete the Byline consent and WordPress authorization. Add/enable the connection in a chat and start with “What needs attention today?” Review write/destructive tool approvals. Account availability and admin policy vary; follow the current [ChatGPT connection instructions](https://developers.openai.com/plugins/deploy/connect-chatgpt).

### Codex

```sh
codex mcp add byline --url https://<your-mcp-host>/mcp
codex mcp login byline
codex mcp list
```

Keep interactive approval enabled for publication, content replacement, deletion and deployment. No WordPress credential belongs in `config.toml`. See the current [Codex MCP documentation](https://learn.chatgpt.com/docs/extend/mcp?surface=cli).

### Claude Code and VS Code

```sh
claude mcp add --transport http byline https://<your-mcp-host>/mcp
```

In Claude Code, use `/mcp` to connect and complete OAuth. For VS Code's MCP configuration:

```json
{"servers":{"byline":{"type":"http","url":"https://<your-mcp-host>/mcp"}}}
```

Use each client's built-in OAuth and tool approval controls. Never paste a WordPress Application Password into client tool arguments.

## Intentionally unsupported operations

The first implementation leaves poll creation/editing/open/close in WordPress's native poll editor; only protected poll reads/results are exposed. The existing poll mutation surface is admin-form/nonce based, and a complete protected mutation API with vote-history concurrency is a separate canonical domain extension. No vote insertion, voter data or reset/export tool exists.

Collections are archived via typed status updates; permanent Collection deletion is not a current canonical route. Built-in presets can be edited/reset, not created as arbitrary new identities or permanently deleted. Core Notes writes/replies/resolution remain in Gutenberg/Core, matching Byline's deliberately read-only adapter. Feedback can be triaged; content-health issues are rechecked rather than falsely marked fixed. Retired Performance, sports management, arbitrary settings, secret diagnostics and remote file downloads are not exposed.

## Troubleshooting

- **401 / unauthenticated:** reconnect; verify WordPress receives Basic Authorization and Application Passwords are enabled. Reversed proxies must preserve Authorization. A deleted WP password cannot be repaired by refreshing MCP tokens.
- **403 / forbidden:** inspect current capabilities/target workspace. A writer cannot assign editors/deadlines or publish without the underlying capability; participation does not grant article/Notes access.
- **Conflict:** reread the object. Decide with the user whether to reapply the change. Do not replace a newer version silently.
- **Create reported partial setup:** inspect returned `setup` and the surviving workspace; repair only failed steps, using current tokens. Do not create another story.
- **Idempotency outcome uncertain:** inspect the original target and relevant activity before a new intent. See the receipt/lock recovery guidance above.
- **OAuth callback fails:** verify exact canonical origins, browser cookies, state expiry and the configured stable app ID. Start a new authorization; never copy/replay a callback URL containing a password.
- **Wrong local time:** read the returned site timezone; send an explicit offset for exact instants and date-only windows for fuzzy commitments. Do not use the workstation timezone as a substitute.
- **Rate limited / upstream unavailable:** honor retry guidance; never automatically replay a non-idempotent create with a fresh key. Check WordPress health without logging raw responses.
- **Credential cleanup pending:** connection access is already denied locally. Restore upstream connectivity and the retained keyring; the vault retries cleanup. Staff may revoke the UUID directly in their WordPress profile.

## Reference implementations

The implementation follows the [MCP TypeScript v2 SDK](https://ts.sdk.modelcontextprotocol.io/v2/), [Cloudflare stateless MCP support](https://developers.cloudflare.com/changelog/product/agents/), [Cloudflare OAuth Provider split roles](https://github.com/cloudflare/workers-oauth-provider/blob/main/docs/resource-servers.md), its [browser consent/upstream flow](https://github.com/cloudflare/workers-oauth-provider/blob/main/docs/upstream-sign-in.md), and [WordPress Application Password REST lifecycle](https://developer.wordpress.org/rest-api/reference/application-passwords/).
