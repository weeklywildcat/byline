import { beforeEach, describe, expect, it, vi } from "vitest";
import { OAuthAuthorizationServer } from "@cloudflare/workers-oauth-provider";
import { authorizationRoute, authorizationServer } from "../src/oauth";
import { ConnectionVault } from "../src/vault";
import { seal } from "../src/crypto";
import type { Env } from "../src/types";
class MemoryKV {
  values = new Map<string, string>();
  async get(key: string, type?: string | { type?: string }) {
    const value = this.values.get(key) ?? null;
    return value &&
      (type === "json" || (typeof type === "object" && type.type === "json"))
      ? JSON.parse(value)
      : value;
  }
  async put(key: string, value: string) {
    this.values.set(key, value);
  }
  async delete(key: string) {
    this.values.delete(key);
  }
  async list(
    options: { prefix?: string; cursor?: string; limit?: number } = {},
  ) {
    const keys = [...this.values.keys()]
      .filter((k) => k.startsWith(options.prefix ?? ""))
      .map((name) => ({ name }));
    return { keys, list_complete: true, cursor: "" };
  }
}
class MemoryStorage {
  values = new Map<string, unknown>();
  alarmAt?: number;
  async get<T>(key: string): Promise<T | undefined> {
    return this.values.get(key) as T | undefined;
  }
  async put(key: string, value: unknown) {
    this.values.set(key, value);
  }
  async deleteAll() {
    this.values.clear();
  }
  async setAlarm(at: number) {
    this.alarmAt = at;
  }
  async transaction<T>(run: (txn: MemoryStorage) => Promise<T>) {
    return run(this);
  }
}
function environment() {
  const env = {
    PUBLIC_URL: "https://mcp.example.test",
    WORDPRESS_URL: "https://cms.example.test",
    APPLICATION_ID: "cf2276ae-6bbb-4f7e-ae25-1b4929461791",
    ALLOWED_ORIGINS: "",
    ACTIVE_KEY_ID: "v1",
    CREDENTIAL_KEYS: JSON.stringify({ v1: btoa("a".repeat(32)) }),
    OAUTH_KV: new MemoryKV(),
  } as unknown as Env;
  const objects = new Map<string, ConnectionVault>();
  env.CONNECTIONS = {
    idFromName: (name: string) => name,
    get: (id: string) => {
      if (!objects.has(id))
        objects.set(
          id,
          new ConnectionVault(
            { storage: new MemoryStorage() } as unknown as DurableObjectState,
            env,
          ),
        );
      return objects.get(id);
    },
  } as unknown as Env["CONNECTIONS"];
  return { env, objects };
}
function cookies(response: Response): string {
  return response.headers
    .getSetCookie()
    .map((v) => v.split(";")[0])
    .join("; ");
}
const requestContext = { waitUntil: () => {} } as unknown as ExecutionContext;
beforeEach(() => vi.restoreAllMocks());
describe("Cloudflare OAuth provider and per-user WordPress connection", () => {
  it("publishes split-role metadata and refuses unauthenticated access to tokens", async () => {
    const { env } = environment();
    const auth = authorizationServer(env);
    const metadata = await auth.fetch(
      new Request(
        "https://mcp.example.test/.well-known/oauth-authorization-server",
      ),
      env,
      requestContext,
    );
    expect(metadata.status).toBe(200);
    expect(await metadata.json()).toMatchObject({
      issuer: "https://mcp.example.test",
      protected_resources: ["https://mcp.example.test/mcp"],
    });
    expect(
      await auth.validateToken(
        "https://mcp.example.test/mcp",
        "not-a-token",
        env,
      ),
    ).toBeNull();
  });
  it("shows escaped client consent and rejects cross-origin approval", async () => {
    const { env } = environment();
    const api = authorizationServer(env).getOAuthApi(env);
    const client = await api.createClient({
      clientName: "<script>BAD</script>",
      redirectUris: ["https://client.example.test/callback"],
      tokenEndpointAuthMethod: "none",
      grantTypes: ["authorization_code", "refresh_token"],
      responseTypes: ["code"],
    });
    const url = new URL("https://mcp.example.test/authorize");
    url.search = new URLSearchParams({
      client_id: client.clientId,
      redirect_uri: "https://client.example.test/callback",
      response_type: "code",
      scope: "byline",
      resource: "https://mcp.example.test/mcp",
      code_challenge: "a".repeat(43),
      code_challenge_method: "S256",
      state: "client-state",
    }).toString();
    const response = await authorizationRoute(new Request(url), env);
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).toContain("client.example.test");
    expect(text).not.toContain("<script>BAD");
    expect(response.headers.get("content-security-policy")).toContain(
      "frame-ancestors 'none'",
    );
    const bad = await authorizationRoute(
      new Request("https://mcp.example.test/authorize", {
        method: "POST",
        headers: { Origin: "https://attacker.test" },
        body: new URLSearchParams({ handle: "bogus", decision: "approve" }),
      }),
      env,
    );
    expect(bad.status).toBe(403);
  });
  it("validates consent, browser-bound callback, app ID, and stores no password in OAuth props", async () => {
    const { env, objects } = environment();
    const api = authorizationServer(env).getOAuthApi(env);
    const client = await api.createClient({
      clientName: "Test client",
      redirectUris: ["https://client.example.test/callback"],
      tokenEndpointAuthMethod: "none",
      grantTypes: ["authorization_code", "refresh_token"],
      responseTypes: ["code"],
    });
    const authUrl = new URL("https://mcp.example.test/authorize");
    authUrl.search = new URLSearchParams({
      client_id: client.clientId,
      redirect_uri: "https://client.example.test/callback",
      response_type: "code",
      scope: "byline",
      resource: "https://mcp.example.test/mcp",
      code_challenge: "a".repeat(43),
      code_challenge_method: "S256",
      state: "client-state",
    }).toString();
    const page = await authorizationRoute(new Request(authUrl), env);
    const handle = (await page.text()).match(
      /name="handle" value="([^"]+)"/,
    )![1];
    const approved = await authorizationRoute(
      new Request("https://mcp.example.test/authorize", {
        method: "POST",
        headers: { Origin: "https://mcp.example.test", Cookie: cookies(page) },
        body: new URLSearchParams({ handle, decision: "approve" }),
      }),
      env,
    );
    expect(approved.status).toBe(302);
    const wpUrl = new URL(approved.headers.get("Location")!);
    expect(wpUrl.origin).toBe("https://cms.example.test");
    expect(wpUrl.searchParams.get("app_id")).toBe(env.APPLICATION_ID);
    const callback = new URL(wpUrl.searchParams.get("success_url")!);
    callback.searchParams.set("user_login", "actual-writer");
    callback.searchParams.set("password", "a".repeat(24));
    callback.searchParams.set("site_url", "https://attacker.test");
    const fetcher = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (url, options) => {
        expect(String(url)).toContain("https://cms.example.test/wp-json/");
        expect(options?.redirect).toBe("manual");
        return Response.json(
          String(url).includes("introspect")
            ? {
                uuid: "880f1330-e29e-4609-a7db-d020258be21a",
                app_id: env.APPLICATION_ID,
              }
            : { user: { id: 42 } },
        );
      });
    const noCookie = await authorizationRoute(new Request(callback), env);
    expect(noCookie.status).toBe(400);
    expect(fetcher).not.toHaveBeenCalled();
    const finished = await authorizationRoute(
      new Request(callback, { headers: { Cookie: cookies(approved) } }),
      env,
    );
    expect(finished.status).toBe(302);
    expect(finished.headers.get("Location")).toContain(
      "https://client.example.test/callback",
    );
    expect(finished.headers.get("Location")).not.toContain("password");
    const stored = [...objects.values()];
    const connections = (
      await Promise.all(stored.map((o) => o.readConnection()))
    ).filter(Boolean);
    expect(connections).toHaveLength(1);
    expect(connections[0]?.userId).toBe(42);
    expect(JSON.stringify(connections)).not.toContain("a".repeat(24));
    expect(
      JSON.stringify([
        ...(env.OAUTH_KV as unknown as MemoryKV).values.values(),
      ]),
    ).not.toContain("actual-writer");
    const replay = await authorizationRoute(
      new Request(callback, { headers: { Cookie: cookies(approved) } }),
      env,
    );
    expect(replay.status).toBe(400);
  });
  it("disconnect invalidates connection before upstream deletion and retries cleanup on outage", async () => {
    const { env, objects } = environment();
    const id = crypto.randomUUID();
    const vault = env.CONNECTIONS.get(env.CONNECTIONS.idFromName(id));
    await vault.initialize(id, {
      userId: 42,
      createdAt: Date.now(),
      sealed: await seal(env, id, {
        username: "writer",
        password: "secret",
        userId: 42,
        uuid: crypto.randomUUID(),
      }),
    });
    vi.spyOn(globalThis, "fetch").mockRejectedValue(
      new Error("Network unavailable"),
    );
    const disconnected = await vault.revoke(id);
    expect(disconnected).toEqual({ revoked: true, credentialRevoked: false });
    expect((await vault.readConnection())?.revoked).toBe(true);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({ deleted: true }),
    );
    expect(await vault.revoke(id)).toEqual({
      revoked: true,
      credentialRevoked: true,
    });
    expect(await vault.readConnection()).toBeNull();
  });
});

