import { describe, expect, it } from "vitest";
import { buildHeadersFile } from "@/scripts/headers.mts";

describe("_headers generation", () => {
  it("keeps live coverage JSON uncacheable and makes fingerprinted publication media immutable", () => {
    expect(buildHeadersFile()).toBe(
      "/_byline/live/*\n  Cache-Control: no-store\n\n/_byline/media/*\n  Cache-Control: public, max-age=31556952, immutable\n"
    );
  });
});
