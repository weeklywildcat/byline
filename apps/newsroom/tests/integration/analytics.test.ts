import { createLocalReq, getPayload, type Payload } from "payload";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { readCurrentRevision } from "../../src/db/publication-state";
import { collectPublicSnapshot } from "../../src/public/snapshot/collect";
import { analyticsCache } from "../../src/analytics/cache";
import { forgetAccessTokens, readIntegration } from "../../src/analytics/connection";
import { REALTIME_WINDOW_MINUTES } from "../../src/analytics/realtime";
import type { User } from "../../src/payload-types";
import { ACCESS, createGoogleFake } from "../support/google-fake.mjs";

vi.mock("../../src/analytics/oauth", async (original) => ({ ...(await original<typeof import("../../src/analytics/oauth")>()), exchangeAnalyticsCode: vi.fn() }));

/**
 * Google Analytics against real PostgreSQL with Google's HTTP mocked (docs/google-analytics.md):
 * connect → choose property and stream → choose measurement → publish → reports, plus reconnect, change
 * property, disconnect, revoked access, a missing property, no web stream, a timezone mismatch, a partial
 * report failure, who may do what, and that no secret reaches a snapshot, a response or the database in plain text.
 */
const PATH_A = "/2026/11/10/news/a/";
const PATH_B = "/2026/11/10/news/b/";
const REFRESH = "1//SECRET-REFRESH-TOKEN-VALUE";
const CLIENT_SECRET = "oauth-client-secret-value-123456";

const fake = createGoogleFake();
const google = fake.state;
const realFetch = globalThis.fetch;
const fakeFetch = async (input: RequestInfo | URL, init?: RequestInit) => (await fake.handle(input, init)) ?? realFetch(input as never, init);

let payload: Payload;
const accounts: Record<string, User> = {};
const ids: Record<string, number> = {};
let endpoints: typeof import("../../src/analytics/endpoints");
let exchange: ReturnType<typeof vi.fn>;

async function account(key: string, role: User["role"], person?: number) {
  const user = await payload.create({ collection: "users", data: { email: `ga-${key}@example.test`, password: `pw-${key}-123456`, name: `${key} Account`, role, enabled: true, ...(person ? { linkedPerson: person } : {}) } });
  accounts[key] = { ...user, collection: "users" } as User;
}

type Call = { status: number; body: any; headers: Headers };
async function call(method: string, path: string, key: string | null, options: { data?: unknown; params?: Record<string, string | number>; query?: string; cookie?: string } = {}): Promise<Call> {
  const endpoint = endpoints.analyticsEndpoints.find((candidate) => candidate.method === method && candidate.path === path);
  if (!endpoint) throw new Error(`No endpoint ${method} ${path}`);
  const req = await createLocalReq(key ? { user: accounts[key] } : {}, payload);
  Object.assign(req, {
    routeParams: Object.fromEntries(Object.entries(options.params ?? {}).map(([k, v]) => [k, String(v)])), data: options.data ?? {},
    searchParams: new URLSearchParams(options.query ?? ""), headers: new Headers(options.cookie ? { cookie: options.cookie } : {})
  });
  const response = (await endpoint.handler(req)) as Response;
  const text = await response.text();
  let body: unknown = null;
  try { body = JSON.parse(text); } catch { body = text; }
  return { status: response.status, body, headers: response.headers };
}

