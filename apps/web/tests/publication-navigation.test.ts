import { afterEach, describe, expect, it, vi } from "vitest";

describe("publication navigation", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("sends saved /sports/ links to current sports coverage instead of the archive", async () => {
    const { WEEKLY_WILDCAT_PUBLICATION } = await import("@/lib/publication");
    vi.stubEnv(
      "BYLINE_PUBLICATION_JSON",
      JSON.stringify({
        ...WEEKLY_WILDCAT_PUBLICATION,
        navigation: [
          { label: "Sports", url: "/sports/", locations: ["header"], feature: "sports" },
          { label: "Sports", url: "/sports/", locations: ["footer"], group: "Columns", feature: "sports" },
          { label: "Archive", url: "/sports-archive/", locations: ["footer"], group: "Columns" }
        ]
      })
    );
    vi.resetModules();

    const { getNavigation } = await import("@/lib/publication");

    expect(getNavigation("header").map((item) => item.url)).toEqual(["/category/sports/"]);
    expect(getNavigation("footer").map((item) => item.url)).toEqual(["/category/sports/", "/sports-archive/"]);
  });
});
