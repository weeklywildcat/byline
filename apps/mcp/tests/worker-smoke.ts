/** Run after build: exercises the actual Worker, OAuth provider, SQLite vault and Agents handler. */
import {
  Miniflare,
  Log,
  LogLevel,
  convertV4MiniflareOptions,
  Response as RuntimeResponse,
} from "miniflare";
import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import assert from "node:assert/strict";
const origin = "https://mcp.example.test";
const appId = "cf2276ae-6bbb-4f7e-ae25-1b4929461791";
let deleted = 0;
let upstreamDenied = false;
const options = convertV4MiniflareOptions({
  name: "byline-test",
  modules: true,
  scriptPath: new URL("../dist/index.js", import.meta.url).pathname,
  compatibilityDate: "2026-10-19",
  compatibilityFlags: ["nodejs_compat", "global_fetch_strictly_public"],
  kvNamespaces: ["OAUTH_KV"],
  durableObjects: {
    CONNECTIONS: { className: "ConnectionVault", useSQLite: true },
  },
  bindings: {
    PUBLIC_URL: origin,
    WORDPRESS_URL: "https://cms.example.test",
    APPLICATION_ID: appId,
    ALLOWED_ORIGINS: "https://client.example.test",
    ACTIVE_KEY_ID: "v1",
    CREDENTIAL_KEYS: JSON.stringify({ v1: btoa("a".repeat(32)) }),
  },
  log: new Log(LogLevel.WARN),
  logRequests: false,
  outboundService: async (request) => {
    const url = new URL(request.url);
    assert.equal(url.origin, "https://cms.example.test");
    assert.match(request.headers.get("Authorization") ?? "", /^Basic /);
    if (url.pathname.endsWith("/introspect"))
      return RuntimeResponse.json({
        app_id: appId,
        uuid: "880f1330-e29e-4609-a7db-d020258be21a",
      });
    if (url.pathname.endsWith("/editorial/access") && upstreamDenied)
      return RuntimeResponse.json(
        { message: "SYNTHETIC_UPSTREAM_SECRET" },
        { status: 401 },
      );
    if (url.pathname.endsWith("/editorial/access"))
      return RuntimeResponse.json({
        user: { id: 42, name: "Worker test editor" },
        timezone: "America/New_York",
        version: "test",
        capabilities: {
          edit_posts: true,
          edit_others_posts: true,
          publish_posts: true,
          manage_byline: true,
        },
      });
    if (request.method === "DELETE") {
      deleted++;
      return RuntimeResponse.json({ deleted: true });
    }
    throw new Error("Unexpected upstream path");
  },
});
// Simulate the edge's canonical URL/Host pair; Miniflare's local socket uses a loopback Host.
options.workers.unshift(
  convertV4MiniflareOptions({
    name: "edge-test",
    modules: true,
    compatibilityDate: "2026-10-19",
    script: `export default {fetch(request,env){const headers=new Headers(request.headers);headers.set('Host',new URL(request.url).host);return env.APP.fetch(new Request(request,{headers}));}}`,
    serviceBindings: { APP: "byline-test" },
  }).workers[0],
);
const mf = new Miniflare(options);
const send = async (path: string, init: RequestInit = {}) =>
  mf.dispatchFetch(origin + path, { redirect: "manual", ...init } as Parameters<
    typeof mf.dispatchFetch
  >[1]);
const cookie = (r: { headers: { getSetCookie: () => string[] } }) =>
  r.headers
    .getSetCookie()
    .map((v) => v.split(";")[0])
    .join("; ");