function fixtures() {
  const story = (id: number) => `story:${id}`;
  google.fixtures = {
    "": [{ dims: [], metrics: [300, 120, 150, 7200], range: "current" }, { dims: [], metrics: [200, 100, 100, 5000], range: "previous" }],
    date: [{ dims: ["20261117"], metrics: [100, 50] }, { dims: ["20261118"], metrics: [200, 70] }],
    "contentId,pagePath,pageTitle": [
      { dims: [story(ids.a), "/a-path/", "A | Weekly Wildcat"], metrics: [120, 60, 3600, 20], range: "current" },
      { dims: ["(not set)", PATH_A, "A | Weekly Wildcat"], metrics: [30, 10, 300, 2], range: "current" },
      { dims: [story(ids.a), PATH_A, "A | Weekly Wildcat"], metrics: [100, 50, 1000, 0], range: "previous" },
      { dims: ["(not set)", PATH_B, "B | Weekly Wildcat"], metrics: [50, 30, 600, 1], range: "current" },
      { dims: ["(not set)", "/", "Weekly Wildcat"], metrics: [100, 70, 900, 0], range: "current" }
    ],
    sessionDefaultChannelGroup: [{ dims: ["Organic Search"], metrics: [90, 60, 70, 0.7] }, { dims: ["Direct"], metrics: [60, 40, 30, 0.5] }],
    deviceCategory: [{ dims: ["mobile"], metrics: [80] }, { dims: ["desktop"], metrics: [40] }],
    minutesAgo: [{ dims: ["00"], metrics: [5] }, { dims: ["03"], metrics: [2] }],
    unifiedScreenName: [{ dims: ["A | Weekly Wildcat"], metrics: [4] }, { dims: ["Some other page"], metrics: [1] }],
    country: [{ dims: ["United States"], metrics: [5] }],
    eventName: [{ dims: ["page_view"], metrics: [12] }, { dims: ["byline_read_50"], metrics: [3] }],
    // One Story's reports (its Byline ID or any address it has answered at).
    "contentId,pagePath": [{ dims: [story(ids.a), PATH_A], metrics: [120, 60, 3600, 20] }, { dims: ["(not set)", PATH_A], metrics: [30, 10, 300, 2] }],
    "date,contentId,pagePath": [{ dims: ["20261117", story(ids.a), PATH_A], metrics: [70, 30] }, { dims: ["20261118", "(not set)", PATH_A], metrics: [80, 40] }],
    "sessionDefaultChannelGroup,contentId,pagePath": [{ dims: ["Organic Search", story(ids.a), PATH_A], metrics: [90] }],
    "pageReferrer,contentId,pagePath": [{ dims: ["https://www.google.com/", story(ids.a), PATH_A], metrics: [80] }, { dims: ["https://weeklywildcat.com/", story(ids.a), PATH_A], metrics: [10] }],
    "deviceCategory,contentId,pagePath": [{ dims: ["mobile", story(ids.a), PATH_A], metrics: [50] }],
    "eventName,contentId,pagePath": [{ dims: ["byline_read_25", story(ids.a), PATH_A], metrics: [40] }, { dims: ["byline_read_50", story(ids.a), PATH_A], metrics: [25] }]
  };
  // The "no dimensions" realtime total shares the "" key with the overview totals; one row serves both.
}

beforeAll(async () => {
  Object.assign(process.env, { BYLINE_GOOGLE_CLIENT_ID: "123.apps.googleusercontent.com", BYLINE_GOOGLE_CLIENT_SECRET: CLIENT_SECRET, BYLINE_INTEGRATIONS_SECRET: "integration-secret-with-at-least-32-chars!", BYLINE_NEWSROOM_URL: "http://localhost:3010" });
  const url = new URL(process.env.DATABASE_URL!);
  url.pathname = `${url.pathname}_analytics`;
  process.env.DATABASE_URL = url.toString();
  vi.stubGlobal("fetch", fakeFetch);
  const { default: config } = await import("../../src/payload.config");
  payload = await getPayload({ config });
  endpoints = await import("../../src/analytics/endpoints");
  exchange = (await import("../../src/analytics/oauth")).exchangeAnalyticsCode as unknown as ReturnType<typeof vi.fn>;
  const personA = (await payload.create({ collection: "people", data: { name: "Writer A", slug: "ga-writer-a", status: "active" } })).id;
  const personB = (await payload.create({ collection: "people", data: { name: "Writer B", slug: "ga-writer-b", status: "active" } })).id;
  await account("admin", "administrator");
  await account("editor", "editor");
  await account("writerA", "staff", personA);
  await account("stranger", "staff", personB);
  const news = (await payload.create({ collection: "sections", data: { name: "News", slug: "news" } })).id;
  const publish = async (headline: string, slug: string, person: number) => (await payload.create({ collection: "stories", data: { headline, slug, section: news, contributors: [person], _status: "published", publishedAt: "2026-11-10T15:00:00.000Z" } as never, overrideAccess: true })).id;
  ids.a = await publish("A", "a", personA);
  ids.b = await publish("B", "b", personB);
  ids.draft = (await payload.create({ collection: "stories", draft: true, data: { headline: "Draft", section: news, contributors: [personA] } as never, overrideAccess: true })).id;
}, 300_000);

afterAll(async () => {
  vi.unstubAllGlobals();
  await payload?.db?.destroy?.();
});

