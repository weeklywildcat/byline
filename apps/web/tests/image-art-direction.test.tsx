import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { StoryCard } from "@byline/ui";
import { buildSocialImageMetadata, getArticleImageCandidates } from "@/lib/seo";
import { toStoryView } from "@/lib/story-view";
import { media, post } from "@/tests/support/seo-fixtures";

// An editor set a focal point near the top left and drew a square crop; WordPress
// generated the square files and the social card.
const artDirection = {
  focalPoint: { x: 30, y: 20 },
  crops: { square: { x: 0.1, y: 0, w: 0.5, h: 0.75 } },
  renditions: {
    square: [
      { url: "/_wordpress-media/2026/10/photo-byline-square-320x320-ab.jpg", width: 320, height: 320 },
      { url: "/_wordpress-media/2026/10/photo-byline-square-1024x1024-ab.jpg", width: 1024, height: 1024 }
    ],
    social: [{ url: "/_wordpress-media/2026/10/photo-byline-social-1200x630-ab.jpg", width: 1200, height: 630 }]
  }
};
const credit = { creator: "", creditText: "", copyrightNotice: "", licenseUrl: "", acquireLicensePage: "" };
const artDirected = media({ bylineImage: { ...credit, artDirection } });
const story = post({ featured_media: artDirected.id, _embedded: { "wp:featuredmedia": [artDirected] } });

describe("photo art direction on public surfaces", () => {
  it("uses the 1200×630 social crop for link previews", () => {
    expect(buildSocialImageMetadata(artDirected)[0]).toMatchObject({
      url: "https://weeklywildcat.com/_wordpress-media/2026/10/photo-byline-social-1200x630-ab.jpg",
      width: 1200,
      height: 630
    });
    // Without art direction the photo itself is still the preview.
    expect(buildSocialImageMetadata(media())[0].url).toBe("https://weeklywildcat.com/_wordpress-media/2026/10/photo.jpg");
  });

  it("offers Google the editor's square crop", () => {
    expect(getArticleImageCandidates(artDirected).map((image) => image.url)).toContain(
      "/_wordpress-media/2026/10/photo-byline-square-1024x1024-ab.jpg"
    );
  });

  it("gives homepage cards the focal point and per-shape crops", () => {
    const view = toStoryView(story);
    expect(view.image).toMatchObject({
      src: "/_byline/presentation-media/2026/10/photo.jpg",
      objectPosition: "30% 20%",
      crops: { square: { src: "/_byline/presentation-media/2026/10/photo-byline-square-1024x1024-ab.jpg", width: 1024 } }
    });

    // A 3:2 card has no editor crop, so the photo is positioned at the focal point.
    const card = renderToStaticMarkup(<StoryCard story={view} variant="grid" fallbackAuthorName="Staff" />);
    expect(card).toContain('src="/_byline/presentation-media/2026/10/photo.jpg"');
    expect(card).toContain("object-position:30% 20%");
  });
});
