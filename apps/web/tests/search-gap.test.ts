import { describe, expect, it } from "vitest";
import { createSearchGapEvent, isSensitiveSearchGapQuery, normalizeSearchGapQuery } from "@/lib/search-gap";

describe("search-gap telemetry", () => {
  it("normalizes and bounds the aggregate event payload", () => {
    const event = createSearchGapEvent("  Foo   BAR  ", new Date("2026-08-28T15:30:00Z"));

    expect(event).toEqual({
      query: "foo bar",
      day: "2026-08-28",
      resultCountBucket: "0"
    });
    expect(normalizeSearchGapQuery("  Foo   BAR  ")).toBe("foo bar");
    expect(Object.keys(event ?? {}).sort()).toEqual(["day", "query", "resultCountBucket"]);
  });

  it("does not create events for empty or email-like queries", () => {
    expect(createSearchGapEvent("   ")).toBeNull();
    expect(createSearchGapEvent("reader@example.com")).toBeNull();
    expect(isSensitiveSearchGapQuery("please email reader@example.com")).toBe(true);
  });
});
