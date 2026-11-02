import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PhotoPlacements } from "../src/editorial/photo-crops/PhotoPlacements";

const image = { id: 1, url: "photo.jpg", previewUrl: "photo-large.jpg", width: 1600, height: 2000, alt: "", artDirection: null };

function render(crops = {}) {
  return renderToStaticMarkup(
    <PhotoPlacements image={image} draft={{ focalPoint: { x: 35, y: 22 }, crops }} title="Seniors share a laugh" excerpt="The last meeting." host="weeklywildcat.com" selected="square" onSelectShape={() => {}} />
  );
}

describe("photo crops placements", () => {
  it("previews every shape, the Immersive opening, the social card and a search result", () => {
    const html = render();
    for (const label of ["Wide", "Card", "Standard", "Square", "Portrait"]) expect(html).toContain(`<strong>${label}</strong>`);
    expect(html).toContain("aspect-ratio:9 / 19.5");
    expect(html).toContain("aspect-ratio:1200 / 630");
    expect(html).toContain("weeklywildcat.com");
    // A tall photo also previews the 4:3 article lead.
    expect(html).toContain("Standard article lead");
  });

  it("marks a hand-drawn crop as custom and shows exactly that box", () => {
    const html = render({ square: { x: 0.25, y: 0, w: 0.5, h: 0.4 } });
    expect(html).toContain("is-custom");
    expect(html).toContain("width:200%;height:250%;left:-50%;top:0%");
  });
});
