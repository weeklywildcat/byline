import { describe, expect, it, vi } from "vitest";
import { createMemoryCache, cached, ttlFor, TTL } from "../../src/analytics/cache";
import { buildCatalog, mapRow, matchesFilters, normalizePath, pathsFor, storyForTitle } from "../../src/analytics/content-map";
import { averageEngagementSeconds, change, eachDay, gaDate, rangeSince, resolveRange } from "../../src/analytics/dates";
import { analyticsDimensions as dim, analyticsMetrics as met, storyContentId, storyIdFromContentId } from "../../src/analytics/model";
import { storyFilter, tallyContent } from "../../src/analytics/reports";
import { describeChange, formatDuration, seriesSummary } from "../../src/ui/analytics/format";
import type { ReportRow } from "../../src/analytics/data-client";

const NOW = new Date("2026-11-18T15:00:00Z");

describe("date ranges", () => {
  it("resolves presets in the property's timezone, with the equal previous period", () => {
    const range = resolveRange({ preset: "7d" }, "America/New_York", NOW);
    expect(range).toMatchObject({ start: "2026-11-12", end: "2026-11-18", previousStart: "2026-11-05", previousEnd: "2026-11-11", days: 7, includesToday: true });
    expect(resolveRange({ preset: "28d" }, "UTC", NOW).days).toBe(28);
    expect(resolveRange({ preset: "90d" }, "UTC", NOW).start).toBe("2026-08-21");
    expect(resolveRange({ preset: "today" }, "UTC", NOW)).toMatchObject({ start: "2026-11-18", end: "2026-11-18", days: 1 });
  });

  it("uses the property's day, not the browser's or the server's", () => {
    const lateEvening = new Date("2026-11-18T03:30:00Z");
    expect(resolveRange({ preset: "today" }, "America/Los_Angeles", lateEvening).end).toBe("2026-11-17");
    expect(resolveRange({ preset: "today" }, "Asia/Tokyo", lateEvening).end).toBe("2026-11-18");
  });

  it("accepts a custom range and rejects nonsense", () => {
    expect(resolveRange({ preset: "custom", start: "2026-10-01", end: "2026-10-10" }, "UTC", NOW)).toMatchObject({ preset: "custom", days: 10, includesToday: false, previousStart: "2026-09-21", previousEnd: "2026-09-30" });
    expect(resolveRange({ preset: "custom", start: "2026-10-10", end: "2026-10-01" }, "UTC", NOW).preset).toBe("7d");
    expect(resolveRange({ preset: "custom", start: "garbage", end: "2026-10-01" }, "UTC", NOW).preset).toBe("7d");
    expect(resolveRange({ preset: "custom", start: "2020-01-01", end: "2026-10-01" }, "UTC", NOW).preset).toBe("7d");
    expect(resolveRange({ preset: "custom", start: "2026-11-01", end: "2027-01-01" }, "UTC", NOW).end).toBe("2026-11-18");
  });

  it("measures a Story since publication, capped", () => {
    expect(rangeSince("2026-11-15T12:00:00Z", "UTC", NOW)).toMatchObject({ start: "2026-11-15", end: "2026-11-18", days: 4 });
    expect(rangeSince("2024-01-01T12:00:00Z", "UTC", NOW).days).toBe(90);
  });

  it("never invents a percentage change", () => {
    expect(change(150, 100).ratio).toBe(0.5);
    expect(change(5, 0)).toEqual({ current: 5, previous: 0, ratio: null });
    expect(change(5, null).ratio).toBeNull();
    expect(change(null, 5).ratio).toBeNull();
    expect(describeChange(change(5, 0))).toMatchObject({ text: "New", tone: "new" });
    expect(describeChange(change(0, 0)).tone).toBe("none");
    expect(describeChange(change(5, null)).tone).toBe("none");
    expect(describeChange(change(150, 100)).text).toBe("+50%");
    expect(describeChange(change(90, 100)).text).toBe("−10%");
    expect(describeChange(change(100, 100))).toMatchObject({ tone: "flat" });
    for (const value of [change(5, 0), change(0, 0), change(null, null)]) expect(describeChange(value).text).not.toMatch(/∞|Infinity|NaN/);
  });

  it("defines average engagement once", () => {
    expect(averageEngagementSeconds(600, 10)).toBe(60);
    expect(averageEngagementSeconds(600, 0)).toBeNull();
    expect(formatDuration(59)).toBe("59s");
    expect(formatDuration(84)).toBe("1m 24s");
    expect(formatDuration(null)).toBe("—");
  });

  it("fills every day and parses GA's date format", () => {
    expect(eachDay("2026-11-01", "2026-11-03")).toEqual(["2026-11-01", "2026-11-02", "2026-11-03"]);
    expect(gaDate("20261101")).toBe("2026-11-01");
    expect(seriesSummary([{ date: "2026-11-01", views: 5 }, { date: "2026-11-02", views: 9 }])).toContain("14 views over 2 days. Most views: 9");
  });
});