beforeEach(() => {
  google.calls.length = 0;
  analyticsCache().clear();
  forgetAccessTokens();
  google.fail.clear();
  Object.assign(google, { revoked: false, rotate: null, revokeStatus: 200, missingProperty: false, noStreams: false, siteHtml: "<html></html>" });
  fixtures();
});

const grant = { refreshToken: REFRESH, email: "owner@gmail.com", subject: "google-sub-1", scopes: ["openid", "email", "https://www.googleapis.com/auth/analytics.readonly"] };
/** Where a response sends the browser: a redirect, or the same-origin refresh that ends the cross-site callback. */
const where = (response: Call) => response.headers.get("location") ?? /url=(.*)$/.exec(response.headers.get("refresh") ?? "")?.[1] ?? "";
const startAuth = async () => {
  const start = await call("get", "/byline/analytics/connect", "admin");
  expect(start.status).toBe(303);
  const location = new URL(start.headers.get("location")!);
  const cookie = start.headers.get("set-cookie")!.split(";")[0]!;
  return { location, cookie, state: location.searchParams.get("state")! };
};
async function connect(subject = grant.subject) {
  const auth = await startAuth();
  exchange.mockReset();
  exchange.mockResolvedValue({ ...grant, subject });
  const done = await call("get", "/byline/analytics/callback", null, { query: `state=${auth.state}&code=4/0AbCdE`, cookie: auth.cookie });
  expect(done.status).toBe(200);
  expect(done.headers.get("content-type")).toContain("text/html");
  expect(where(done)).toContain("analytics=connected");
}

describe("who may do what", () => {
  it("lets only administrators configure Analytics, editors read it, and others nothing publication-wide", async () => {
    for (const [method, path] of [["get", "/byline/analytics/connection"], ["get", "/byline/analytics/options"], ["post", "/byline/analytics/select"], ["patch", "/byline/analytics/measurement"], ["post", "/byline/analytics/verify"], ["delete", "/byline/analytics/connection"]] as const) {
      expect((await call(method, path, "editor")).status, `editor ${method} ${path}`).toBe(403);
      expect((await call(method, path, "writerA")).status).toBe(403);
      expect((await call(method, path, null)).status).toBe(401);
    }
    for (const path of ["overview", "realtime", "content", "acquisition", "audience", "events", "home"]) {
      expect((await call("get", `/byline/analytics/${path}`, "writerA")).status, path).toBe(403);
      expect((await call("get", `/byline/analytics/${path}`, null)).status).toBe(401);
      expect((await call("get", `/byline/analytics/${path}`, "editor")).status, path).toBe(200);
    }
    // The connect route redirects instead of failing for a non-administrator, and starts nothing.
    expect((await call("get", "/byline/analytics/connect", "editor")).headers.get("location")).toContain("analytics=forbidden");
  });

  it("says Analytics isn't connected, in words, before it is", async () => {
    const overview = await call("get", "/byline/analytics/overview", "editor");
    expect(overview.body.problem).toMatchObject({ code: "not-connected", title: "Google Analytics isn't connected" });
    expect((await call("get", "/byline/analytics/home", "editor")).body).toEqual({ data: null });
    expect((await call("get", "/byline/analytics/connection", "admin")).body).toMatchObject({ status: "disconnected", setupProblems: [] });
  });
});

