import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import OpenSourcePage, { metadata } from "@/views/open-source/page";
import { getNavigation } from "@/lib/publication";

describe("open source page", () => {
  it("links the featured projects to their public repositories", () => {
    const markup = renderToStaticMarkup(<OpenSourcePage />);

    expect(markup).toContain("Open Source at Weekly Wildcat");
    expect(markup).toContain('href="https://github.com/weeklywildcat/byline"');
    expect(markup).toContain('href="https://tilecast.org/"');
    expect(markup).toContain('href="https://github.com/gbyo/tilecast"');
    expect(markup).toContain('id="open-source-breadcrumb-json-ld"');
  });

  it("is canonical at /open-source/ and linked from the footer", () => {
    expect(metadata.alternates?.canonical).toContain("/open-source/");
    expect(getNavigation("footer").some((item) => item.url === "/open-source/")).toBe(true);
  });
});
