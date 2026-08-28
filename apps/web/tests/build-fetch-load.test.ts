import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/media", () => ({
  mirrorWordPressMediaInValue: async (value: unknown) => value
}));

vi.mock("@/lib/wordpress", () => ({
  getWordPressApiUrl: () => "https://cms.example.test/wp-json/wp/v2"
}));

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const originalFetchConcurrency = process.env.BYLINE_WORDPRESS_FETCH_CONCURRENCY;
const originalFetchCacheKey = process.env.WORDPRESS_FETCH_CACHE_KEY;
const originalContentMode = process.env.BYLINE_CONTENT_MODE;

beforeEach(() => {
  vi.resetModules();
  process.env.BYLINE_WORDPRESS_FETCH_CONCURRENCY = "2";
  process.env.WORDPRESS_FETCH_CACHE_KEY = "test-build";
  delete process.env.BYLINE_CONTENT_MODE;
});

afterEach(() => {
  vi.unstubAllGlobals();
  if (originalFetchConcurrency === undefined) delete process.env.BYLINE_WORDPRESS_FETCH_CONCURRENCY;
  else process.env.BYLINE_WORDPRESS_FETCH_CONCURRENCY = originalFetchConcurrency;
  if (originalFetchCacheKey === undefined) delete process.env.WORDPRESS_FETCH_CACHE_KEY;
  else process.env.WORDPRESS_FETCH_CACHE_KEY = originalFetchCacheKey;
  if (originalContentMode === undefined) delete process.env.BYLINE_CONTENT_MODE;
  else process.env.BYLINE_CONTENT_MODE = originalContentMode;
});

describe("WordPress build load controls", () => {
  it("passes one cache key from the publication wrapper to all Next workers", async () => {
    const source = await readFile(path.join(appRoot, "scripts", "next-with-publication.mjs"), "utf8");

    expect(source).toContain("const buildFetchCacheKey = wordpressFetchCacheKey();");
    expect(source).toContain("WORDPRESS_FETCH_CACHE_KEY: buildFetchCacheKey");
    expect(source).toContain("`local-build-${Date.now()}`");
  });

  it("bounds concurrent requests while loading every sports page", async () => {
    let activeRequests = 0;
    let maxActiveRequests = 0;
    const requestedPages: number[] = [];

    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
      const page = Number(url.searchParams.get("page") || "1");
      requestedPages.push(page);
      expect(url.searchParams.get("_ww_static_build")).toBe("test-build");

      activeRequests += 1;
      maxActiveRequests = Math.max(maxActiveRequests, activeRequests);
      await new Promise((resolve) => setTimeout(resolve, 5));
      activeRequests -= 1;

      return new Response(JSON.stringify([{ id: page }]), {
        status: 200,
        headers: {
          "content-type": "application/json",
          "x-wp-totalpages": "6"
        }
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { getAllSportsGames } = await import("@/lib/headless");
    const games = await getAllSportsGames();

    expect(games).toHaveLength(6);
    expect(requestedPages.sort((left, right) => left - right)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(fetchMock).toHaveBeenCalledTimes(6);
    expect(maxActiveRequests).toBeLessThanOrEqual(2);
  });
});
