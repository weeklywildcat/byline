// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { relativeTimeLabel, startLiveUpdates, type LiveFeed } from "@byline/ui/live-updates";

const NOW = Date.parse("2026-11-02T20:00:00Z");

function page() {
  document.body.innerHTML = `
    <span class="article-live-badge">Live</span>
    <section class="article-live article-live-live" data-byline-live="9" data-status="live" data-feed="/_byline/live/9.json">
      <div class="article-live-status"><span>Updated <time datetime="2026-11-02T19:50:00Z" data-live-relative data-live-updated>Nov 2, 2:50 PM</time></span></div>
      <div class="article-live-new" hidden><button type="button"></button></div>
      <div class="article-live-updates">
        <article class="article-live-update" id="update-1" data-update-id="1"><time datetime="2026-11-02T19:50:00Z" data-live-relative>Nov 2, 2:50 PM</time></article>
      </div>
    </section>`;
  return document.querySelector<HTMLElement>("[data-byline-live]")!;
}

const entry = (id: number) => ({ id, html: `<article class="article-live-update" id="update-${id}" data-update-id="${id}"><p>Update ${id}</p></article>` });

function feedResponse(feed: LiveFeed) {
  return vi.fn(async () => new Response(JSON.stringify(feed), { status: 200 }));
}

describe("live updates script", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
  });
  afterEach(() => vi.useRealTimers());

  it("labels recent times relatively and keeps old ones absolute", () => {
    expect(relativeTimeLabel("2026-11-02T19:59:40Z", NOW)).toBe("Just now");
    expect(relativeTimeLabel("2026-11-02T19:48:00Z", NOW)).toBe("12 min ago");
    expect(relativeTimeLabel("2026-11-02T17:00:00Z", NOW)).toBe("3 hr ago");
    expect(relativeTimeLabel("2026-10-30T17:00:00Z", NOW)).toBeNull();
  });

  it("shows how many updates are new and inserts them only when asked", async () => {
    const root = page();
    const fetch = feedResponse({ status: "live", endedLabel: null, updatedAt: "2026-11-02T19:58:00Z", updatedLabel: "Nov 2, 2:58 PM", updates: [entry(3), entry(2), entry(1)] });
    startLiveUpdates(root, { fetch, intervalMs: 1000, now: () => Date.now() });
    expect(root.querySelector("[data-live-updated]")?.textContent).toBe("10 min ago");

    await vi.advanceTimersByTimeAsync(1000);
    expect(fetch).toHaveBeenCalledWith("/_byline/live/9.json", { cache: "no-store" });
    const pill = root.querySelector<HTMLElement>(".article-live-new")!;
    expect(pill.hidden).toBe(false);
    expect(pill.textContent).toBe("2 new updates");
    // Nothing moved until the reader asks.
    expect(root.querySelectorAll(".article-live-update")).toHaveLength(1);

    pill.querySelector("button")!.click();
    expect([...root.querySelectorAll<HTMLElement>(".article-live-update")].map((node) => node.dataset.updateId)).toEqual(["3", "2", "1"]);
    expect(pill.hidden).toBe(true);
    expect(root.querySelector("[data-live-updated]")?.getAttribute("datetime")).toBe("2026-11-02T19:58:00Z");
  });

  it("switches to the ended note, keeps every update and stops checking", async () => {
    const root = page();
    const fetch = feedResponse({ status: "ended", endedLabel: "Nov 2, 3:00 PM", updatedAt: "2026-11-02T19:58:00Z", updatedLabel: "Nov 2, 2:58 PM", updates: [entry(2), entry(1)] });
    startLiveUpdates(root, { fetch, intervalMs: 1000 });
    await vi.advanceTimersByTimeAsync(1000);
    expect(root.dataset.status).toBe("ended");
    expect(root.querySelector(".article-live-status")?.textContent).toBe("Live coverage ended Nov 2, 3:00 PM. Every update is below.");
    expect(root.querySelectorAll(".article-live-update")).toHaveLength(2);
    expect(document.querySelector(".article-live-badge")).toBeNull();
    await vi.advanceTimersByTimeAsync(5000);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("does not check while the tab is hidden", async () => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    const root = page();
    const fetch = feedResponse({ status: "live", endedLabel: null, updatedAt: "", updatedLabel: "", updates: [] });
    startLiveUpdates(root, { fetch, intervalMs: 1000 });
    await vi.advanceTimersByTimeAsync(5000);
    expect(fetch).not.toHaveBeenCalled();
  });
});