describe("connecting", () => {
  it("binds the transaction to the signed-in administrator and keeps the token private", async () => {
    const auth = await startAuth();
    expect(auth.location.hostname).toBe("accounts.google.com");
    expect(auth.location.searchParams.get("scope")).toContain("analytics.readonly");
    expect(auth.location.searchParams.get("scope")).not.toContain("analytics.edit");
    // Another Byline account (even another administrator) can't complete this transaction.
    await account("admin2", "administrator");
    exchange.mockReset();
    exchange.mockResolvedValue(grant);
    const stolen = await call("get", "/byline/analytics/callback", "admin2", { query: `state=${auth.state}&code=4/0AbCdE`, cookie: auth.cookie });
    expect(where(stolen)).toContain("analytics=failed");
    expect(exchange).not.toHaveBeenCalled();
    expect((await readIntegration(payload)).status).toBe("disconnected");
    // A wrong state, no cookie, and a denied consent all end without a grant.
    expect(where(await call("get", "/byline/analytics/callback", "admin", { query: `state=${"a".repeat(43)}&code=x`, cookie: auth.cookie }))).toContain("analytics=failed");
    expect(where(await call("get", "/byline/analytics/callback", "admin", { query: `state=${auth.state}&code=x` }))).toContain("analytics=failed");
    expect(where(await call("get", "/byline/analytics/callback", "admin", { query: `state=${auth.state}&error=access_denied`, cookie: auth.cookie }))).toContain("analytics=denied");
    expect((await readIntegration(payload)).status).toBe("disconnected");

    // An administrator who is demoted before Google answers can't finish a connection they started.
    await account("admin3", "administrator");
    const started = await call("get", "/byline/analytics/connect", "admin3");
    const startedState = new URL(started.headers.get("location")!).searchParams.get("state")!;
    await payload.update({ collection: "users", id: accounts.admin3!.id, data: { role: "editor" }, overrideAccess: true });
    exchange.mockReset();
    exchange.mockResolvedValue(grant);
    expect(where(await call("get", "/byline/analytics/callback", null, { query: `state=${startedState}&code=4/0AbCdE`, cookie: started.headers.get("set-cookie")!.split(";")[0]! }))).toContain("analytics=forbidden");
    expect(exchange).not.toHaveBeenCalled();
    expect((await readIntegration(payload)).status).toBe("disconnected");
    // Google's redirect back is a cross-site navigation, which carries no session: the signed transaction is what binds it.
    await connect();
    const state = await readIntegration(payload);
    expect(state).toMatchObject({ status: "pending-selection", googleAccountEmail: "owner@gmail.com", propertyResource: null });
    // Stored only as an AES-GCM envelope.
    const row = await payload.db.findGlobal({ slug: "analytics-integration" });
    expect(JSON.stringify(row)).not.toContain(REFRESH);
    expect(state.encryptedRefreshToken).toMatchObject({ version: 1 });
    // Not readable through Payload's own API or the browser-facing DTO.
    await expect(payload.findGlobal({ slug: "analytics-integration", req: await createLocalReq({ user: accounts.admin }, payload), overrideAccess: false })).rejects.toBeTruthy();
    const dto = await call("get", "/byline/analytics/connection", "admin");
    expect(JSON.stringify(dto.body)).not.toMatch(new RegExp(`${REFRESH}|${ACCESS}|${CLIENT_SECRET}|encryptedRefreshToken|ciphertext`));
  });

  it("lists every accessible property, marks the matching stream Recommended and warns on a timezone mismatch", async () => {
    const accountsOnly = await call("get", "/byline/analytics/options", "admin");
    expect(accountsOnly.body.accounts.map((item: { displayName: string }) => item.displayName)).toEqual(["Weekly Wildcat", "Someone else"]);
    const options = await call("get", "/byline/analytics/options", "admin", { query: "property=properties/10" });
    expect(options.body.streams.map((stream: { displayName: string; recommended: boolean }) => [stream.displayName, stream.recommended])).toEqual([["Main site", true], ["Preview", false]]);
    expect(options.body.timeZoneWarning).toBe("Analytics uses America/Chicago while Byline uses America/New_York. Daily Analytics reports follow the Analytics property's timezone.");
    // A property the Google user can't see is refused.
    expect((await call("get", "/byline/analytics/options", "admin", { query: "property=properties/999" })).body.problem.code).toBe("property-unavailable");
  });

  it("shows only web streams, and says so when a property has none", async () => {
    const options = await call("get", "/byline/analytics/options", "admin", { query: "property=properties/30" });
    expect(options.body.streams).toEqual([]);
    google.noStreams = true;
    expect((await call("get", "/byline/analytics/options", "admin", { query: "property=properties/10" })).body.streams).toEqual([]);
    google.noStreams = false;
  });

  it("refuses a stream that isn't in the chosen property, and a property Google no longer shows", async () => {
    expect((await call("post", "/byline/analytics/select", "admin", { data: { property: "properties/10", stream: "properties/20/dataStreams/3" } })).status).toBe(400);
    expect((await call("post", "/byline/analytics/select", "admin", { data: { property: "properties/10", stream: "properties/10/dataStreams/99" } })).status).toBe(409);
    google.missingProperty = true;
    expect((await call("post", "/byline/analytics/select", "admin", { data: { property: "properties/10", stream: "properties/10/dataStreams/1" } })).status).toBe(409);
    google.missingProperty = false;
  });
});

