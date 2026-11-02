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
    const fetch = feedResponse({ status: "live", endedLabel: null, keyPoints: null, updatedAt: "2026-11-02T19:58:00Z", updatedLabel: "Nov 2, 2:58 PM", updates: [entry(3), entry(2), entry(1)] });
    startLiveUpdates(root, { fetch, intervalMs: 1000, now: () => Date.now() });
    expect(root.querySelector("[data-live-updated]")?.textContent).toBe("10 min ago");

    await vi.advanceTimersByTimeAsync(1000);
    expect(fetch).toHaveBeenCalledWith("/_byline/live/9.json", expect.objectContaining({ cache: "no-store" }));
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
    const fetch = feedResponse({ status: "ended", endedLabel: "Nov 2, 3:00 PM", keyPoints: null, updatedAt: "2026-11-02T19:58:00Z", updatedLabel: "Nov 2, 2:58 PM", updates: [entry(2), entry(1)] });
    startLiveUpdates(root, { fetch, intervalMs: 1000 });
    await vi.advanceTimersByTimeAsync(1000);
    expect(root.dataset.status).toBe("ended");
    expect(root.querySelector(".article-live-status")?.textContent).toContain("Live coverage ended Nov 2, 3:00 PM.");
    expect(root.querySelectorAll(".article-live-update")).toHaveLength(1);
    root.querySelector<HTMLButtonElement>(".article-live-new button")!.click();
    expect(root.querySelectorAll(".article-live-update")).toHaveLength(2);
    expect(document.querySelector(".article-live-badge")).toBeNull();
    await vi.advanceTimersByTimeAsync(5000);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("does not check while the tab is hidden", async () => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    const root = page();
    const fetch = feedResponse({ status: "live", endedLabel: null, keyPoints: null, updatedAt: "", updatedLabel: "", updates: [] });
    startLiveUpdates(root, { fetch, intervalMs: 1000 });
    await vi.advanceTimersByTimeAsync(5000);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("live polling lifecycle and archive changes", () => {
  beforeEach(() => {
    vi.useFakeTimers(); vi.setSystemTime(NOW);
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
  });
  afterEach(() => vi.useRealTimers());
  const snapshot = (root: HTMLElement, extra: Partial<LiveFeed> = {}): LiveFeed => ({
    status: "live", endedLabel: null, keyPoints: null, updatedAt: "2026-11-02T19:50:00Z", updatedLabel: "Nov 2, 2:50 PM",
    updates: [{ id: 1, html: root.querySelector("[data-update-id]")!.outerHTML }], ...extra
  });
  it("keeps unchanged polls quiet, including after relative timestamps change", async () => {
    const root = page(); const feed = snapshot(root); const fetch = feedResponse(feed);
    const stop = startLiveUpdates(root, { fetch, intervalMs: 1000 });
    await vi.advanceTimersByTimeAsync(65_000);
    expect(root.querySelector<HTMLElement>(".article-live-new")!.hidden).toBe(true);
    expect(root.querySelectorAll("[data-update-id]")).toHaveLength(1);
    expect(root.querySelector("[data-live-updated]")!.textContent).toBe("11 min ago");
    stop();
  });
  it("removes a stale pending count and retries malformed feeds", async () => {
    const root = page(); const original = snapshot(root);
    const fetch = vi.fn().mockResolvedValueOnce(new Response('{}')).mockResolvedValueOnce(new Response(JSON.stringify({ ...original, updates: [entry(2), ...original.updates] }))).mockResolvedValue(new Response(JSON.stringify(original)));
    const stop = startLiveUpdates(root, { fetch, intervalMs: 1000 });
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(2000);
    expect(root.querySelector("button")!.textContent).toBe("1 new update");
    await vi.advanceTimersByTimeAsync(1000);
    expect(root.querySelector<HTMLElement>(".article-live-new")!.hidden).toBe(true);
    stop();
  });
  it("offers edits, deletions, and changed key points without inserting duplicate IDs", async () => {
    const root = page();
    const fetch = feedResponse(snapshot(root, { keyPoints: { id: 2, html: '<h3>Key points changed</h3>' }, updates: [entry(2), entry(2)] }));
    const stop = startLiveUpdates(root, { fetch, intervalMs: 1000 });
    await vi.advanceTimersByTimeAsync(1000);
    expect(root.querySelector("button")!.textContent).toBe("1 new update");
    root.querySelector("button")!.click();
    expect(root.querySelectorAll("#update-2")).toHaveLength(1);
    expect(root.querySelector("#update-1")).toBeNull();
    expect(root.querySelector(".article-live-key-points")!.textContent).toBe("Key points changed");
    await vi.advanceTimersByTimeAsync(1000);
    expect(root.querySelector<HTMLElement>(".article-live-new")!.hidden).toBe(true);
    stop();
  });
  it("resumes once when visible and prevents overlapping requests", async () => {
    const root = page(); const feed = snapshot(root); let resolve!: (response: Response) => void;
    const fetch = vi.fn(() => new Promise<Response>((done) => { resolve = done; }));
    const stop = startLiveUpdates(root, { fetch, intervalMs: 1000 });
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(5000); expect(fetch).not.toHaveBeenCalled();
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
    document.dispatchEvent(new Event("visibilitychange")); document.dispatchEvent(new Event("visibilitychange"));
    expect(fetch).toHaveBeenCalledTimes(1);
    resolve(new Response(JSON.stringify(feed))); await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(1000); expect(fetch).toHaveBeenCalledTimes(2);
    stop(); resolve(new Response(JSON.stringify({ ...feed, updates: [entry(3)] })));
    await vi.advanceTimersByTimeAsync(0);
    expect(root.querySelector("#update-3")).toBeNull();
  });
  it("restores the empty archive message when all updates are removed", async () => {
    const root = page();
    const fetch = feedResponse(snapshot(root, { updates: [] }));
    const stop = startLiveUpdates(root, { fetch, intervalMs: 1000 });
    await vi.advanceTimersByTimeAsync(1000);
    expect(root.querySelector("button")!.textContent).toBe("Coverage updated");
    root.querySelector("button")!.click();
    expect(root.querySelectorAll("[data-update-id]")).toHaveLength(0);
    expect(root.querySelector(".article-live-empty")!.textContent).toBe("Updates will appear here.");
    stop();
  });

  it("leaves ended stories and ordinary stories idle", async () => {
    const root = page(); root.dataset.status = "ended";
    const fetch = feedResponse(snapshot(root)); startLiveUpdates(root, { fetch, intervalMs: 1000 });
    await vi.advanceTimersByTimeAsync(5000); expect(fetch).not.toHaveBeenCalled();
  });
});