let client: Client | undefined;
try {
  assert.equal((await send("/mcp")).status, 401);
  assert.equal(
    (await send("/mcp", { headers: { Origin: "https://attacker.test" } }))
      .status,
    403,
  );
  assert.equal(
    (await send("/mcp", { method: "POST", body: "x".repeat(1024 * 1024 + 1) }))
      .status,
    413,
  );
  const metadata = await send("/.well-known/oauth-protected-resource/mcp");
  assert.equal(metadata.status, 200);
  assert.equal(
    ((await metadata.json()) as { resource: string }).resource,
    origin + "/mcp",
  );
  const registration = await send("/oauth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_name: "Worker smoke",
      redirect_uris: ["https://client.example.test/callback"],
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
    }),
  });
  assert.equal(registration.status, 201);
  const { client_id } = (await registration.json()) as { client_id: string };
  const verifier =
    "worker-integration-verifier-abcdefghijklmnopqrstuvwxyz12345";
  const bytes = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)),
  );
  const challenge = Buffer.from(bytes).toString("base64url");
  const q = new URLSearchParams({
    client_id,
    redirect_uri: "https://client.example.test/callback",
    response_type: "code",
    scope: "byline",
    resource: origin + "/mcp",
    code_challenge: challenge,
    code_challenge_method: "S256",
    state: "smoke",
  });
  const page = await send("/authorize?" + q);
  assert.equal(page.status, 200);
  const handle = (await page.text()).match(/name="handle" value="([^"]+)"/)![1];
  const approval = await send("/authorize", {
    method: "POST",
    headers: {
      Origin: origin,
      Cookie: cookie(page),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ handle, decision: "approve" }).toString(),
  });
  assert.equal(approval.status, 302, await approval.text());
  const callback = new URL(
    new URL(approval.headers.get("Location")!).searchParams.get("success_url")!,
  );
  callback.searchParams.set("user_login", "actual-editor");
  callback.searchParams.set("password", "a".repeat(24));
  const finish = await send(callback.pathname + callback.search, {
    headers: { Cookie: cookie(approval) },
  });
  assert.equal(finish.status, 302);
  const code = new URL(finish.headers.get("Location")!).searchParams.get(
    "code",
  )!;
  const token = await send("/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id,
      redirect_uri: "https://client.example.test/callback",
      code,
      code_verifier: verifier,
      resource: origin + "/mcp",
    }).toString(),
  });
  assert.equal(token.status, 200);
  const { access_token } = (await token.json()) as { access_token: string };
  const transport = new StreamableHTTPClientTransport(
    new URL(origin + "/mcp"),
    {
      requestInit: { headers: { Authorization: "Bearer " + access_token } },
      fetch: async (url, init) => {
        const r = await send(
          new URL(String(url)).pathname,
          init as RequestInit,
        );
        return new Response(r.body as unknown as BodyInit, {
          status: r.status,
          headers: r.headers as unknown as Headers,
        });
      },
    },
  );
  client = new Client(
    { name: "worker-smoke", version: "1.0" },
    { versionNegotiation: { mode: { pin: "2026-07-28" } } },
  );
  await client.connect(transport);
  assert.equal(transport.protocolVersion, "2026-07-28");
  const catalog = await client.listTools();
  assert(catalog.tools.some((t) => t.name === "article.publish"));
  assert(catalog.tools.length > 60);
  const who = await client.callTool({
    name: "byline.capabilities",
    arguments: {},
  });
  assert.equal(
    (who.structuredContent as { data: { user: { id: number } } }).data.user.id,
    42,
  );
  upstreamDenied = true;
  const invalidCredential = await send("/mcp", {
    headers: { Authorization: "Bearer " + access_token },
  });
  assert.equal(invalidCredential.status, 401);
  assert(
    !JSON.stringify(await invalidCredential.json()).includes(
      "SYNTHETIC_UPSTREAM_SECRET",
    ),
  );
  upstreamDenied = false;
  const disconnected = await client.callTool({
    name: "byline.disconnect",
    arguments: {},
  });
  assert.equal(
    (disconnected.structuredContent as { data: { credentialRevoked: boolean } })
      .data.credentialRevoked,
    true,
  );
  assert.equal(deleted, 1);
  assert.equal(
    (
      await send("/mcp", {
        headers: { Authorization: "Bearer " + access_token },
      })
    ).status,
    401,
  );
  console.log(
    "Worker OAuth → per-user vault → MCP 2026-07-28 → disconnect smoke passed.",
  );
} finally {
  await client?.close();
  await mf.dispose();
}
