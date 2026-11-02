import { describe, expect, it } from "vitest";
import { buildHeadersFile } from "@/scripts/headers.mts";

describe("_headers generation", () => {
  it("makes live coverage JSON always revalidate", () => {
    expect(buildHeadersFile()).toBe("/_byline/live/*\n  Cache-Control: no-cache\n");
  });
});