describe("choosing measurement and publishing it", () => {
  it("saves the property and stream, and doesn't change the public site until it is published", async () => {
    const selected = await call("post", "/byline/analytics/select", "admin", { data: { property: "properties/10", stream: "properties/10/dataStreams/1" } });
    expect(selected.status).toBe(200);
    expect(selected.body).toMatchObject({ status: "connected", measurementId: "G-MAIN12345", trackingMode: "external", property: { id: "10", timeZone: "America/Chicago" }, publishedMatches: true });
    const before = await readCurrentRevision(payload);
    // Already installed: publishing the choice puts no tag, ID or consent UI on the public site.
    await call("patch", "/byline/analytics/measurement", "admin", { data: { trackingMode: "external", publish: true } });
    const settled = await readCurrentRevision(payload);
    expect(settled).toBeGreaterThanOrEqual(before);
    expect((await collectPublicSnapshot(payload, { revision: settled })).publication.analytics).toBeNull();
    // ...and choosing it again changes nothing at all.
    expect((await call("patch", "/byline/analytics/measurement", "admin", { data: { trackingMode: "external", publish: true } })).body.published.changed).toBe(false);
    expect(await readCurrentRevision(payload)).toBe(settled);
  });

  it("installs with Byline through the public revision path, carrying only the Measurement ID and tag behavior", async () => {
    const before = await readCurrentRevision(payload);
    const saved = await call("patch", "/byline/analytics/measurement", "admin", { data: { trackingMode: "byline", consentMode: "ask" } });
    // Saved privately: the public site is untouched until the explicit publish.
    expect(saved.body.connection).toMatchObject({ trackingMode: "byline", consentMode: "ask", publishedMatches: false });
    expect(await readCurrentRevision(payload)).toBe(before);
    const published = await call("patch", "/byline/analytics/measurement", "admin", { data: { trackingMode: "byline", consentMode: "ask", publish: true } });
    expect(published.body.published.changed).toBe(true);
    const revision = await readCurrentRevision(payload);
    expect(revision).toBeGreaterThan(before);
    const snapshot = await collectPublicSnapshot(payload, { revision });
    expect(snapshot.publication.analytics).toEqual({ provider: "google", measurementId: "G-MAIN12345", installTag: true, consentMode: "ask" });
    // Nothing else about the connection is public.
    const serialized = JSON.stringify(snapshot);
    for (const secret of [REFRESH, ACCESS, CLIENT_SECRET, "properties/10", "owner@gmail.com", "google-sub-1", "G-PREV12345", "America/Chicago"]) expect(serialized, secret).not.toContain(secret);
    // Publishing the same choice again changes nothing.
    expect((await call("patch", "/byline/analytics/measurement", "admin", { data: { trackingMode: "byline", consentMode: "ask", publish: true } })).body.published.changed).toBe(false);
    expect(await readCurrentRevision(payload)).toBe(revision);
  });

  it("can't be changed by publishing an older Publication draft", async () => {
    const stale = await payload.findGlobal({ slug: "publication", draft: true, overrideAccess: true });
    await payload.updateGlobal({ slug: "publication", draft: false, overrideAccess: true, data: { ...(stale as object), analytics: { installTag: false, measurementId: "", consentMode: "always" }, _status: "published" } as never });
    const snapshot = await collectPublicSnapshot(payload, { revision: await readCurrentRevision(payload) });
    expect(snapshot.publication.analytics).toEqual({ provider: "google", measurementId: "G-MAIN12345", installTag: true, consentMode: "ask" });
  });

  it("flags a changed property as saved-but-not-published until it is published again", async () => {
    const changed = await call("post", "/byline/analytics/select", "admin", { data: { property: "properties/20", stream: "properties/20/dataStreams/3" } });
    expect(changed.body).toMatchObject({ measurementId: "G-STAGE1234", publishedMatches: false });
    expect((await collectPublicSnapshot(payload, { revision: await readCurrentRevision(payload) })).publication.analytics?.measurementId).toBe("G-MAIN12345");
    await call("post", "/byline/analytics/select", "admin", { data: { property: "properties/10", stream: "properties/10/dataStreams/1" } });
    expect((await call("get", "/byline/analytics/connection", "admin")).body.publishedMatches).toBe(true);
  });
});

