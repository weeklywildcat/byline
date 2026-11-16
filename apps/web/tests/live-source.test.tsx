// @vitest-environment jsdom
import type { LiveCoverage } from "@byline/core";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ArticleLiveCoverage } from "@byline/ui";
import { createArticleLiveView } from "@byline/ui/live-feed";
import { sourceMediaUrl, startLiveUpdates } from "@byline/ui/live-updates";
import { liveSourceUrl } from "@/lib/live-coverage";

/**
 * While coverage is live the page reads the newsroom's feed directly
 * (docs/live-coverage.md). The newsroom sends the raw projection; the browser
 * must render it exactly as the static page did, or every poll would claim the
 * coverage changed.
 */
const NOW = Date.parse("2026-11-02T20:00:00Z");
const SOURCE = "https://newsroom.example/api/byline/live/9";
const update = (id: number, extra: Partial<LiveCoverage["updates"][number]> = {}): LiveCoverage["updates"][number] => ({
  id, title: id === 1 ? "Kickoff" : "", html: `<p>Update ${id}</p>`, date: `2026-11-02T19:${String(40 + id).padStart(2, "0")}:00.000Z`,
  modified: `2026-11-02T19:${String(40 + id).padStart(2, "0")}:00.000Z`, pinned: false, author: "Ana Reporter", authorSlug: "ana-reporter",
  authorRole: "Sports editor", authorPhoto: { url: "/_byline/media/images/aa/ana--96--0123456789abcdef.webp", width: 96, height: 96 },
  image: null, ...extra
});
const coverage = (updates: LiveCoverage["updates"]): LiveCoverage => ({ status: "live", startedAt: "2026-11-02T19:30:00.000Z", endedAt: "", updates });

function staticPage(live: LiveCoverage) {
  const view = createArticleLiveView(live, {
    postId: 9, locale: "en-US", timeZone: "America/Chicago", feedUrl: "/_byline/live/9.json", authorHref: (slug) => `/author/${slug}/`
  });
  document.body.innerHTML = renderToStaticMarkup(<ArticleLiveCoverage live={{ ...view, source: { url: SOURCE, locale: "en-US", timeZone: "America/Chicago" } }} />);
  return document.querySelector<HTMLElement>("[data-byline-live]")!;
}
const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

