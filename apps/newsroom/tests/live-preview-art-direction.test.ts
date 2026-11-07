import { describe, expect, it } from "vitest";
import { previewMediaAsset, projectPayloadImage } from "../src/preview/payload-story";

/**
 * Live Preview reads Byline's art-direction intent (never Payload's retired
 * native focal point) and keeps private newsroom URLs: a custom crop that is
 * still preparing is never shown through stale prepared files. The preview
 * frames with the focal point until the static site has the physical crop.
 */
const media = (extra: Record<string, unknown> = {}) => ({
  id: 7,
  mimeType: "image/jpeg",
  filename: "band.jpg",
  url: "/api/media/file/band.jpg",
  width: 3000,
  height: 2000,
  alt: "Band",
  credit: "Pat",
  sizes: { library: { url: "/api/media/file/band-640x427.webp", width: 640, height: 427 } },
  ...extra
});
const usage = { role: "lead" as const, sizes: "100vw", priority: true, searchVisibility: "canonical" as const, shape: "wide" as const };

describe("Live Preview art direction", () => {
  it("frames with the intent's focal point and ignores native focal fields", () => {
    const view = projectPayloadImage({ media: media({ artDirection: { version: 1, focalPoint: { x: 30, y: 20 }, crops: {} }, focalX: 90, focalY: 90 }) }, usage);
    expect(view?.objectPosition).toBe("30% 20%");
    expect(previewMediaAsset(media({ focalX: 10, focalY: 10 }))?.focalPoint).toBeUndefined();
  });

  it("uses only private newsroom URLs, never prepared publication files, even with a custom crop", () => {
    const view = projectPayloadImage({ media: media({ artDirection: { version: 1, focalPoint: { x: 50, y: 50 }, crops: { wide: { x: 0, y: 0, w: 1, h: 0.5 } } }, publicationAssets: { status: "preparing" } }) }, usage);
    expect(view?.src).toBe("/api/media/file/band.jpg");
    expect(view?.srcSet).toBe("/api/media/file/band-640x427.webp 640w, /api/media/file/band.jpg 3000w");
    expect(JSON.stringify(view)).not.toContain("/_byline/media/");
  });
});