describe("reports", () => {
  it("joins Google's rows to Stories and compares with the previous period", async () => {
    const overview = (await call("get", "/byline/analytics/overview", "editor", { query: "preset=7d" })).body.data;
    expect(overview.meta.range).toMatchObject({ preset: "7d", timeZone: "America/Chicago", days: 7 });
    expect(overview.totals.data.views).toMatchObject({ current: 300, previous: 200, ratio: 0.5 });
    expect(overview.totals.data.engagement.current).toBe(60);
    expect(overview.series.data).toHaveLength(7);
    const top = overview.topStories.data;
    // A's two rows (content ID and legacy path) are one Story, counted once.
    expect(top.map((row: { story: { id: number }; views: number }) => [row.story.id, row.views])).toEqual([[ids.a, 150], [ids.b, 50]]);
    expect(top[0].viewsChange).toMatchObject({ current: 150, previous: 100 });
    expect(overview.channels.data[0]).toMatchObject({ label: "Search", sessions: 90 });
    // Related reports went out as one batch, not one request each.
    expect(google.calls.filter((entry) => entry.endsWith(":batchRunReports"))).toHaveLength(1);
    expect(google.calls.filter((entry) => entry.endsWith(":runReport"))).toHaveLength(0);
  });

  it("serves the second request from the server cache, and Refresh asks Google again", async () => {
    await call("get", "/byline/analytics/overview", "editor", { query: "preset=7d" });
    const calls = google.calls.length;
    const again = await call("get", "/byline/analytics/overview", "editor", { query: "preset=7d" });
    expect(again.body.data.meta.cached).toBe(true);
    expect(google.calls.length).toBe(calls);
    await call("get", "/byline/analytics/overview", "editor", { query: "preset=7d&refresh=1" });
    expect(google.calls.length).toBeGreaterThan(calls);
  });

  it("separates Stories from other pages and filters by Byline's own metadata", async () => {
    const content = (await call("get", "/byline/analytics/content", "editor", { query: "preset=28d" })).body.data;
    expect(content.stories.data.map((row: { story: { id: number } }) => row.story.id)).toEqual([ids.a, ids.b]);
    expect(content.otherPages.data.map((row: { path: string }) => row.path)).toEqual(["/"]);
    expect(content.facets.sections).toEqual([{ slug: "news", name: "News" }]);
    const one = (await call("get", "/byline/analytics/content", "editor", { query: `story=${ids.b}` })).body.data;
    expect(one.stories.data.map((row: { story: { id: number } }) => row.story.id)).toEqual([ids.b]);
    expect((await call("get", "/byline/analytics/content", "editor", { query: "section=sports" })).body.data.stories.data).toEqual([]);
  });

  it("shows Realtime by exact page title and never by a guessed Story", async () => {
    google.fixtures[""] = [{ dims: [], metrics: [5] }];
    const realtime = (await call("get", "/byline/analytics/realtime", "editor")).body.data;
    expect(realtime.windowMinutes).toBe(REALTIME_WINDOW_MINUTES);
    expect(realtime.activity).toHaveLength(30);
    expect(realtime.pages[0]).toMatchObject({ title: "A | Weekly Wildcat", activeUsers: 4, story: { id: ids.a } });
    expect(realtime.pages[1]).toMatchObject({ title: "Some other page", story: null });
    expect(realtime.events.find((event: { name: string }) => event.name === "byline_read_50").label).toBe("Read 50%");
    const home = (await call("get", "/byline/analytics/home", "editor")).body.data;
    expect(home).toMatchObject({ activeUsers: 5, top: { activeUsers: 4, story: { id: ids.a } } });
  });

  it("keeps the rest of a screen when one report fails", async () => {
    google.fail.add("contentId,pagePath,pageTitle");
    const overview = (await call("get", "/byline/analytics/overview", "editor", { query: "preset=28d" })).body.data;
    expect(overview.topStories).toMatchObject({ ok: false, problem: { code: "unavailable", title: "Google Analytics is temporarily unavailable", retryable: true } });
    expect(overview.totals.ok).toBe(true);
    expect(overview.channels.ok).toBe(true);
  });

  it("answers acquisition, audience and events", async () => {
    google.fixtures.sessionSourceMedium = [{ dims: ["google / organic"], metrics: [90, 60, 0.7] }];
    google.fixtures["landingPage,sessionSourceMedium"] = [{ dims: ["/2026/11/10/news/a/", "google / organic"], metrics: [40, 0.8] }];
    const acquisition = (await call("get", "/byline/analytics/acquisition", "editor")).body.data;
    expect(acquisition.landing.data[0]).toMatchObject({ story: { id: ids.a }, sessions: 40 });
    google.fixtures.newVsReturning = [{ dims: ["new"], metrics: [30, 30] }, { dims: ["returning"], metrics: [20, 0] }];
    const audience = (await call("get", "/byline/analytics/audience", "editor")).body.data;
    expect(audience.readers.data).toMatchObject({ activeUsers: 50, returningUsers: 20 });
    expect(JSON.stringify(audience)).not.toMatch(/"city"|age|gender/i);
    const events = (await call("get", "/byline/analytics/events", "editor")).body.data;
    expect(events.events.data.find((row: { name: string }) => row.name === "page_view").label).toBe("Page views");
  });
});

