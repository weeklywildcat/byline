import { describe, expect, it } from "vitest";
import {
  IMAGE_CROP_SHAPES,
  artDirectedSource,
  autoCrop,
  isCustomCrop,
  normalizeArtDirection,
  objectPosition,
  shapeAspectRatio
} from "@byline/core";

describe("image art direction contract", () => {
  it("returns no art direction for empty or malformed input", () => {
    expect(normalizeArtDirection(null)).toBeNull();
    expect(normalizeArtDirection({})).toBeNull();
    expect(normalizeArtDirection({ focalPoint: { x: "a", y: 4 } })).toBeNull();
  });

  it("clamps focal points and drops crops outside the image", () => {
    const art = normalizeArtDirection({
      focalPoint: { x: 140, y: -3 },
      crops: {
        square: { x: 0.2, y: 0, w: 0.5, h: 1 },
        wide: { x: 0.8, y: 0, w: 0.5, h: 1 },
        unknown: { x: 0, y: 0, w: 1, h: 1 }
      }
    });
    expect(art?.focalPoint).toEqual({ x: 100, y: 0 });
    expect(art?.crops).toEqual({ square: { x: 0.2, y: 0, w: 0.5, h: 1 } });
  });

  it("sorts renditions and builds a srcset with the largest file as src", () => {
    const art = normalizeArtDirection({
      renditions: {
        square: [
          { url: "https://cms.test/a-1080.jpg", width: 1080, height: 1080 },
          { url: "https://cms.test/a-320.jpg", width: 320, height: 320 },
          { url: "", width: 640, height: 640 }
        ]
      }
    });
    expect(artDirectedSource(art, "square")).toEqual({
      src: "https://cms.test/a-1080.jpg",
      srcSet: "https://cms.test/a-320.jpg 320w, https://cms.test/a-1080.jpg 1080w",
      width: 1080,
      height: 1080
    });
    expect(artDirectedSource(art, "wide")).toBeNull();
  });

  it("matches CSS object-position for the automatic crop", () => {
    // A 3000×2000 photo shown square: the box is 2000px wide (2/3) and CSS
    // moves it by (1 - 2/3) × 25% when the focal point is 25% from the left.
    const crop = autoCrop("square", { x: 25, y: 50 }, 3000, 2000);
    expect(crop.w).toBeCloseTo(2 / 3);
    expect(crop.h).toBe(1);
    expect(crop.x).toBeCloseTo((1 / 3) * 0.25);
    expect(objectPosition({ x: 25, y: 50 })).toBe("25% 50%");
  });

  it("keeps automatic crops inside the image at the corners and for tall photos", () => {
    for (const shape of IMAGE_CROP_SHAPES) {
      for (const focal of [{ x: 0, y: 0 }, { x: 100, y: 100 }]) {
        for (const [width, height] of [[4000, 1000], [1000, 4000], [1200, 1200]]) {
          const crop = autoCrop(shape, focal, width, height);
          expect(crop.x).toBeGreaterThanOrEqual(0);
          expect(crop.y).toBeGreaterThanOrEqual(0);
          expect(crop.x + crop.w).toBeLessThanOrEqual(1 + 1e-9);
          expect(crop.y + crop.h).toBeLessThanOrEqual(1 + 1e-9);
          expect((crop.w * width) / (crop.h * height)).toBeCloseTo(shapeAspectRatio(shape), 5);
        }
      }
    }
  });

  it("only treats a crop that differs from the automatic one as custom", () => {
    const auto = autoCrop("wide", { x: 50, y: 50 }, 1200, 1200);
    expect(isCustomCrop(auto, auto)).toBe(false);
    expect(isCustomCrop({ ...auto, y: auto.y + 0.1 }, auto)).toBe(true);
    expect(isCustomCrop(undefined, auto)).toBe(false);
  });
});
