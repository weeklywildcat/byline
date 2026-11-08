import { afterEach, describe, expect, it, vi } from "vitest";
import { googleConfig, newsroomReturnTo } from "../src/auth/config";
import { beginGoogleRoundTrip, readGoogleRoundTrip } from "../src/auth/google-round-trip";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("login boundary", () => {
  it("rejects incomplete or insecure Google configuration", () => {
    const env = {
      NODE_ENV: "test" as const,
      BYLINE_GOOGLE_CLIENT_ID: "test.apps.googleusercontent.com",
      BYLINE_GOOGLE_CLIENT_SECRET: "fixture",
      BYLINE_GOOGLE_HOSTED_DOMAIN: "weeklywildcat.com",
      BYLINE_NEWSROOM_URL: "http://localhost:3010",
    };
    expect(googleConfig("/api", env)?.callback).toBe("http://localhost:3010/api/byline/auth/google/callback");
    expect(googleConfig("/api", { ...env, BYLINE_GOOGLE_CLIENT_SECRET: "" })).toBeNull();
    expect(googleConfig("/api", { ...env, NODE_ENV: "production" })).toBeNull();
    expect(googleConfig("/api", { ...env, BYLINE_NEWSROOM_URL: "https://example.test/wrong-path" })).toBeNull();
  });

  it("accepts only normalized newsroom redirects", () => {
    expect(newsroomReturnTo("/admin/stories?view=mine", "/admin")).toBe("/admin/stories?view=mine");
    for (const value of ["//example.test", "/\\example.test", "https://example.test", "/%2fexample.test",
      "/admin/../preview", "/administer", "/admin/%252f..", "/admin/%2e%2e/elsewhere", ["/admin/stories"]]) {
      expect(newsroomReturnTo(value, "/admin")).toBe("/admin");
    }
  });

  it("requires the initiating cookie, matching state and an unexpired signed round trip", () => {
    vi.useFakeTimers();
    const trip = beginGoogleRoundTrip("/admin/stories", "fixture");
    expect(readGoogleRoundTrip(trip.value, trip.state, "fixture")).toMatchObject({
      nonce: trip.nonce, returnTo: "/admin/stories",
    });
    expect(readGoogleRoundTrip(undefined, trip.state, "fixture")).toBeNull();
    expect(readGoogleRoundTrip(trip.value, "a".repeat(43), "fixture")).toBeNull();
    expect(readGoogleRoundTrip(trip.value, trip.state, "other-secret")).toBeNull();
    vi.advanceTimersByTime(10 * 60_000);
    expect(readGoogleRoundTrip(trip.value, trip.state, "fixture")).toBeNull();
  });
});

it("loads photos off the request path, coalesces refreshes and excludes untrusted records", async () => {
  vi.stubEnv("BYLINE_UNSPLASH_ACCESS_KEY", "server-fixture-photo-key");
  vi.resetModules();
  const { loginPhoto } = await import("../src/auth/unsplash");
  const photo = {
    width: 2400, height: 1600, urls: { regular: "https://images.unsplash.com/photo-fixture" },
    user: { name: "Photographer", links: { html: "https://unsplash.com/@photo" } },
    links: { html: "https://unsplash.com/photos/example" },
  };
  const fetch = vi.fn().mockResolvedValue(Response.json([
    { ...photo, width: 1200 }, { ...photo, urls: { regular: "https://bad.test/photo" } },
    { ...photo, user: { ...photo.user, name: "server-fixture-photo-key" } }, photo,
  ]));
  vi.stubGlobal("fetch", fetch);
  const schedule = vi.fn<(task: () => Promise<void>) => void>();
  expect(loginPhoto(schedule)).toBeUndefined();
  expect(loginPhoto(schedule)).toBeUndefined();
  expect(fetch).not.toHaveBeenCalled();
  expect(schedule).toHaveBeenCalledTimes(1);
  await schedule.mock.calls[0][0]();
  expect(loginPhoto(schedule)).toEqual({
    image: photo.urls.regular, name: "Photographer",
    photographer: "https://unsplash.com/@photo?utm_source=weekly_wildcat_cms&utm_medium=referral",
    photo: "https://unsplash.com/photos/example?utm_source=weekly_wildcat_cms&utm_medium=referral",
  });
  expect(schedule).toHaveBeenCalledTimes(1);
});

describe("expired session", () => {
  it("sends an anonymous visitor to login carrying the address they wanted", async () => {
    const { loginRedirectUrl } = await import("../src/auth/session");
    const base = { admin: "/admin", login: "/login" };
    expect(loginRedirectUrl(base)).toBe("/admin/login?redirect=%2Fadmin");
    expect(loginRedirectUrl({ ...base, segments: ["stories"], searchParams: { view: "mine", redirect: "/x" } }))
      .toBe("/admin/login?redirect=%2Fadmin%2Fstories%3Fview%3Dmine");
    // What the login view will accept back is exactly this address.
    expect(newsroomReturnTo("/admin/stories?view=mine", "/admin")).toBe("/admin/stories?view=mine");
  });

  it("returns to the Collections workspace and preserves the open collection after login", async () => {
    const { loginRedirectUrl } = await import("../src/auth/session");
    const login = new URL(loginRedirectUrl({
      admin: "/admin",
      login: "/login",
      segments: ["byline-collections"],
      searchParams: { collection: "12", tab: "reporting", interview: "34" },
    }), "https://newsroom.example");
    const returnTo = login.searchParams.get("redirect");
    expect(newsroomReturnTo(returnTo, "/admin")).toBe("/admin/collections?collection=12&tab=reporting&interview=34");
  });

  it("redirects only when there is no user, so a disabled account still sees why", async () => {
    const { redirectIfSignedOut } = await import("../src/auth/session");
    const payload = { config: { routes: { admin: "/admin" }, admin: { routes: { login: "/login" } } } } as never;
    let thrown: { digest?: string } | undefined;
    try { redirectIfSignedOut({ req: { user: null, payload } as never, params: { segments: ["calendar"] } }); }
    catch (error) { thrown = error as { digest?: string }; }
    expect(thrown?.digest).toContain("NEXT_REDIRECT;replace;/admin/login?redirect=%2Fadmin%2Fcalendar");
    expect(() => redirectIfSignedOut({ req: { user: { id: 1, enabled: false }, payload } as never })).not.toThrow();
  });
});
