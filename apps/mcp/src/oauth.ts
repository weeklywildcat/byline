export { authorizationServer } from "./provider";
import { authorizationServer } from "./provider";
import {
  AuthorizationError,
  authorizationErrorRedirect,
} from "@cloudflare/workers-oauth-provider";
import { z } from "zod";
import type { Credential, Env } from "./types";
import { configuration } from "./config";
import { digest, seal } from "./crypto";
import { vault } from "./vault";
import { WordPress } from "./wordpress";
import { BylineError } from "./errors";
const escape = (s: string) =>
  s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const secureHeaders = () =>
  new Headers({
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
    "Content-Security-Policy":
      "default-src 'none'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
    "X-Frame-Options": "DENY",
    "X-Content-Type-Options": "nosniff",
  });
export async function authorizationRoute(
  request: Request,
  env: Env,
): Promise<Response> {
  const oauth = authorizationServer(env).getOAuthApi(env);
  const config = configuration(env);
  const url = new URL(request.url);
  let cleanup: { wp: WordPress; uuid: string } | undefined;
  let phase = "consent";
  try {
    if (url.pathname === "/authorize" && request.method === "GET") {
      const original = await oauth.parseAuthRequest(request);
      const details = await oauth.describeConsent(original);
      const consent = await oauth.beginConsent(original);
      const headers = secureHeaders();
      consent.headers.forEach((v, k) => headers.append(k, v));
      headers.set("Content-Type", "text/html; charset=utf-8");
      return new Response(
        `<!doctype html><meta charset="utf-8"><title>Connect Byline</title><h1>Connect ${escape(
          details.clientName,
        )} to Byline</h1><p>${
          details.clientDomain
            ? `Client domain: <strong>${escape(details.clientDomain)}</strong>.`
            : "This client registered its own name; its identity is unverified."
        }</p><p>Access will return to <strong>${escape(
          details.redirectHost,
        )}</strong>.</p>${
          details.redirectIsLoopback
            ? "<p>This sends access to an app on your computer. Continue only if you started this connection.</p>"
            : ""
        }<p>This client can read and change the newsroom work your WordPress account permits, including article publication. WordPress will ask you to authorize a revocable Byline MCP Application Password.</p><p>WordPress installation: ${escape(
          config.wordpress,
        )}</p><form method="post"><input type="hidden" name="handle" value="${escape(
          consent.handle,
        )}"><button name="decision" value="approve">Continue to WordPress</button><button name="decision" value="deny">Cancel</button></form>`,
        { headers },
      );
    }
    if (url.pathname === "/authorize" && request.method === "POST") {
      if (request.headers.get("Origin") !== config.issuer)
        return new Response("Invalid origin", {
          status: 403,
          headers: secureHeaders(),
        });
      const form = await request.formData();
      const handle = String(form.get("handle") ?? "");
      if (form.get("decision") !== "approve") {
        const denied = await oauth.denyConsent(request, handle);
        return new Response(null, { status: 302, headers: denied.headers });
      }
      const approved = await oauth.approveConsent(request, handle, {
        scope: ["byline"],
      });
      const upstream = await oauth.beginUpstream(approved.request, {
        headers: approved.headers,
      });
      const success = new URL("/wordpress/callback", config.issuer);
      success.searchParams.set("state", upstream.state);
      const failure = new URL(success);
      failure.searchParams.set("denied", "true");
      const wp = new URL(
        `${config.wordpress}/wp-admin/authorize-application.php`,
      );
      wp.searchParams.set(
        "app_name",
        `Byline MCP (${crypto.randomUUID().slice(0, 8)})`,
      );
      wp.searchParams.set("app_id", env.APPLICATION_ID);
      wp.searchParams.set("success_url", success.href);
      wp.searchParams.set("reject_url", failure.href);
      upstream.headers.set("Location", wp.href);
      upstream.headers.set("Referrer-Policy", "no-referrer");
      return new Response(null, { status: 302, headers: upstream.headers });
    }
    if (url.pathname === "/wordpress/callback" && request.method === "GET") {
      phase = "verify_state";
      const resumed = await oauth.finishUpstream(request);
      phase = "claim_state";
      const state = url.searchParams.get("state") ?? "";
      if (!(await vault(env, `state:${await digest(state)}`).claim()))
        return new Response("Connection already used", {
          status: 400,
          headers: secureHeaders(),
        });
      if (url.searchParams.get("denied") === "true") {
        resumed.headers.set(
          "Location",
          authorizationErrorRedirect(resumed.request, "access_denied"),
        );
        return new Response(null, { status: 302, headers: resumed.headers });
      }
      const username = url.searchParams.get("user_login") ?? "";
      const password = url.searchParams.get("password") ?? "";
      if (
        !username ||
        username.length > 60 ||
        !/^[A-Za-z0-9 ]{24,40}$/.test(password)
      )
        throw new Error("Invalid callback");
      // Ignore callback site_url entirely; credentials only ever go to configured WordPress.
      const credential: Credential = {
        username,
        password,
        userId: 0,
        uuid: "",
      };
      const wp = new WordPress(env, credential, crypto.randomUUID());
      phase = "verify_application";
      const app = z
        .object({ uuid: z.string().uuid(), app_id: z.string().uuid() })
        .parse(
          await wp.request("/wp/v2/users/me/application-passwords/introspect"),
        );
      if (app.app_id.toLowerCase() !== env.APPLICATION_ID.toLowerCase())
        throw new Error("Wrong application");
      credential.uuid = app.uuid;
      cleanup = { wp, uuid: app.uuid };
      phase = "verify_actor";
      const access = z
        .object({ user: z.object({ id: z.number().int().positive() }) })
        .parse(await wp.request("/byline/v1/editorial/access"));
      credential.userId = access.user.id;
      credential.uuid = app.uuid;
      phase = "store_connection";
      const connectionId = crypto.randomUUID();
      await vault(env, connectionId).initialize(connectionId, {
        sealed: await seal(env, connectionId, credential),
        userId: credential.userId,
        createdAt: Date.now(),
      });
      cleanup = undefined; // The vault now owns credential cleanup.
      try {
        phase = "complete_authorization";
        const { redirectTo } = await oauth.completeAuthorization({
          request: resumed.request,
          userId: String(credential.userId),
          scope: ["byline"],
          metadata: { connectionId },
          props: { connectionId },
          revokeExistingGrants: false,
        });
        resumed.headers.set("Location", redirectTo);
        resumed.headers.set("Cache-Control", "no-store");
        resumed.headers.set("Referrer-Policy", "no-referrer");
        return new Response(null, { status: 302, headers: resumed.headers });
      } catch {
        await vault(env, connectionId).revoke(connectionId);
        throw new Error("Connection failed");
      }
    }
    return new Response("Not found", { status: 404, headers: secureHeaders() });
  } catch (error) {
    if (cleanup) {
      try {
        await cleanup.wp.request(
          `/wp/v2/users/me/application-passwords/${cleanup.uuid}`,
          "DELETE",
        );
      } catch {
        /* staff can revoke a failed connection in their WordPress profile */
      }
    }
    console.log(
      JSON.stringify({
        event: "oauth_connection_failed",
        phase,
        errorClass:
          error instanceof BylineError
            ? error.code
            : error instanceof z.ZodError
            ? "upstream_schema"
            : "connection_error",
      }),
    );
    if (error instanceof AuthorizationError && error.redirectTo)
      return Response.redirect(error.redirectTo, 302);
    return new Response(
      "Connection could not be completed. Start again from your MCP client.",
      { status: 400, headers: secureHeaders() },
    );
  }
}
