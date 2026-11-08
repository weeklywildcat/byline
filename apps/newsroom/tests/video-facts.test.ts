import { describe, expect, it, vi } from "vitest";
import { factsFromDataApi, factsFromOEmbed, lookupDue, lookupVideoFacts } from "../src/newsroom/video-facts";

const ID = "dQw4w9WgXcQ";
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

const apiItem = {
  id: ID,
  snippet: { title: "  Homecoming recap ", description: "Highlights", publishedAt: "2026-10-30T18:00:00Z", thumbnails: { default: { url: "https://i.ytimg.com/default.jpg" }, high: { url: "https://i.ytimg.com/high.jpg" } } },
  contentDetails: { duration: "PT4M13S" }
};

describe("YouTube facts normalization", () => {
  it("reads the Data API item, preferring the largest thumbnail and keeping a real duration", () => {
    expect(factsFromDataApi(ID, apiItem)).toMatchObject({ videoId: ID, title: "Homecoming recap", thumbnailUrl: "https://i.ytimg.com/high.jpg", duration: "PT4M13S", uploadDate: "2026-10-30T18:00:00.000Z", source: "youtube-data-api" });
  });

  it("omits a zero (live stream) duration instead of inventing one", () => {
    expect(factsFromDataApi(ID, { ...apiItem, contentDetails: { duration: "P0D" } })).not.toHaveProperty("duration");
  });

  it("rejects an item for another video", () => {
    expect(factsFromDataApi("aaaaaaaaaaa", apiItem)).toBeNull();
  });

  it("drops non-https thumbnails", () => {
    expect(factsFromOEmbed(ID, { title: "Clip", thumbnail_url: "http://example.com/a.jpg" })).toMatchObject({ thumbnailUrl: "" });
  });
});

describe("lookupVideoFacts", () => {
  it("uses the Data API when a key is set and never sends the key to oEmbed", async () => {
    const fetcher = vi.fn(async (_url: string) => json({ items: [apiItem] }));
    const result = await lookupVideoFacts(ID, { fetch: fetcher, apiKey: "KEY" });
    expect(result).toMatchObject({ result: "found", facts: { videoId: ID, duration: "PT4M13S" } });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][0]).toMatch(/^https:\/\/www\.googleapis\.com\/youtube\/v3\/videos\?/);
  });

  it("falls back to keyless oEmbed with no key", async () => {
    const fetcher = vi.fn(async (_url: string) => json({ title: "Clip", thumbnail_url: "https://i.ytimg.com/vi/x/hqdefault.jpg" }));
    const result = await lookupVideoFacts(ID, { fetch: fetcher, apiKey: "" });
    expect(result).toMatchObject({ result: "found", facts: { title: "Clip" } });
    expect(String(fetcher.mock.calls[0][0])).toMatch(/^https:\/\/www\.youtube\.com\/oembed\?/);
    expect(String(fetcher.mock.calls[0][0])).not.toContain("key=");
  });

  it("falls back to oEmbed when the Data API call fails", async () => {
    const fetcher = vi.fn(async (url: string) => (url.includes("googleapis") ? json({}, 500) : json({ title: "Clip" })));
    expect(await lookupVideoFacts(ID, { fetch: fetcher, apiKey: "KEY" })).toMatchObject({ result: "found" });
  });

  it("reports a private or deleted video as missing, and a network failure as a retryable error", async () => {
    expect(await lookupVideoFacts(ID, { fetch: async () => json({}, 404), apiKey: "" })).toEqual({ result: "missing" });
    expect(await lookupVideoFacts(ID, { fetch: async () => { throw new Error("offline"); }, apiKey: "" })).toEqual({ result: "error" });
    expect(await lookupVideoFacts(ID, { fetch: async () => json({}, 503), apiKey: "" })).toEqual({ result: "error" });
  });
});

describe("lookupDue", () => {
  const now = Date.parse("2026-11-08T12:00:00Z");
  it("looks up a video with no row, never one already found", () => {
    expect(lookupDue(null, now)).toBe(true);
    expect(lookupDue({ status: "found", fetchedAt: "2026-11-01T00:00:00Z", attempts: 0 }, now)).toBe(false);
  });
  it("retries an unavailable video only after the wait, and only a few times", () => {
    expect(lookupDue({ status: "unavailable", fetchedAt: "2026-11-08T11:00:00Z", attempts: 1 }, now)).toBe(false);
    expect(lookupDue({ status: "unavailable", fetchedAt: "2026-11-08T01:00:00Z", attempts: 1 }, now)).toBe(true);
    expect(lookupDue({ status: "unavailable", fetchedAt: "2026-11-01T00:00:00Z", attempts: 4 }, now)).toBe(false);
  });
});
