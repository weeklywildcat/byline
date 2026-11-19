import { createSign, generateKeyPairSync } from "node:crypto";

/**
 * A stand-in for every Google HTTP endpoint Byline's Analytics connection talks to (docs/google-analytics.md):
 * OAuth token and revoke, the signing certificates, the Analytics Admin API and the Analytics Data API. It never
 * touches the network. Shared by the unit and integration tests (as a `fetch`) and by the newsroom browser tests
 * (preloaded into the dev server with `node --import`), so each behaves the same.
 *
 * Reports come from `state.fixtures`, keyed by the requested dimension names ("date", "contentId,pagePath,pageTitle",
 * "" for none), each row `{ dims, metrics, range? }`.
 */
export const ACCESS = "ya29.SECRET-ACCESS-TOKEN-VALUE";
export const KID = "byline-test-key";
const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const publicPem = publicKey.export({ type: "spki", format: "pem" });

export function createGoogleFake() {
  const state = {
    clientId: process.env.BYLINE_GOOGLE_CLIENT_ID || "123.apps.googleusercontent.com",
    refreshToken: "1//SECRET-REFRESH-TOKEN-VALUE", email: "owner@gmail.com", subject: "google-sub-1",
    grantedScope: "openid https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/analytics.readonly",
    revoked: false, rotate: null, revokeStatus: 200, missingProperty: false, noStreams: false, timeZone: "America/Chicago", siteHtml: "<html></html>",
    siteHost: "https://weeklywildcat.com",
    fail: new Set(), calls: [], fixtures: {}, realtimeDelay: 0
  };
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  const b64 = (value) => Buffer.from(typeof value === "string" ? value : JSON.stringify(value)).toString("base64url");

  /** An RS256 ID token the real google-auth-library accepts against this fake's certificates. */
  function idToken({ nonce, aud = state.clientId, email = state.email, sub = state.subject, expiresIn = 3000, emailVerified = true } = {}) {
    const now = Math.floor(Date.now() / 1000);
    const head = b64({ alg: "RS256", typ: "JWT", kid: KID });
    const claims = b64({ iss: "https://accounts.google.com", aud, azp: aud, sub, email, email_verified: emailVerified, nonce, iat: now, exp: now + expiresIn });
    const signature = createSign("RSA-SHA256").update(`${head}.${claims}`).sign(privateKey).toString("base64url");
    return `${head}.${claims}.${signature}`;
  }

  function table(body, key) {
    const dims = (body.dimensions ?? []).map((item) => item.name);
    const withRange = (body.dateRanges?.length ?? 0) > 1;
    const rows = state.fixtures[key] ?? [];
    return {
      dimensionHeaders: [...dims, ...(withRange ? ["dateRange"] : [])].map((name) => ({ name })),
      metricHeaders: (body.metrics ?? []).map((item) => ({ name: item.name })),
      rows: rows.map((row) => ({ dimensionValues: [...row.dims, ...(withRange ? [row.range ?? "current"] : [])].map((value) => ({ value })), metricValues: row.metrics.map((value) => ({ value: String(value) })) })),
      rowCount: rows.length
    };
  }
  const keyOf = (request) => (request.dimensions ?? []).map((item) => item.name).join(",");

  async function fake(input, init) {
    const url = String(input instanceof Request ? input.url : input);
    if (url.startsWith("https://oauth2.googleapis.com/token")) {
      const params = new URLSearchParams(String(init?.body ?? ""));
      if (state.revoked) return json({ error: "invalid_grant", error_description: "Token has been expired or revoked." }, 400);
      if (params.get("grant_type") === "authorization_code") {
        // The fake authorization code carries the nonce the browser was given: `fake-code.<nonce>`.
        const nonce = String(params.get("code") ?? "").split(".")[1];
        return json({ access_token: ACCESS, refresh_token: state.refreshToken, expires_in: 3599, token_type: "Bearer", scope: state.grantedScope, id_token: idToken({ nonce }) });
      }
      return json({ access_token: ACCESS, expires_in: 3599, token_type: "Bearer", ...(state.rotate ? { refresh_token: state.rotate } : {}) });
    }
    if (url.startsWith("https://www.googleapis.com/oauth2/v1/certs") || url.startsWith("https://www.googleapis.com/oauth2/v3/certs") || url.includes("/oauth2/v1/certs")) return json({ [KID]: publicPem });
    if (url.startsWith("https://oauth2.googleapis.com/revoke")) { state.calls.push("revoke"); return new Response("{}", { status: state.revokeStatus }); }
    if (url.startsWith("https://analyticsadmin.googleapis.com/")) {
      state.calls.push(url.replace("https://analyticsadmin.googleapis.com/v1beta/", "admin:"));
      if (url.includes("/accountSummaries")) return json({ accountSummaries: [
        { account: "accounts/1", displayName: "Weekly Wildcat", propertySummaries: [{ property: "properties/10", displayName: "weeklywildcat.com" }, { property: "properties/20", displayName: "Staging" }] },
        { account: "accounts/2", displayName: "Someone else", propertySummaries: [{ property: "properties/30", displayName: "Other site" }] }
      ] });
      if (url.includes("/dataStreams")) {
        if (state.noStreams || url.includes("properties/30")) return json({ dataStreams: [{ name: "properties/30/dataStreams/9", type: "IOS_APP_DATA_STREAM", displayName: "iOS" }] });
        const id = url.match(/properties\/(\d+)/)[1];
        return json({ dataStreams: id === "10"
          ? [{ name: "properties/10/dataStreams/1", type: "WEB_DATA_STREAM", displayName: "Main site", webStreamData: { measurementId: "G-MAIN12345", defaultUri: state.siteHost } }, { name: "properties/10/dataStreams/2", type: "WEB_DATA_STREAM", displayName: "Preview", webStreamData: { measurementId: "G-PREV12345", defaultUri: "https://preview.example.com" } }]
          : [{ name: "properties/20/dataStreams/3", type: "WEB_DATA_STREAM", displayName: "Staging site", webStreamData: { measurementId: "G-STAGE1234", defaultUri: "https://staging.example.com" } }] });
      }
      const property = url.match(/properties\/(\d+)$/);
      if (property) return state.missingProperty ? json({ error: { status: "PERMISSION_DENIED" } }, 403) : json({ displayName: property[1] === "10" ? "weeklywildcat.com" : "Staging", timeZone: state.timeZone });
    }
    if (url.startsWith("https://analyticsdata.googleapis.com/")) {
      const body = JSON.parse(String(init?.body ?? "{}"));
      state.calls.push(url.replace("https://analyticsdata.googleapis.com/v1beta/", "data:"));
      const failing = (request) => state.fail.has(keyOf(request));
      if (url.endsWith(":batchRunReports")) {
        if (body.requests.some(failing)) return json({ error: { status: "INTERNAL" } }, 500);
        return json({ reports: body.requests.map((request) => table(request, keyOf(request))) });
      }
      if (url.endsWith(":runRealtimeReport") && state.realtimeDelay) await new Promise((resolve) => setTimeout(resolve, state.realtimeDelay));
      if (failing(body)) return json({ error: { status: "INTERNAL" } }, 500);
      return json({ ...table(body, keyOf(body)), propertyQuota: { tokensPerDay: { consumed: 10, remaining: 190 } } });
    }
    if (url.startsWith(state.siteHost)) return new Response(state.siteHtml, { status: 200 });
    return undefined;
  }

  /** Wraps a real fetch: Google's hosts and the public site are the fake's; everything else passes through. */
  const api = { state, handle: fake, fake: async (input, init) => (await api.handle(input, init)) ?? new Response("unexpected request", { status: 599 }), install: undefined, idToken, publicPem };
  api.install = (target = globalThis) => {
    const real = target.fetch.bind(target);
    target.fetch = async (input, init) => (await api.handle(input, init)) ?? real(input, init);
  };
  return api;
}
