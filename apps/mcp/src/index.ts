import { BylineError, safeError } from "./errors";
import {
  OAuthResourceServer,
  insufficientScope,
} from "@cloudflare/workers-oauth-provider";
import { createMcpHandler } from "agents/mcp/server";
import { z } from "zod";
import type { AuthProps, Credential, Env } from "./types";
import { authorizationRoute, authorizationServer } from "./oauth";
import { configuration } from "./config";
import { digest, unseal } from "./crypto";
import { vault } from "./vault";
import { WordPress } from "./wordpress";
import { createServer } from "./server";
export { ConnectionVault } from "./vault";
const accessSchema = z.object({
  user: z.object({ id: z.number().int().positive(), name: z.string() }),
  timezone: z.string(),
  version: z.string(),
  capabilities: z.record(z.string(), z.boolean()),
});
async function boundedRequest(
  request: Request,
  max: number,
): Promise<Request | null> {
  if (Number(request.headers.get("Content-Length") ?? 0) > max) return null;
  if (!request.body) return request;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > max) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let at = 0;
  for (const v of chunks) {
    bytes.set(v, at);
    at += v.length;
  }
  return new Request(request, { body: bytes });
}
export default {
  async fetch(
    original: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    const requestId = crypto.randomUUID();
    try {
      const config = configuration(env);
      const url = new URL(original.url);
      const origin = original.headers.get("Origin");
      if (url.origin !== config.issuer)
        return new Response("Invalid host", { status: 421 });
      if (
        origin &&
        origin !== config.issuer &&
        !config.origins.includes(origin)
      )
        return new Response("Invalid origin", { status: 403 });
      if (original.method === "OPTIONS" && url.pathname === "/mcp") {
        const headers = new Headers({
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers":
            "Authorization, Content-Type, MCP-Protocol-Version, MCP-Session-Id, Accept",
          "Access-Control-Max-Age": "600",
          Vary: "Origin",
        });
        if (origin) headers.set("Access-Control-Allow-Origin", origin);
        return new Response(null, { status: 204, headers });
      }
      const request = await boundedRequest(
        original,
        url.pathname === "/mcp" ? 1024 * 1024 : 16 * 1024,
      );
      if (!request) return new Response("Request too large", { status: 413 });
      const auth = authorizationServer(env);
      if (
        url.pathname === "/authorize" ||
        url.pathname.startsWith("/wordpress/") ||
        url.pathname.startsWith("/oauth/")
      ) {
        const ip = original.headers.get("CF-Connecting-IP") ?? "unknown";
        if (
          !(await vault(env, `auth-rate:${await digest(ip)}`).consume(
            30,
            60000,
          ))
        )
          return new Response("Try again shortly", {
            status: 429,
            headers: { "Retry-After": "60" },
          });
        if (
          url.pathname === "/authorize" ||
          url.pathname === "/wordpress/callback"
        )
          return await authorizationRoute(request, env);
        return await auth.fetch(request, env, ctx);
      }
      const resource = new OAuthResourceServer<Env, AuthProps>({
        resourceMetadata: {
          resource: config.resource,
          authorization_servers: [config.issuer],
          resource_name: "Byline newsroom",
        },
        requiredScopes: ["byline"],
        validateToken: (env) => (resource, token) =>
          auth.validateToken<AuthProps>(resource, token, env),
        handler: {
          async fetch(request, env, resourceCtx) {
            if (!resourceCtx.auth.scope.includes("byline"))
              return insufficientScope(resourceCtx.auth, ["byline"]);
            const connectionId = resourceCtx.props?.connectionId;
            if (
              typeof connectionId !== "string" ||
              !z.string().uuid().safeParse(connectionId).success
            )
              return new Response("Reconnect Byline", { status: 401 });
            const store = vault(env, connectionId);
            const connection = await store.readConnection();
            if (!connection || connection.revoked)
              return new Response("Reconnect Byline", { status: 401 });
            if (!(await store.consume(120, 60000)))
              return new Response("Try again shortly", {
                status: 429,
                headers: { "Retry-After": "60" },
              });
            const credential = await unseal<Credential>(
              env,
              connectionId,
              connection.sealed,
            );
            const wp = new WordPress(env, credential, requestId);
            const access = accessSchema.parse(
              await wp.request("/byline/v1/editorial/access"),
            );
            if (access.user.id !== connection.userId)
              return new Response("Reconnect Byline", { status: 401 });
            const handler = createMcpHandler(
              () =>
                createServer(
                  {
                    wp,
                    access,
                    requestId,
                    disconnect: () => store.revoke(connectionId),
                  },
                  async (tool) => {
                    if (tool.includes("search") || tool === "newsroom.summary")
                      return vault(env, `search-rate:${connectionId}`).consume(
                        30,
                        60000,
                      );
                    return true;
                  },
                ),
              {
                route: "/mcp",
                allowedHostnames: [url.hostname],
                allowedOriginHostnames: "*",
                corsOptions: false,
              },
            );
            return handler(request, env, resourceCtx);
          },
        },
      });
      const response =
        url.pathname === "/mcp" ||
        url.pathname.startsWith("/.well-known/oauth-protected-resource")
          ? await resource.fetch(request, env, ctx)
          : await auth.fetch(request, env, ctx);
      const headers = new Headers(response.headers);
      headers.set("Cache-Control", "no-store");
      headers.set("X-Request-Id", requestId);
      if (origin) {
        headers.set("Access-Control-Allow-Origin", origin);
        headers.set("Vary", "Origin");
        headers.set(
          "Access-Control-Expose-Headers",
          "WWW-Authenticate, MCP-Protocol-Version, X-Request-Id",
        );
      }
      return new Response(response.body, { status: response.status, headers });
    } catch (error) {
      if (
        error instanceof BylineError &&
        ["unauthenticated", "forbidden"].includes(error.code)
      ) {
        const headers: Record<string, string> = {
          "Cache-Control": "no-store",
          "X-Request-Id": requestId,
        };
        if (error.code === "unauthenticated")
          headers["WWW-Authenticate"] = 'Bearer error="invalid_token"';
        return Response.json(
          { ok: false, error: safeError(error, requestId), requestId },
          { status: error.code === "unauthenticated" ? 401 : 403, headers },
        );
      }
      console.log(
        JSON.stringify({
          event: "request_error",
          requestId,
          status: "unavailable",
        }),
      );
      return Response.json(
        { error: "Service temporarily unavailable", requestId },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }
  },
  async scheduled(
    _event: ScheduledController,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<void> {
    ctx.waitUntil(
      authorizationServer(env)
        .purgeExpiredData(env)
        .then(() => undefined),
    );
  },
} satisfies ExportedHandler<Env>;
