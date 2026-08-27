import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { getLeadPackageRenderer, type ResolvedLeadPackage } from "@byline/ui";

const resolved: ResolvedLeadPackage = {
  packageId: "home-lead",
  lead: {
    id: 1, title: "Lead headline", href: "/a/", deck: "Deck", deckIsHtml: false,
    isoDate: "2026-08-20T00:00:00", displayDate: "August 20, 2026", readingTime: null,
    category: { name: "News", href: "/category/news/" }, author: { name: "Reporter", href: "/author/r/" },
    image: null, opinionTreatment: false
  },
  latest: { heading: "The Latest", showBylines: true, stories: [{
    id: 2, title: "Second story", href: "/b/", deck: "", deckIsHtml: false,
    isoDate: "2026-08-19T00:00:00", displayDate: "August 19, 2026", readingTime: null,
    category: null, author: null, image: null, opinionTreatment: false
  }] },
  utility: { poll: true, calendar: false },
  presentation: { showDeck: true, opinionTreatment: false },
  fallbackAuthorName: "Staff",
  emptyMessage: "none"
};

describe("theme variants render the same package differently", () => {
  it("produces different markup for weekly-wildcat and editorial", () => {
    const WW = getLeadPackageRenderer("weekly-wildcat");
    const Ed = getLeadPackageRenderer("editorial");

    const wwHtml = renderToStaticMarkup(<WW package={resolved} pollSlot={<div id="poll" />} />);
    const edHtml = renderToStaticMarkup(<Ed package={resolved} pollSlot={<div id="poll" />} />);

    expect(wwHtml).not.toBe(edHtml);
    // Weekly Wildcat keeps the production three-column front.
    expect(wwHtml).toContain("top-stories-layout");
    expect(wwHtml).toContain("top-stories-rail");
    // Editorial uses its own structure entirely.
    expect(edHtml).toContain("editorial-lead-strip");
    expect(edHtml).not.toContain("top-stories-layout");

    // Both render the same content: a theme changes presentation only.
    for (const html of [wwHtml, edHtml]) {
      expect(html).toContain("Lead headline");
      expect(html).toContain("Second story");
      expect(html).toContain("The Latest");
      expect(html).toContain('id="poll"');
    }
  });
});
