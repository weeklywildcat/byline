import { describe, expect, it, vi } from "vitest";
import { BylineBuildDataError, optionalBuildData, requireBuildData } from "@/lib/build-data";
import { BYLINE_EMPTY_ROUTE_SLUG, isBylineEmptyRouteSlug, withEmptyRouteFallback } from "@/lib/static-params";

// These tests encode the distinction that the previous `.catch(() => [])` model
// destroyed: an API failure and a genuinely empty publication are not the same
// thing and must not produce the same build behaviour.
describe("required build data", () => {
  it("passes through a genuinely empty result", async () => {
    await expect(requireBuildData("/wp-json/example", async () => [])).resolves.toEqual([]);
  });

  it("fails with the endpoint named instead of returning empty data", async () => {
    const failing = requireBuildData("/wp-json/weekly-wildcat/v1/sports-games", async () => {
      throw new Error("503 Service Unavailable");
    });

    await expect(failing).rejects.toBeInstanceOf(BylineBuildDataError);
    await expect(failing).rejects.toThrow("/wp-json/weekly-wildcat/v1/sports-games");
    await expect(failing).rejects.toThrow("503 Service Unavailable");
  });

  it("preserves the underlying error as the cause", async () => {
    const cause = new Error("ECONNRESET");

    try {
      await requireBuildData("/wp-json/wp/v2/posts", async () => {
        throw cause;
      });
      expect.unreachable("should have thrown");
    } catch (error) {
      expect((error as BylineBuildDataError).cause).toBe(cause);
      expect((error as BylineBuildDataError).endpoint).toBe("/wp-json/wp/v2/posts");
    }
  });
});

describe("optional build data", () => {
  it("reports the failure and falls back rather than failing the build", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(
      optionalBuildData("/wp-json/weekly-wildcat/v1/sports-games", async () => {
        throw new Error("module not installed");
      }, [])
    ).resolves.toEqual([]);

    expect(warn).toHaveBeenCalledWith(expect.stringContaining("/wp-json/weekly-wildcat/v1/sports-games"));
    warn.mockRestore();
  });
});

describe("empty route fallback", () => {
  it("keeps real params untouched", () => {
    const params = [{ slug: "news" }, { slug: "sports" }];

    expect(withEmptyRouteFallback(params, { slug: BYLINE_EMPTY_ROUTE_SLUG })).toBe(params);
  });

  it("emits exactly one reserved placeholder when a publication is genuinely empty", () => {
    const result = withEmptyRouteFallback<{ slug: string }>([], { slug: BYLINE_EMPTY_ROUTE_SLUG });

    // `output: export` rejects a zero-length result, so one route must exist.
    expect(result).toHaveLength(1);
    expect(isBylineEmptyRouteSlug(result[0].slug)).toBe(true);
  });

  it("uses a slug that cannot collide with CMS content", () => {
    // WordPress sanitises slugs to lowercase alphanumerics and hyphens, so a
    // slug containing underscores can never be produced by real content.
    expect(BYLINE_EMPTY_ROUTE_SLUG).toMatch(/^__.*__$/);
    expect(isBylineEmptyRouteSlug("news")).toBe(false);
    expect(isBylineEmptyRouteSlug(undefined)).toBe(false);
  });
});
