import { describe, expect, it, vi } from "vitest";
import { getProperty, hostnameOf, listAccountSummaries, listWebStreams, recommendStream, timeZoneWarning } from "../../src/analytics/admin-client";
import { batchRunReports, MAX_BATCH_REPORTS, parseReport, reportBody, runRealtimeReport, runReport } from "../../src/analytics/data-client";
import { classifyGoogleFailure, isRevokedGrant } from "../../src/analytics/errors";
import { createLimiter, googleJson, propertyResource, retryDelay, type FetchLike } from "../../src/analytics/google-client";

const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const sleep = async () => undefined;

describe("Google API client", () => {
  it("sends the bearer token and returns JSON", async () => {
    const seen: RequestInit[] = [];
    const fetch: FetchLike = async (_, init) => { seen.push(init); return reply({ ok: true }); };
    await expect(googleJson("https://x.example", "tok", { fetch })).resolves.toEqual({ ok: true });
    expect((seen[0]!.headers as Record<string, string>).Authorization).toBe("Bearer tok");
  });

  it("retries only 429, 500 and 503, with bounded backoff", async () => {
    let calls = 0;
    const fetch: FetchLike = async () => (++calls < 3 ? reply({ error: { status: "UNAVAILABLE" } }, 503) : reply({ done: true }));
    await expect(googleJson("https://x.example", "t", { fetch, sleep })).resolves.toEqual({ done: true });
    expect(calls).toBe(3);
    let tries = 0;
    await expect(googleJson("https://x.example", "t", { fetch: async () => { tries++; return reply({}, 401); }, sleep })).rejects.toMatchObject({ code: "needs-reconnect" });
    expect(tries).toBe(1);
    let always = 0;
    await expect(googleJson("https://x.example", "t", { fetch: async () => { always++; return reply({}, 500); }, sleep })).rejects.toMatchObject({ code: "unavailable" });
    expect(always).toBe(3);
    expect(retryDelay(0, () => 0)).toBe(400);
    expect(retryDelay(10, () => 0)).toBe(4000);
  });

  it("turns provider failures into Byline states without leaking the payload", async () => {
    expect(classifyGoogleFailure(403, { error: { details: [{ reason: "SERVICE_DISABLED" }] } }).code).toBe("api-disabled");
    expect(classifyGoogleFailure(403, { error: { message: "User does not have sufficient permissions" } }).code).toBe("property-unavailable");
    expect(classifyGoogleFailure(403, { error: { details: [{ reason: "ACCESS_TOKEN_SCOPE_INSUFFICIENT" }] } }).code).toBe("needs-reconnect");
    expect(classifyGoogleFailure(404, {}).code).toBe("property-unavailable");
    expect(classifyGoogleFailure(429, { error: { status: "RESOURCE_EXHAUSTED" } }).code).toBe("quota");
    expect(classifyGoogleFailure(400, {}).code).toBe("bad-request");
    const secret = "ya29.SECRET-ACCESS-TOKEN";
    const error = classifyGoogleFailure(500, { error: { message: secret } });
    expect(error.message + JSON.stringify(error.problem)).not.toContain(secret);
    expect(isRevokedGrant({ response: { data: { error: "invalid_grant" } } })).toBe(true);
    expect(isRevokedGrant(new Error("Token has been expired or revoked."))).toBe(true);
    expect(isRevokedGrant(new Error("ECONNRESET"))).toBe(false);
  });

  it("keeps concurrency below Google's ceiling", async () => {
    const limiter = createLimiter(5);
    let running = 0, peak = 0;
    await Promise.all(Array.from({ length: 20 }, () => limiter.run(async () => { running++; peak = Math.max(peak, running); await new Promise((resolve) => setTimeout(resolve, 2)); running--; })));
    expect(peak).toBe(5);
  });

  it("validates property resources", () => {
    expect(propertyResource("123")).toBe("properties/123");
    expect(propertyResource("properties/123")).toBe("properties/123");
    expect(() => propertyResource("123/../../x")).toThrow();
  });
});

