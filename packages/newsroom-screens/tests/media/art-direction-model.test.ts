import { autoCrop } from "@byline/core";
import { describe, expect, it } from "vitest";
import { draftFromArtDirection, draftSave, draftsEqual, effectiveCrop, isLowResolution, rebasedUpdatedAt, resetShapeCrop, setShapeCrop } from "../../src/media/art-direction-model";

const image = { width: 3000, height: 2000, intent: { version: 1 as const, focalPoint: { x: 20, y: 50 }, crops: { square: { x: 0, y: 0, w: 2 / 3, h: 1 } } } };

describe("art-direction draft", () => {
  it("starts from saved intent and treats a crop drawn at the automatic position as Auto", () => {
    const draft = draftFromArtDirection(image);
    expect(effectiveCrop(draft, "square", 3000, 2000).custom).toBe(true);
    expect(effectiveCrop(draft, "wide", 3000, 2000)).toEqual({ rect: autoCrop("wide", { x: 20, y: 50 }, 3000, 2000), custom: false });
    const same = setShapeCrop(draft, "wide", autoCrop("wide", draft.focalPoint, 3000, 2000), 3000, 2000);
    expect(same.crops.wide).toBeUndefined();
    const custom = setShapeCrop(draft, "wide", { x: 0, y: 0, w: 1, h: 0.84375 }, 3000, 2000);
    expect(custom.crops.wide).toBeDefined();
    expect(draftsEqual(draft, custom)).toBe(false);
    expect(draftsEqual(resetShapeCrop(custom, "wide"), draft)).toBe(true);
    expect(draftSave(draft, "2026-11-01T00:00:00.000Z")).toEqual({ focalPoint: { x: 20, y: 50 }, crops: draft.crops, expectedUpdatedAt: "2026-11-01T00:00:00.000Z" });
  });

  it("flags crops with fewer pixels than the smallest file the site wants", () => {
    expect(isLowResolution("wide", { x: 0, y: 0, w: 0.2, h: 0.2 }, 3000)).toBe(true);
    expect(isLowResolution("wide", { x: 0, y: 0, w: 1, h: 0.84 }, 3000)).toBe(false);
  });

  it("rebases a metadata form only onto its own crop save", () => {
    const t0 = "2026-11-01T12:00:00.000Z";
    const t1 = "2026-11-01T12:05:00.000Z";
    expect(rebasedUpdatedAt(t0, { loadedUpdatedAt: t0, savedUpdatedAt: t1 })).toBe(t1);
    expect(rebasedUpdatedAt(t0, { loadedUpdatedAt: "2026-11-01T12:00:00Z", savedUpdatedAt: t1 })).toBe(t1);
    expect(rebasedUpdatedAt(t0, { loadedUpdatedAt: "2026-11-01T12:01:00.000Z", savedUpdatedAt: t1 })).toBe(t0);
    expect(rebasedUpdatedAt(t0, null)).toBe(t0);
  });
});
