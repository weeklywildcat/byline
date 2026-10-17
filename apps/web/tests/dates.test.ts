import { describe, expect, it } from "vitest";
import { getWordPressInstant, getWordPressIsoTimestamp, parseWordPressDate } from "@/lib/dates";

const NY = "America/New_York";

describe("WordPress date conversion", () => {
  it("turns GMT values into timezone-aware ISO timestamps", () => {
    expect(getWordPressIsoTimestamp({ gmt: "2026-10-14T22:15:00", local: "2026-10-14T18:15:00" }, NY)).toBe("2026-10-14T22:15:00.000Z");
  });

  it("prefers GMT over the local value when both exist", () => {
    expect(getWordPressIsoTimestamp({ gmt: "2026-10-14T22:15:00", local: "2026-10-14T05:00:00" }, NY)).toBe("2026-10-14T22:15:00.000Z");
  });

  it("reads a local-only value in the publication timezone, not as UTC", () => {
    expect(getWordPressIsoTimestamp({ local: "2026-10-14T18:15:00" }, NY)).toBe("2026-10-14T22:15:00.000Z");
    expect(getWordPressIsoTimestamp({ local: "2026-01-14T18:15:00" }, NY)).toBe("2026-01-14T23:15:00.000Z");
  });

  it("falls back to local when GMT is unset or zeroed", () => {
    expect(getWordPressIsoTimestamp({ gmt: "0000-00-00T00:00:00", local: "2026-10-14T18:15:00" }, NY)).toBe("2026-10-14T22:15:00.000Z");
    expect(getWordPressIsoTimestamp({ gmt: "", local: "2026-10-14T18:15:00" }, NY)).toBe("2026-10-14T22:15:00.000Z");
  });

  it("resolves times on both sides of a daylight-saving change", () => {
    expect(parseWordPressDate("2026-03-08T01:30:00", NY)?.toISOString()).toBe("2026-03-08T06:30:00.000Z");
    expect(parseWordPressDate("2026-03-08T03:30:00", NY)?.toISOString()).toBe("2026-03-08T07:30:00.000Z");
    expect(parseWordPressDate("2026-11-01T12:00:00", NY)?.toISOString()).toBe("2026-11-01T17:00:00.000Z");
  });

  it("honors an explicit offset or Z", () => {
    expect(parseWordPressDate("2026-10-14T18:15:00-04:00", NY)?.toISOString()).toBe("2026-10-14T22:15:00.000Z");
    expect(parseWordPressDate("2026-10-14T22:15:00Z", NY)?.toISOString()).toBe("2026-10-14T22:15:00.000Z");
    expect(parseWordPressDate("2026-10-14 22:15:00", "UTC")?.toISOString()).toBe("2026-10-14T22:15:00.000Z");
  });

  it("returns null for missing or invalid dates", () => {
    for (const value of [undefined, null, "", "   ", "0000-00-00 00:00:00", "not a date", "2026-13-01T00:00:00", "2026-02-31T10:00:00", "2026-10-14"]) {
      expect(parseWordPressDate(value, NY)).toBeNull();
    }
    expect(getWordPressInstant({ gmt: "garbage", local: undefined }, NY)).toBeNull();
    expect(getWordPressIsoTimestamp({}, NY)).toBeUndefined();
  });
});