describe("Admin API", () => {
  it("lists every account and property across pages", async () => {
    const pages = [
      { accountSummaries: [{ account: "accounts/1", displayName: "Newsroom", propertySummaries: [{ property: "properties/10", displayName: "Site" }, { property: "bad", displayName: "x" }] }], nextPageToken: "n" },
      { accountSummaries: [{ account: "accounts/2", displayName: "Other", propertySummaries: [{ property: "properties/20", displayName: "Blog" }] }, { account: "accounts/3", displayName: "Empty", propertySummaries: [] }] }
    ];
    let page = 0;
    const accounts = await listAccountSummaries("t", { fetch: async () => reply(pages[page++]) });
    expect(accounts.map((a) => [a.account, a.properties.map((p) => p.propertyId)])).toEqual([["accounts/1", ["10"]], ["accounts/2", ["20"]]]);
  });

  it("shows only web streams and the facts Byline needs", async () => {
    const streams = await listWebStreams("t", "properties/10", { fetch: async () => reply({ dataStreams: [
      { name: "properties/10/dataStreams/1", type: "WEB_DATA_STREAM", displayName: "Web", webStreamData: { measurementId: "G-ABC123XYZ", defaultUri: "https://www.weeklywildcat.com" } },
      { name: "properties/10/dataStreams/2", type: "ANDROID_APP_DATA_STREAM", displayName: "App" },
      { name: "properties/10/dataStreams/3", type: "WEB_DATA_STREAM", displayName: "Broken", webStreamData: { measurementId: "nope", defaultUri: "https://x.example" } }
    ] }) });
    expect(streams).toEqual([{ stream: "properties/10/dataStreams/1", displayName: "Web", defaultUri: "https://www.weeklywildcat.com", hostname: "weeklywildcat.com", measurementId: "G-ABC123XYZ" }]);
  });

  it("recommends a stream only when it uniquely matches the public site", () => {
    const streams = [{ hostname: "weeklywildcat.com", id: 1 }, { hostname: "staging.example.com", id: 2 }];
    expect(recommendStream(streams, "https://weeklywildcat.com/")?.id).toBe(1);
    expect(recommendStream(streams, "https://www.weeklywildcat.com")?.id).toBe(1);
    expect(recommendStream([...streams, { hostname: "weeklywildcat.com", id: 3 }], "https://weeklywildcat.com")).toBeNull();
    expect(recommendStream(streams, "https://unrelated.org")).toBeNull();
    expect(hostnameOf("WWW.Example.com/path")).toBe("example.com");
  });

  it("warns, without blocking, when the property's timezone differs", () => {
    expect(timeZoneWarning("America/Chicago", "America/New_York")).toBe("Analytics uses America/Chicago while Byline uses America/New_York. Daily Analytics reports follow the Analytics property's timezone.");
    expect(timeZoneWarning("America/New_York", "America/New_York")).toBeNull();
    expect(timeZoneWarning(null, "America/New_York")).toBeNull();
  });

  it("reads a property's timezone and refuses an invalid one", async () => {
    await expect(getProperty("t", "properties/10", { fetch: async () => reply({ displayName: "Site", timeZone: "America/Chicago" }) })).resolves.toEqual({ property: "properties/10", displayName: "Site", timeZone: "America/Chicago" });
    await expect(getProperty("t", "properties/10", { fetch: async () => reply({ displayName: "Site", timeZone: "Mars/Olympus" }) })).rejects.toBeTruthy();
  });
});

describe("Data API", () => {
  const table = { dimensionHeaders: [{ name: "date" }, { name: "dateRange" }], metricHeaders: [{ name: "screenPageViews" }], rows: [{ dimensionValues: [{ value: "20261101" }, { value: "current" }], metricValues: [{ value: "42" }] }], rowCount: 1 };

  it("parses rows by header name", () => {
    expect(parseReport(table).rows[0]).toEqual({ dims: { date: "20261101", dateRange: "current" }, metrics: { screenPageViews: 42 } });
    expect(parseReport(null).rows).toEqual([]);
  });

  it("builds a request that asks for property quota", () => {
    const body = reportBody({ dimensions: ["date"], metrics: ["activeUsers"], dateRanges: [{ startDate: "2026-11-01", endDate: "2026-11-07" }] });
    expect(body).toMatchObject({ dimensions: [{ name: "date" }], metrics: [{ name: "activeUsers" }], returnPropertyQuota: true, limit: "1000" });
  });

  it("batches at most five reports and returns them in order", async () => {
    const spec = { dimensions: [], metrics: ["activeUsers"], dateRanges: [{ startDate: "a", endDate: "b" }] };
    const fetch = vi.fn(async (_: string, init: RequestInit) => reply({ reports: JSON.parse(String(init.body)).requests.map((_: unknown, index: number) => ({ metricHeaders: [{ name: "n" }], rows: [{ dimensionValues: [], metricValues: [{ value: String(index) }] }] })) }));
    const tables = await batchRunReports("t", "properties/1", [spec, spec, spec], { fetch });
    expect(tables.map((t) => t.rows[0]!.metrics.n)).toEqual([0, 1, 2]);
    expect(String(fetch.mock.calls[0]![0])).toBe("https://analyticsdata.googleapis.com/v1beta/properties/1:batchRunReports");
    await expect(batchRunReports("t", "properties/1", Array(MAX_BATCH_REPORTS + 1).fill(spec), { fetch })).rejects.toThrow(RangeError);
  });

  it("keeps the latest quota diagnostics server-side", async () => {
    const { quotaDiagnostics } = await import("../../src/analytics/data-client");
    await runReport("t", "properties/1", { dimensions: [], metrics: ["activeUsers"], dateRanges: [] }, { fetch: async () => reply({ propertyQuota: { tokensPerDay: { consumed: 5, remaining: 195 } } }) });
    expect(quotaDiagnostics()?.quota).toMatchObject({ tokensPerDay: { remaining: 195 } });
  });

  it("runs realtime reports against the realtime endpoint", async () => {
    const fetch = vi.fn(async () => reply({ rows: [] }));
    await runRealtimeReport("t", "properties/1", { dimensions: ["unifiedScreenName"], metrics: ["activeUsers"] }, { fetch });
    expect(String((fetch.mock.calls[0] as unknown[])[0])).toMatch(/:runRealtimeReport$/);
  });
});
