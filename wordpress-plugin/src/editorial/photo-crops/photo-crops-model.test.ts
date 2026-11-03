import { describe, expect, it } from "vitest";
import { autoCrop } from "@byline/core";
import {
  areaFromRect,
  draftFromImage,
  draftPayload,
  effectiveCrop,
  frameImageStyle,
  isLowResolution,
  readArtDirectionImage,
  rectFromArea,
  resetShapeCrop,
  setFocalPoint,
  setShapeCrop
} from "./photo-crops-model";

const response = {
  id: 77,
  url: "https://cms.test/game.jpg",
  previewUrl: "https://cms.test/game-1024.jpg",
  width: 3000,
  height: 2000,
  alt: "Game",
  artDirection: {
    focalPoint: { x: 30, y: 20 },
    crops: {
      square: { x: 0.4, y: 0.1, w: 0.3, h: 0.45 },
      // Saved before the focal point moved; it equals the automatic crop, so it is not custom.
      wide: autoCrop("wide", { x: 30, y: 20 }, 3000, 2000)
    },
    renditions: {}
  }
};

describe("photo crops editor model", () => {
  it("reads the REST response and rejects one without an image", () => {
    expect(readArtDirectionImage(response)?.previewUrl).toBe("https://cms.test/game-1024.jpg");
    expect(readArtDirectionImage({ id: 0, url: "" })).toBeNull();
  });

  it("keeps only hand-drawn crops in the draft", () => {
    const draft = draftFromImage(readArtDirectionImage(response)!);
    expect(Object.keys(draft.crops)).toEqual(["square"]);
    expect(effectiveCrop(draft, "square", 3000, 2000).custom).toBe(true);
    expect(effectiveCrop(draft, "wide", 3000, 2000)).toEqual({ rect: autoCrop("wide", { x: 30, y: 20 }, 3000, 2000), custom: false });
  });

  it("follows the focal point for automatic crops only", () => {
    const draft = setFocalPoint(draftFromImage(readArtDirectionImage(response)!), { x: 90, y: 50 });
    expect(effectiveCrop(draft, "card", 3000, 2000).rect).toEqual(autoCrop("card", { x: 90, y: 50 }, 3000, 2000));
    expect(effectiveCrop(draft, "square", 3000, 2000).rect).toEqual(response.artDirection.crops.square);
  });

  it("drops a drawn crop that matches the automatic one and can reset", () => {
    let draft = draftFromImage(readArtDirectionImage(response)!);
    draft = setShapeCrop(draft, "portrait", autoCrop("portrait", draft.focalPoint, 3000, 2000), 3000, 2000);
    expect(draft.crops.portrait).toBeUndefined();
    draft = resetShapeCrop(draft, "square");
    expect(draftPayload(draft)).toEqual({ focalPoint: { x: 30, y: 20 }, crops: {} });
  });

  it("converts between react-easy-crop percentages and crop fractions", () => {
    const rect = { x: 0.25, y: 0.1, w: 0.5, h: 0.75 };
    expect(rectFromArea(areaFromRect(rect))).toEqual(rect);
    expect(rectFromArea({ x: -3, y: 90, width: 120, height: 20 })).toEqual({ x: 0, y: 0.9, w: 1, h: 0.09999999999999998 });
  });

  it("positions a preview image so the frame shows exactly the crop", () => {
    expect(frameImageStyle({ x: 0.25, y: 0, w: 0.5, h: 1 })).toMatchObject({ width: "200%", height: "100%", left: "-50%", top: "0%" });
  });

  it("flags a crop with too few pixels for its smallest file", () => {
    expect(isLowResolution("social", { x: 0, y: 0, w: 0.3, h: 0.3 }, 3000)).toBe(true);
    expect(isLowResolution("social", { x: 0, y: 0, w: 0.5, h: 0.5 }, 3000)).toBe(false);
  });
});
