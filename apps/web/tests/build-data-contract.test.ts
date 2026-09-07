import { describe, expect, it, vi } from "vitest";
import { BylineBuildDataError, optionalBuildData, requireBuildData } from "@/lib/build-data";

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