describe("OAuth token lifecycle with the actual provider", () => {
  it("enforces S256 PKCE, binds tokens to a connection/audience, and revokes the upstream password after grant revocation", async () => {
    const { env, objects } = environment();
    const auth = authorizationServer(env);
    const api = auth.getOAuthApi(env);
    const connectionId = crypto.randomUUID();
    const store = env.CONNECTIONS.get(env.CONNECTIONS.idFromName(connectionId));
    await store.initialize(connectionId, {
      userId: 42,
      createdAt: Date.now(),
      sealed: await seal(env, connectionId, {
        username: "writer",
        password: "NEVER_RETURN",
        uuid: crypto.randomUUID(),
        userId: 42,
      }),
    });
    const client = await api.createClient({
      clientName: "Lifecycle client",
      redirectUris: ["https://client.example.test/callback"],
      tokenEndpointAuthMethod: "none",
      grantTypes: ["authorization_code", "refresh_token"],
      responseTypes: ["code"],
    });
    const verifier = "test-verifier-that-is-long-enough-for-pkce-123456789";
    const bytes = new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)),
    );
    const challenge = btoa(String.fromCharCode(...bytes))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    const u = new URL("https://mcp.example.test/authorize");
    u.search = new URLSearchParams({
      client_id: client.clientId,
      redirect_uri: "https://client.example.test/callback",
      response_type: "code",
      scope: "byline",
      resource: "https://mcp.example.test/mcp",
      code_challenge: challenge,
      code_challenge_method: "S256",
    }).toString();
    const request = await api.parseAuthRequest(new Request(u));
    const completed = await api.completeAuthorization({
      request,
      userId: "42",
      scope: ["byline"],
      metadata: { connectionId },
      props: { connectionId },
      revokeExistingGrants: false,
    });
    const code = new URL(completed.redirectTo).searchParams.get("code")!;
    const tokenRequest = (codeVerifier: string) =>
      new Request("https://mcp.example.test/oauth/token", {
        method: "POST",
        body: new URLSearchParams({
          grant_type: "authorization_code",
          client_id: client.clientId,
          code,
          redirect_uri: "https://client.example.test/callback",
          code_verifier: codeVerifier,
          resource: "https://mcp.example.test/mcp",
        }),
      });
    expect(
      (await auth.fetch(tokenRequest("wrong-verifier"), env, requestContext))
        .status,
    ).toBe(400);
    const tokenResponse = await auth.fetch(
      tokenRequest(verifier),
      env,
      requestContext,
    );
    expect(tokenResponse.status).toBe(200);
    const tokens = (await tokenResponse.json()) as {
      access_token: string;
      refresh_token: string;
    };
    expect(JSON.stringify(tokens)).not.toContain("NEVER_RETURN");
    const validated = await auth.validateToken(
      "https://mcp.example.test/mcp",
      tokens.access_token,
      env,
    );
    expect(validated?.props).toEqual({ connectionId });
    expect(validated?.userId).toBe("42");
    expect((await store.readConnection())?.grantId).toBeTruthy();
    const revocation = await auth.fetch(
      new Request("https://mcp.example.test/oauth/token", {
        method: "POST",
        body: new URLSearchParams({
          client_id: client.clientId,
          token: tokens.refresh_token,
          token_type_hint: "refresh_token",
        }),
      }),
      env,
      requestContext,
    );
    expect(revocation.status).toBe(200);
    expect(
      await auth.validateToken(
        "https://mcp.example.test/mcp",
        tokens.access_token,
        env,
      ),
    ).toBeNull();
    const fetcher = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(Response.json({ deleted: true }));
    await objects.get(connectionId)!.alarm();
    expect(fetcher).toHaveBeenCalledOnce();
    expect(await store.readConnection()).toBeNull();
  });
});
