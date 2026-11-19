import { describe, expect, it } from "vitest";
import { analyticsOAuthConfig, ANALYTICS_SCOPES, analyticsSetupProblems } from "../../src/analytics/config";
import { acceptAnalyticsCallback, beginAnalyticsGrant } from "../../src/analytics/oauth";
import { googleConfig, newsroomReturnTo } from "../../src/auth/config";
import { beginGoogleRoundTrip, googleCookie, readGoogleRoundTrip } from "../../src/auth/google-round-trip";

const env = { BYLINE_GOOGLE_CLIENT_ID: "123.apps.googleusercontent.com", BYLINE_GOOGLE_CLIENT_SECRET: "client-secret-value", BYLINE_NEWSROOM_URL: "https://newsroom.example.com", BYLINE_INTEGRATIONS_SECRET: "x".repeat(40) };
const SECRET = "payload-secret";

describe("Analytics OAuth configuration", () => {
  it("shares the Google client but not newsroom sign-in's hosted-domain rule", () => {
    expect(googleConfig("/api", env)).toBeNull();
    const config = analyticsOAuthConfig("/api", env);
    expect(config).toMatchObject({ clientId: env.BYLINE_GOOGLE_CLIENT_ID, secure: true, callback: "https://newsroom.example.com/api/byline/analytics/callback" });
    expect(googleConfig("/api", { ...env, BYLINE_GOOGLE_HOSTED_DOMAIN: "weeklywildcat.com" })?.callback).toBe("https://newsroom.example.com/api/byline/auth/google/callback");
  });

  it("is read-only: openid, email and analytics.readonly, never analytics.edit", () => {
    expect([...ANALYTICS_SCOPES]).toEqual(["openid", "email", "https://www.googleapis.com/auth/analytics.readonly"]);
    expect(ANALYTICS_SCOPES.join(" ")).not.toContain("analytics.edit");
  });

  it("reports what is missing", () => {
    expect(analyticsSetupProblems("/api", {})).toHaveLength(2);
    expect(analyticsSetupProblems("/api", { ...env, BYLINE_INTEGRATIONS_SECRET: "short" })[0]).toMatch(/at least 32/);
    expect(analyticsSetupProblems("/api", env)).toEqual([]);
    expect(analyticsOAuthConfig("/api", { ...env, BYLINE_NEWSROOM_URL: "http://insecure.example.com" })).toBeNull();
  });
});

describe("Analytics authorization request", () => {
  const config = analyticsOAuthConfig("/api", env)!;
  const grant = beginAnalyticsGrant(config, SECRET, { userId: 7, returnTo: "/admin/site?tab=analytics" });
  const url = new URL(grant.url);

  it("uses the code flow with PKCE S256, offline access, incremental scopes and consent", () => {
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("code_challenge")).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(url.searchParams.get("state")).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(url.searchParams.get("nonce")).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("include_granted_scopes")).toBe("true");
    expect(url.searchParams.get("prompt")).toBe("consent");
    expect(url.searchParams.get("scope")).toBe(ANALYTICS_SCOPES.join(" "));
    expect(url.searchParams.get("hd")).toBeNull();
    expect(url.searchParams.get("redirect_uri")).toBe(config.callback);
  });

  it("sets a short-lived HttpOnly Lax cookie, Secure over https", () => {
    const cookie = googleCookie(true, grant.cookie, "analytics");
    expect(cookie).toMatch(/^__Host-byline-google-analytics=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).toMatch(/Secure/i);
  });

  it("completes only for the administrator who began it, with the state this browser holds", () => {
    const state = url.searchParams.get("state");
    expect(acceptAnalyticsCallback({ cookie: grant.cookie, state, payloadSecret: SECRET, sessionUserId: 7 })).toMatchObject({ binding: "7" });
    // Another signed-in account (even another administrator) can't complete it.
    expect(acceptAnalyticsCallback({ cookie: grant.cookie, state, payloadSecret: SECRET, sessionUserId: 8 })).toBeNull();
    // The callback is a cross-site arrival from Google, which carries no session; the signed transaction names the starter.
    expect(acceptAnalyticsCallback({ cookie: grant.cookie, state, payloadSecret: SECRET, sessionUserId: null })).toMatchObject({ binding: "7" });
    expect(acceptAnalyticsCallback({ cookie: grant.cookie, state, payloadSecret: SECRET })).toMatchObject({ binding: "7" });
    expect(acceptAnalyticsCallback({ cookie: grant.cookie, state: "a".repeat(43), payloadSecret: SECRET, sessionUserId: 7 })).toBeNull();
    expect(acceptAnalyticsCallback({ cookie: grant.cookie, state, payloadSecret: "other", sessionUserId: 7 })).toBeNull();
    expect(acceptAnalyticsCallback({ cookie: undefined, state, payloadSecret: SECRET, sessionUserId: 7 })).toBeNull();
  });

  it("cannot be replayed as a newsroom sign-in, or the reverse", () => {
    const state = url.searchParams.get("state");
    expect(readGoogleRoundTrip(grant.cookie, state, SECRET)).toBeNull();
    const signIn = beginGoogleRoundTrip("/admin", SECRET);
    expect(acceptAnalyticsCallback({ cookie: signIn.value, state: signIn.state, payloadSecret: SECRET, sessionUserId: 7 })).toBeNull();
    // A sign-in transaction has no binding at all.
    const unbound = beginGoogleRoundTrip("/admin", "byline-analytics:" + SECRET);
    expect(acceptAnalyticsCallback({ cookie: unbound.value, state: unbound.state, payloadSecret: SECRET, sessionUserId: 7 })).toBeNull();
  });

  it("only returns to paths inside the newsroom", () => {
    expect(newsroomReturnTo("https://evil.example/admin", "/admin")).toBe("/admin");
    expect(newsroomReturnTo("//evil.example", "/admin")).toBe("/admin");
    expect(newsroomReturnTo("/admin/site?tab=analytics", "/admin")).toBe("/admin/site?tab=analytics");
  });
});
