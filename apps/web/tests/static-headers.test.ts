import { describe, expect, it } from "vitest";
import { buildHeadersFile } from "@/scripts/headers.mts";

describe("_headers generation", () => {
  it("caches fingerprinted assets immutably while keeping live coverage JSON uncacheable", () => {
    expect(buildHeadersFile()).toBe(
      "/_astro/*\n  Cache-Control: public, max-age=31536000, immutable\n\n" +
      "/_byline/live/*\n  Cache-Control: no-store\n\n" +
      "/_byline/media/*\n  Cache-Control: public, max-age=31556952, immutable\n"
    );
  });
});
