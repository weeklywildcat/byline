/**
 * Art direction for one photo: the neutral contract between the Media
 * art-direction editor and a host, plus the editor's pure draft model.
 *
 * Ported from the WordPress photo-crops editor
 * (`wordpress-plugin/src/editorial/photo-crops/photo-crops-model.ts`) onto
 * the provider-neutral `ImageArtDirectionIntent`: a focal point plus only the
 * crops an editor drew that differ from the automatic focal-point crop. No
 * URLs or renditions are ever part of the intent; prepared publication files
 * are the host's business.
 */
import {
  IMAGE_CROP_SHAPE_DETAILS,
  autoCrop,
  isCustomCrop,
  normalizeArtDirectionIntent,
  normalizeCropRect,
  normalizeFocalPoint,
  type CropRect,
  type FocalPoint,
  type ImageArtDirectionIntent,
  type ImageCropShape
} from "@byline/core";
import type { MediaPublicationDetail } from "./media-library-model";

/** What the editor loads for one photo. */
export type MediaArtDirection = {
  mediaId: number;
  filename: string;
  alt: string;
  /** The oriented original's size: crops are fractions of it. */
  width: number;
  height: number;
  /** The private, authenticated original (precise cropping); never public. */
  imageUrl: string;
  /** The private Library preview, for small placement thumbnails. */
  previewUrl: string | null;
  /** Animated GIF/WebP: the focal point applies, custom crops do not. */
  animated: boolean;
  intent: ImageArtDirectionIntent;
  /** Compare-and-swap token for the save. */
  updatedAt: string;
  canUpdate: boolean;
  publication: MediaPublicationDetail;
};

export type MediaArtDirectionSave = {
  focalPoint: FocalPoint;
  crops: Partial<Record<ImageCropShape, CropRect>>;
  expectedUpdatedAt: string;
};

/** What the editor is changing. */
export type CropDraft = { focalPoint: FocalPoint; crops: Partial<Record<ImageCropShape, CropRect>> };

/** react-easy-crop's cropped area, in percent of the image. */
export type CropArea = { x: number; y: number; width: number; height: number };

const dimensions = (image: Pick<MediaArtDirection, "width" | "height">) => ({ width: image.width, height: image.height });

/** A draft from saved intent, keeping only crops that differ from automatic. */
export function draftFromArtDirection(image: Pick<MediaArtDirection, "width" | "height" | "intent">): CropDraft {
  const intent = normalizeArtDirectionIntent(image.intent, dimensions(image));
  return { focalPoint: intent.focalPoint, crops: intent.crops };
}

export function effectiveCrop(draft: CropDraft, shape: ImageCropShape, width: number, height: number): { rect: CropRect; custom: boolean } {
  const custom = draft.crops[shape];
  return custom ? { rect: custom, custom: true } : { rect: autoCrop(shape, draft.focalPoint, width, height), custom: false };
}

export function setFocalPoint(draft: CropDraft, value: FocalPoint): CropDraft {
  return { ...draft, focalPoint: normalizeFocalPoint(value) ?? draft.focalPoint };
}

/** Records a hand-drawn crop; one that matches the automatic crop is dropped (it stays Auto). */
export function setShapeCrop(draft: CropDraft, shape: ImageCropShape, rect: CropRect, width: number, height: number): CropDraft {
  const crops = { ...draft.crops };
  const normalized = normalizeCropRect(rect);
  if (normalized && isCustomCrop(normalized, autoCrop(shape, draft.focalPoint, width, height))) crops[shape] = normalized;
  else delete crops[shape];
  return { ...draft, crops };
}

export function resetShapeCrop(draft: CropDraft, shape: ImageCropShape): CropDraft {
  const crops = { ...draft.crops };
  delete crops[shape];
  return { ...draft, crops };
}

export function draftSave(draft: CropDraft, expectedUpdatedAt: string): MediaArtDirectionSave {
  return { focalPoint: draft.focalPoint, crops: draft.crops, expectedUpdatedAt };
}

export function draftsEqual(left: CropDraft, right: CropDraft) {
  const key = (draft: CropDraft) => JSON.stringify({ f: draft.focalPoint, c: Object.keys(draft.crops).sort().map((shape) => [shape, draft.crops[shape as ImageCropShape]]) });
  return key(left) === key(right);
}

export function areaFromRect(rect: CropRect): CropArea {
  return { x: rect.x * 100, y: rect.y * 100, width: rect.w * 100, height: rect.h * 100 };
}

export function rectFromArea(area: CropArea): CropRect {
  const clamp = (value: number) => Math.min(1, Math.max(0, value / 100));
  const x = clamp(area.x);
  const y = clamp(area.y);
  return { x, y, w: Math.min(clamp(area.width), 1 - x), h: Math.min(clamp(area.height), 1 - y) };
}

/** Styles for an `<img>` inside an `overflow: hidden` frame of the crop's ratio, so the frame shows exactly `rect`. */
export function frameImageStyle(rect: CropRect) {
  return {
    position: "absolute" as const,
    maxWidth: "none",
    width: `${100 / rect.w}%`,
    height: `${100 / rect.h}%`,
    left: `${(-rect.x / rect.w) * 100}%`,
    top: `${(-rect.y / rect.h) * 100}%`
  };
}

/** True when the crop has fewer source pixels than the smallest file the site wants for it. */
export function isLowResolution(shape: ImageCropShape, rect: CropRect, width: number) {
  return width > 0 && rect.w * width < IMAGE_CROP_SHAPE_DETAILS[shape].widths[0];
}

/** Pixels across the crop, for the low-resolution note. */
export function cropPixelWidth(rect: CropRect, width: number) {
  return Math.round(rect.w * width);
}

/** Where each shape appears, for the placement previews. */
export const PLACEMENT_NOTES: Record<ImageCropShape, string> = Object.fromEntries(
  (Object.keys(IMAGE_CROP_SHAPE_DETAILS) as ImageCropShape[]).map((shape) => [shape, IMAGE_CROP_SHAPE_DETAILS[shape].usedFor])
) as Record<ImageCropShape, string>;

/**
 * What the art-direction editor reports when it closes. `loadedUpdatedAt` is
 * the version it opened; `savedUpdatedAt` the version its own save produced.
 * A caller holding unsaved metadata may adopt `savedUpdatedAt` as its
 * compare-and-swap base only when it was based on `loadedUpdatedAt` (nothing
 * else changed in between), so its own crop save is never a false conflict
 * and nobody else's edit is ever overwritten.
 */
export type ArtDirectionEditResult = { loadedUpdatedAt: string; savedUpdatedAt: string };

/** The token a metadata form should compare against after its own art-direction save. */
export function rebasedUpdatedAt(base: string, result: ArtDirectionEditResult | null): string {
  return result && Date.parse(result.loadedUpdatedAt) === Date.parse(base) ? result.savedUpdatedAt : base;
}