describe("report cache", () => {
  it("expires by range: closed history lasts, ranges including today don't", () => {
    expect(ttlFor({ start: "2026-10-01", end: "2026-10-07", includesToday: false })).toBe(TTL.closed);
    expect(ttlFor({ start: "2026-11-18", end: "2026-11-18", includesToday: true })).toBe(TTL.today);
    expect(ttlFor({ start: "2026-11-12", end: "2026-11-18", includesToday: true })).toBe(TTL.includingToday);
    expect(TTL.realtime).toBeGreaterThanOrEqual(20_000);
    expect(TTL.realtime).toBeLessThanOrEqual(30_000);
    expect(TTL.today).toBeGreaterThanOrEqual(2 * 60_000);
    expect(TTL.includingToday).toBeLessThanOrEqual(15 * 60_000);
  });

  it("is a bounded LRU with expiry", () => {
    let time = 0;
    const cache = createMemoryCache({ max: 2, now: () => time });
    cache.set("a", 1, 100); cache.set("b", 2, 100);
    cache.get("a");
    cache.set("c", 3, 100);
    expect(cache.get("b")).toBeUndefined();
    expect(cache.get("a")).toBe(1);
    time = 101;
    expect(cache.get("a")).toBeUndefined();
  });

  it("shares one Google call between simultaneous requests, and refresh bypasses the cache", async () => {
    const cache = createMemoryCache();
    const load = vi.fn(async () => "report");
    const [a, b] = await Promise.all([cached("k", 1000, load, { cache }), cached("k", 1000, load, { cache })]);
    expect(load).toHaveBeenCalledTimes(1);
    expect([a.value, b.value]).toEqual(["report", "report"]);
    expect((await cached("k", 1000, load, { cache })).cached).toBe(true);
    await cached("k", 1000, load, { cache, refresh: true });
    expect(load).toHaveBeenCalledTimes(2);
  });
});

const catalog = buildCatalog({
  shortName: "Weekly Wildcat", siteHost: "weeklywildcat.com",
  stories: [
    { id: 1, title: "Budget passes", path: "/2026/11/10/news/budget-passes/", section: { name: "News", slug: "news" }, publishedAt: "2026-11-10T12:00:00Z", authors: [5], topics: [9] },
    { id: 2, title: "Big game", path: "/2026/11/11/sports/big-game/", section: { name: "Sports", slug: "sports" }, publishedAt: "2026-11-11T12:00:00Z", authors: [6], topics: [] },
    { id: 3, title: "Same Headline", path: "/2026/11/12/news/same-a/", section: { name: "News", slug: "news" }, publishedAt: "2026-11-12T12:00:00Z", authors: [], topics: [] },
    { id: 4, title: "Same Headline", path: "/2026/11/13/news/same-b/", section: { name: "News", slug: "news" }, publishedAt: "2026-11-13T12:00:00Z", authors: [], topics: [] }
  ],
  redirects: [{ from: "/2026/11/10/news/budget/", to: "/2026/11/10/news/budget-passes/" }, { from: "/old/elsewhere/", to: "/not-a-story/" }]
});