describe("reading live coverage from the newsroom", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
  });
  afterEach(() => vi.useRealTimers());

  it("marks only a running page with the newsroom feed", () => {
    const root = staticPage(coverage([update(2), update(1, { image: { url: "/_byline/media/images/bb/kick--1600--fedcba9876543210.webp", alt: "Kickoff", width: 1600, height: 1067 } })]));
    expect(root.dataset.source).toBe(SOURCE);
    expect(root.dataset.timeZone).toBe("America/Chicago");
    const view = createArticleLiveView({ ...coverage([]), status: "ended", endedAt: "2026-11-02T21:00:00Z" }, { postId: 9, locale: "en-US", timeZone: "UTC", feedUrl: "/_byline/live/9.json" });
    const ended = renderToStaticMarkup(<ArticleLiveCoverage live={{ ...view, source: { url: SOURCE, locale: "en-US", timeZone: "UTC" } }} />);
    expect(ended).not.toContain("data-source");
  });

  it("stays quiet when the newsroom says what the page already shows, then offers a new update", async () => {
    const photo = { url: "/_byline/media/images/bb/kick--1600--fedcba9876543210.webp", alt: "Kickoff", width: 1600, height: 1067, credit: "Jo Photographer" };
    const current = coverage([update(2), update(1, { image: photo })]);
    const root = staticPage(current);
    const fetch = vi.fn().mockResolvedValueOnce(ok(current)).mockResolvedValue(ok(coverage([update(3), ...current.updates])));
    const stop = startLiveUpdates(root, { fetch, intervalMs: 1000 });

    await vi.advanceTimersByTimeAsync(1000);
    expect(fetch).toHaveBeenLastCalledWith(SOURCE, expect.objectContaining({ cache: "no-store", credentials: "omit" }));
    expect(root.querySelector<HTMLElement>(".article-live-new")!.hidden).toBe(true);

    await vi.advanceTimersByTimeAsync(1000);
    expect(root.querySelector("button")!.textContent).toBe("1 new update");
    root.querySelector<HTMLButtonElement>(".article-live-new button")!.click();
    expect([...root.querySelectorAll<HTMLElement>("[data-update-id]")].map((node) => node.dataset.updateId)).toEqual(["3", "2", "1"]);
    expect(root.querySelector("#update-3 .article-live-update-name a")?.getAttribute("href")).toBe("/author/ana-reporter/");
    expect(fetch.mock.calls.every(([url]) => url === SOURCE)).toBe(true);
    stop();
  });

  it("falls back to the static feed when the newsroom is unreachable", async () => {
    const root = staticPage(coverage([update(1)]));
    const fetch = vi.fn(async (url: RequestInfo | URL) => String(url) === SOURCE
      ? new Response("{}", { status: 502 })
      : ok({ status: "ended", endedLabel: "Nov 2, 3:00 PM", keyPoints: null, updatedAt: "2026-11-02T20:00:00Z", updatedLabel: "Nov 2, 3:00 PM", updates: [] }));
    startLiveUpdates(root, { fetch, intervalMs: 1000 });
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([SOURCE, "/_byline/live/9.json"]);
    expect(root.dataset.status).toBe("ended");
  });

  it("stops reading the newsroom once it says coverage ended", async () => {
    const root = staticPage(coverage([update(1)]));
    const fetch = vi.fn(async () => ok({ ...coverage([update(1)]), status: "ended", endedAt: "2026-11-02T20:00:00Z" }));
    startLiveUpdates(root, { fetch, intervalMs: 1000 });
    await vi.advanceTimersByTimeAsync(5000);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(root.dataset.status).toBe("ended");
  });

  it("loads a photo the deploy has not brought yet from the newsroom, once", async () => {
    const root = staticPage(coverage([update(1)]));
    const stop = startLiveUpdates(root, { fetch: vi.fn(async () => ok(coverage([update(1)]))), intervalMs: 1000 });
    const avatar = root.querySelector<HTMLImageElement>("#update-1 img")!;
    avatar.dispatchEvent(new Event("error"));
    expect(avatar.getAttribute("src")).toBe(`${SOURCE}/media?path=${encodeURIComponent("/_byline/media/images/aa/ana--96--0123456789abcdef.webp")}`);
    avatar.dispatchEvent(new Event("error"));
    expect(avatar.getAttribute("src")).toContain(`${SOURCE}/media?path=`);
    stop();
  });

  it("only redirects the site's own prepared media", () => {
    expect(sourceMediaUrl(SOURCE, "/_byline/media/images/aa/a.webp", "https://site.example")).toBe(`${SOURCE}/media?path=%2F_byline%2Fmedia%2Fimages%2Faa%2Fa.webp`);
    expect(sourceMediaUrl(SOURCE, "https://cdn.example/_byline/media/images/aa/a.webp", "https://site.example")).toBeNull();
    expect(sourceMediaUrl(SOURCE, "/images/logo.png", "https://site.example")).toBeNull();
  });
});

describe("the newsroom feed URL", () => {
  it("comes from the Publication's newsroom address", () => {
    expect(liveSourceUrl(9, "https://byline.weeklywildcat.com")).toBe("https://byline.weeklywildcat.com/api/byline/live/9");
    expect(liveSourceUrl(9, "https://example.org/newsroom/")).toBe("https://example.org/newsroom/api/byline/live/9");
    expect(liveSourceUrl(9, "http://localhost:3000")).toBe("http://localhost:3000/api/byline/live/9");
  });

  it("is absent without a usable HTTPS newsroom", () => {
    expect(liveSourceUrl(9, "")).toBeNull();
    expect(liveSourceUrl(9, "http://byline.weeklywildcat.com")).toBeNull();
    expect(liveSourceUrl(9, "javascript:alert(1)")).toBeNull();
  });
});