describe("Story performance", () => {
  it("follows Story access, not the publication-wide desk", async () => {
    const own = await call("get", "/byline/stories/:id/analytics", "writerA", { params: { id: ids.a } });
    expect(own.status).toBe(200);
    expect(own.body.data.story).toMatchObject({ id: ids.a, published: true });
    expect(own.body.data.totals.data).toMatchObject({ views: 150 });
    // A published Story is readable by staff, so it reports; a Story this account can't open doesn't exist here.
    expect((await call("get", "/byline/stories/:id/analytics", "stranger", { params: { id: ids.a } })).status).toBe(200);
    expect((await call("get", "/byline/stories/:id/analytics", "stranger", { params: { id: ids.draft } })).status).toBe(404);
    expect((await call("get", "/byline/stories/:id/analytics", "writerA", { params: { id: ids.draft } })).status).toBe(200);
    expect((await call("get", "/byline/stories/:id/analytics", "editor", { params: { id: ids.b } })).status).toBe(200);
    expect((await call("get", "/byline/stories/:id/analytics", null, { params: { id: ids.a } })).status).toBe(401);
  });

  it("matches the Story's own title for readers right now, and reports an unpublished Story as having none", async () => {
    google.fixtures[""] = [{ dims: [], metrics: [4] }];
    const performance = (await call("get", "/byline/stories/:id/analytics", "writerA", { params: { id: ids.a } })).body.data;
    expect(performance.readingNow).toEqual({ ok: true, data: { readers: 4 } });
    const draft = await call("get", "/byline/stories/:id/analytics", "writerA", { params: { id: ids.draft } });
    expect(draft.body).toMatchObject({ data: null, published: false });
    expect(google.calls.some((entry) => entry.includes(String(ids.draft)))).toBe(false);
  });
});