describe("joining Google rows to Stories", () => {
  it("prefers the Byline content ID, then the canonical path, then redirect history", () => {
    expect(mapRow({ contentId: "story:2", pagePath: "/whatever/" }, catalog)).toMatchObject({ kind: "story", via: "content-id", story: { id: 2 } });
    expect(mapRow({ contentId: "(not set)", pagePath: "/2026/11/10/news/budget-passes/?utm=x" }, catalog)).toMatchObject({ kind: "story", via: "path", story: { id: 1 } });
    expect(mapRow({ pagePath: "/2026/11/10/news/budget-passes" }, catalog)).toMatchObject({ via: "path" });
    expect(mapRow({ pagePath: "/2026/11/10/news/budget/" }, catalog)).toMatchObject({ kind: "story", via: "redirect", story: { id: 1 } });
    expect(mapRow({ contentId: "story:999", pagePath: "/about/" }, catalog)).toEqual({ kind: "page", path: "/about/" });
    expect(mapRow({ pagePath: "/old/elsewhere/" }, catalog).kind).toBe("page");
    expect(storyIdFromContentId(storyContentId(42))).toBe(42);
    expect(storyIdFromContentId("story:abc")).toBeNull();
    expect(normalizePath("/a//b/index.html?x=1#y")).toBe("/a/b/");
  });

  it("lists every address a Story has answered at", () => {
    expect(pathsFor(1, catalog)).toEqual(["/2026/11/10/news/budget-passes/", "/2026/11/10/news/budget/"]);
    const filter = JSON.stringify(storyFilter(1, catalog));
    expect(filter).toContain("story:1");
    expect(filter).toContain("/2026/11/10/news/budget/");
  });

  it("counts a row exactly once, however it could be identified", () => {
    const row = (dims: Record<string, string>, views: number, range = "current"): ReportRow => ({ dims: { dateRange: range, [dim.contentId]: "(not set)", [dim.pagePath]: "/", [dim.pageTitle]: "", ...dims }, metrics: { [met.views]: views, [met.activeUsers]: views, [met.engagementDuration]: views * 10, [met.scrolledUsers]: 1 } });
    const tally = tallyContent([
      row({ [dim.contentId]: "story:1", [dim.pagePath]: "/2026/11/10/news/budget-passes/" }, 100),
      row({ [dim.contentId]: "(not set)", [dim.pagePath]: "/2026/11/10/news/budget-passes/" }, 20),
      row({ [dim.contentId]: "(not set)", [dim.pagePath]: "/2026/11/10/news/budget/" }, 5),
      row({ [dim.contentId]: "story:1", [dim.pagePath]: "/2026/11/10/news/budget-passes/" }, 50, "previous"),
      row({ [dim.pagePath]: "/" , [dim.pageTitle]: "Home" }, 400)
    ], catalog);
    expect(tally.stories.get(1)).toMatchObject({ views: 125, viewsBefore: 50 });
    expect(tally.stories.size).toBe(1);
    expect(tally.pages.get("/")).toMatchObject({ views: 400, title: "Home" });
    const total = [...tally.stories.values()].reduce((sum, value) => sum + value.views, 0) + tally.unmatchedViews;
    expect(total).toBe(100 + 20 + 5 + 400);
  });

  it("filters by Byline's own section, author, topic and Story", () => {
    const story = catalog.stories.get(1)!;
    expect(matchesFilters(story, { section: "news", author: 5, topic: 9 })).toBe(true);
    expect(matchesFilters(story, { section: "sports" })).toBe(false);
    expect(matchesFilters(story, { author: 6 })).toBe(false);
    expect(matchesFilters(story, { story: 1 })).toBe(true);
  });

  it("matches a Realtime title to a Story only when exactly one Story has it", () => {
    expect(storyForTitle("Budget passes | Weekly Wildcat", catalog)?.id).toBe(1);
    expect(storyForTitle("Same Headline | Weekly Wildcat", catalog)).toBeNull();
    expect(storyForTitle("Weekly Wildcat", catalog)).toBeNull();
    expect(storyForTitle("Budget passes", catalog)).toBeNull();
  });

  it("never lets two Stories claim one address", () => {
    const clash = buildCatalog({ shortName: "W", siteHost: "x", redirects: [], stories: [
      { id: 1, title: "A", path: "/same/", section: null, publishedAt: null, authors: [], topics: [] },
      { id: 2, title: "B", path: "/same/", section: null, publishedAt: null, authors: [], topics: [] }
    ] });
    expect(mapRow({ pagePath: "/same/" }, clash).kind).toBe("page");
  });
});
