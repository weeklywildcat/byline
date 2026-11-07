import { describe, expect, it } from "vitest";
import {
  artDirectionIntentFromLegacy,
  artDirectionIntentsEqual,
  autoCrop,
  cropPixelBox,
  defaultArtDirectionIntent,
  effectiveShapeCrop,
  normalizeArtDirection,
  normalizeArtDirectionIntent,
  parseArtDirectionIntentInput
} from "@byline/core";

const SIZE = { width: 4000, height: 3000 };

describe("ImageArtDirectionIntent", () => {
  it("defaults to a centered focal point and no crops", () => {
    expect(normalizeArtDirectionIntent(null)).toEqual({ version: 1, focalPoint: { x: 50, y: 50 }, crops: {} });
    expect(defaultArtDirectionIntent()).toEqual(normalizeArtDirectionIntent(undefined));
  });

  it("clamps the focal point when normalizing stored intent", () => {
    expect(normalizeArtDirectionIntent({ focalPoint: { x: 140, y: -3 } }).focalPoint).toEqual({ x: 100, y: 0 });
  });

  it("drops unknown shapes, malformed boxes and generated renditions", () => {
    const intent = normalizeArtDirectionIntent({
      focalPoint: { x: 30, y: 40 },
      crops: { banner: { x: 0, y: 0, w: 1, h: 0.5 }, wide: { x: 0, y: 0, w: Number.NaN, h: 1 }, square: { x: 0.1, y: 0, w: 0.75, h: 1 } },
      renditions: { square: [{ url: "https://cms.example/x.jpg", width: 640, height: 640 }] }
    }, SIZE);
    expect(intent).toEqual({ version: 1, focalPoint: { x: 30, y: 40 }, crops: { square: { x: 0.1, y: 0, w: 0.75, h: 1 } } });
    expect(intent).not.toHaveProperty("renditions");
  });

  it("never stores a crop that equals the automatic focal-point crop", () => {
    const focal = { x: 20, y: 50 };
    const auto = autoCrop("wide", focal, SIZE.width, SIZE.height);
    const parsed = parseArtDirectionIntentInput({ focalPoint: focal, crops: { wide: auto } }, SIZE);
    expect(parsed).toEqual({ ok: true, intent: { version: 1, focalPoint: focal, crops: {} } });
  });

  it("keeps a crop that differs from the automatic one", () => {
    const parsed = parseArtDirectionIntentInput({ focalPoint: { x: 50, y: 50 }, crops: { square: { x: 0, y: 0, w: 0.75, h: 1 } } }, SIZE);
    expect(parsed.ok && parsed.intent.crops.square).toEqual({ x: 0, y: 0, w: 0.75, h: 1 });
  });

  it("refuses unknown shapes, non-finite values, out-of-range focal points, boxes outside the photo and the wrong ratio", () => {
    expect(parseArtDirectionIntentInput({ crops: { banner: { x: 0, y: 0, w: 1, h: 1 } } }, SIZE)).toMatchObject({ ok: false });
    expect(parseArtDirectionIntentInput({ focalPoint: { x: "10", y: 5 } }, SIZE)).toMatchObject({ ok: false });
    expect(parseArtDirectionIntentInput({ focalPoint: { x: 101, y: 5 } }, SIZE)).toMatchObject({ ok: false });
    expect(parseArtDirectionIntentInput({ crops: { square: { x: 0.5, y: 0, w: 0.75, h: 1 } } }, SIZE)).toMatchObject({ ok: false });
    expect(parseArtDirectionIntentInput({ crops: { square: { x: 0, y: 0, w: 0.5, h: 1 } } }, SIZE)).toMatchObject({ ok: false });
    expect(parseArtDirectionIntentInput([], SIZE)).toMatchObject({ ok: false });
  });

  it("treats a missing focal point as the center", () => {
    expect(parseArtDirectionIntentInput({ crops: {} }, SIZE)).toEqual({ ok: true, intent: defaultArtDirectionIntent() });
  });

  it("compares intents by what they would produce", () => {
    const a = normalizeArtDirectionIntent({ focalPoint: { x: 10, y: 20 } });
    expect(artDirectionIntentsEqual(a, normalizeArtDirectionIntent({ focalPoint: { x: 10, y: 20 }, crops: {} }))).toBe(true);
    expect(artDirectionIntentsEqual(a, normalizeArtDirectionIntent({ focalPoint: { x: 10, y: 21 } }))).toBe(false);
  });

  it("gives the effective crop and whole-pixel boxes inside the image", () => {
    const intent = normalizeArtDirectionIntent({ focalPoint: { x: 0, y: 0 } }, SIZE);
    const wide = effectiveShapeCrop(intent, "wide", SIZE);
    expect(wide.custom).toBe(false);
    expect(cropPixelBox(wide.rect, SIZE)).toEqual({ left: 0, top: 0, width: 4000, height: 2250 });
    expect(cropPixelBox({ x: 0.999, y: 0.999, w: 0.5, h: 0.5 }, { width: 10, height: 10 })).toEqual({ left: 9, top: 9, width: 1, height: 1 });
  });

  it("imports WordPress art direction as intent without its generated renditions", () => {
    const legacy = normalizeArtDirection({ focalPoint: { x: 25, y: 75 }, crops: { square: { x: 0, y: 0, w: 0.75, h: 1 } }, renditions: { square: [{ url: "https://wp.example/a-640.jpg", width: 640, height: 640 }] } });
    expect(artDirectionIntentFromLegacy(legacy, SIZE)).toEqual({ version: 1, focalPoint: { x: 25, y: 75 }, crops: { square: { x: 0, y: 0, w: 0.75, h: 1 } } });
    // The legacy contract is unchanged.
    expect(legacy?.renditions.square?.[0].url).toBe("https://wp.example/a-640.jpg");
  });
});