describe("keeping the connection healthy", () => {
  it("checks access, property, stream, reporting and the public tag independently", async () => {
    google.siteHtml = "<html><body>nothing here</body></html>";
    const pending = (await call("post", "/byline/analytics/verify", "admin")).body;
    expect(pending.checks.map((check: { key: string; state: string }) => [check.key, check.state])).toEqual([["access", "ok"], ["property", "ok"], ["stream", "ok"], ["reporting", "ok"], ["tag", "warn"]]);
    // Byline installs the tag and it is published, but the public site doesn't carry it yet.
    expect(pending.summary).toMatchObject({ state: "site-pending", title: "Site update pending" });
    google.siteHtml = '<script id="byline-analytics-config">{"measurementId":"G-MAIN12345"}</script>';
    const live = (await call("post", "/byline/analytics/verify", "admin")).body;
    expect(live.checks.find((check: { key: string }) => check.key === "tag").state).toBe("ok");
    expect(live.summary.state).toBe("connected");
    expect((await readIntegration(payload)).lastVerifiedAt).toBeTruthy();
  });

  it("doesn't call the connection broken just because nobody is reading right now", async () => {
    google.siteHtml = "G-MAIN12345";
    google.fixtures[""] = [{ dims: [], metrics: [0] }];
    expect((await call("post", "/byline/analytics/verify", "admin")).body.summary).toMatchObject({ state: "connected-quiet", title: "Connected · no recent traffic" });
  });

  it("notices a stream whose Measurement ID changed", async () => {
    const state = await readIntegration(payload);
    await payload.updateGlobal({ slug: "analytics-integration", data: { measurementId: "G-OLDID1234" }, overrideAccess: true });
    const result = (await call("post", "/byline/analytics/verify", "admin")).body;
    expect(result.checks.find((check: { key: string }) => check.key === "stream")).toMatchObject({ state: "fail" });
    await payload.updateGlobal({ slug: "analytics-integration", data: { measurementId: state.measurementId }, overrideAccess: true });
  });

  it("stores a rotated refresh token, still encrypted", async () => {
    const before = (await readIntegration(payload)).encryptedRefreshToken!.ciphertext;
    google.rotate = "1//ROTATED-REFRESH-TOKEN";
    await call("get", "/byline/analytics/overview", "editor", { query: "preset=28d" });
    google.rotate = null;
    const after = await readIntegration(payload);
    expect(after.encryptedRefreshToken!.ciphertext).not.toBe(before);
    expect(JSON.stringify(await payload.db.findGlobal({ slug: "analytics-integration" }))).not.toContain("ROTATED-REFRESH-TOKEN");
  });

  it("turns revoked Google access into a reconnect state, then recovers on reconnect", async () => {
    google.revoked = true;
    const report = await call("get", "/byline/analytics/overview", "editor", { query: "preset=90d" });
    expect(report.status).toBe(200);
    expect(report.body.problem).toMatchObject({ code: "needs-reconnect", title: "Google access needs to be renewed" });
    expect((await readIntegration(payload)).status).toBe("needs-reconnect");
    expect((await call("get", "/byline/analytics/connection", "admin")).body.status).toBe("needs-reconnect");
    expect((await call("get", "/byline/analytics/home", "editor")).body).toEqual({ data: null });
    expect((await call("post", "/byline/analytics/verify", "admin")).body.summary.state).toBe("needs-reconnect");
    google.revoked = false;
    await connect();
    // The same Google account keeps its property and stream.
    expect((await call("get", "/byline/analytics/connection", "admin")).body).toMatchObject({ status: "connected", measurementId: "G-MAIN12345" });
    expect((await call("get", "/byline/analytics/overview", "editor", { query: "preset=90d" })).body.problem).toBeNull();
  });

  it("makes a different Google account choose again", async () => {
    await connect("google-sub-2");
    expect((await call("get", "/byline/analytics/connection", "admin")).body).toMatchObject({ status: "pending-selection", property: null, measurementId: null });
    await call("post", "/byline/analytics/select", "admin", { data: { property: "properties/10", stream: "properties/10/dataStreams/1" } });
    await call("patch", "/byline/analytics/measurement", "admin", { data: { trackingMode: "byline", consentMode: "always", publish: true } });
    expect((await collectPublicSnapshot(payload, { revision: await readCurrentRevision(payload) })).publication.analytics).toEqual({ provider: "google", measurementId: "G-MAIN12345", installTag: true, consentMode: "always" });
  });
});

describe("disconnecting", () => {
  it("revokes at Google, forgets everything and removes a Byline-installed tag from the next deployment", async () => {
    const before = await readCurrentRevision(payload);
    const result = await call("delete", "/byline/analytics/connection", "admin");
    expect(result.body).toMatchObject({ revoked: true, publicationUpdated: true, connection: { status: "disconnected", property: null, measurementId: null } });
    expect(google.calls).toContain("revoke");
    const state = await readIntegration(payload);
    expect(state).toMatchObject({ status: "disconnected", encryptedRefreshToken: null, googleAccountEmail: null, grantedScopes: [] });
    const revision = await readCurrentRevision(payload);
    expect(revision).toBeGreaterThan(before);
    expect((await collectPublicSnapshot(payload, { revision })).publication.analytics).toBeNull();
    expect((await call("get", "/byline/analytics/overview", "editor")).body.problem.code).toBe("not-connected");
  });

  it("still disconnects locally when Google can't revoke", async () => {
    await connect();
    await call("post", "/byline/analytics/select", "admin", { data: { property: "properties/10", stream: "properties/10/dataStreams/1" } });
    google.revokeStatus = 500;
    const result = await call("delete", "/byline/analytics/connection", "admin");
    expect(result.body).toMatchObject({ revoked: false, connection: { status: "disconnected" } });
    expect((await readIntegration(payload)).encryptedRefreshToken).toBeNull();
    google.revokeStatus = 200;
  });
});
