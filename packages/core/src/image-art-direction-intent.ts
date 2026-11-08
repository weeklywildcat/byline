import {
  DEFAULT_FOCAL_POINT,
  IMAGE_CROP_SHAPES,
  autoCrop,
  isCustomCrop,
  isImageCropShape,
  normalizeCropRect,
  normalizeFocalPoint,
  shapeAspectRatio,
  type CropRect,
  type FocalPoint,
  type ImageArtDirection,
  type ImageCropShape
} from "./image-crops";

/**
 * Editorial art direction as intent: what an editor decided about a photo,
 * never what a machine generated from it. One focal point plus only the crop
 * boxes an editor drew that differ from the automatic focal-point crop.
 *
 * This is the provider-neutral record the Payload newsroom stores on Media
 * (`artDirection`). It has no URLs and no renditions: prepared publication
 * files are a separate, generated manifest (`@byline/content`
 * `publication-media`). The legacy WordPress `ImageArtDirection` (with its
 * generated `renditions`) stays as it is for the production WordPress path;
 * `artDirectionIntentFromLegacy` keeps its semantics for a future import.
 */
export const IMAGE_ART_DIRECTION_INTENT_VERSION = 1 as const;

export type ImageArtDirectionIntent = {
  version: typeof IMAGE_ART_DIRECTION_INTENT_VERSION;
  /** 0–100 from the left and top edge. */
  focalPoint: FocalPoint;
  /** Editor-drawn crops only, as fractions (0–1) of the oriented original. */
  crops: Partial<Record<ImageCropShape, CropRect>>;
};

export type ImageDimensions = { width: number; height: number };

/** How far an editor's crop may stray from its shape's ratio (rounding in a cropper, a 1px edge). */
export const CROP_RATIO_TOLERANCE = 0.02;

export function defaultArtDirectionIntent(): ImageArtDirectionIntent {
  return { version: IMAGE_ART_DIRECTION_INTENT_VERSION, focalPoint: { ...DEFAULT_FOCAL_POINT }, crops: {} };
}

const hasDimensions = (dimensions: ImageDimensions | null | undefined): dimensions is ImageDimensions =>
  Boolean(dimensions && dimensions.width > 0 && dimensions.height > 0);

function cropMatchesShape(shape: ImageCropShape, rect: CropRect, dimensions: ImageDimensions) {
  const ratio = (rect.w * dimensions.width) / (rect.h * dimensions.height);
  return Math.abs(ratio / shapeAspectRatio(shape) - 1) <= CROP_RATIO_TOLERANCE;
}

/**
 * Drops crops that are the automatic focal-point crop anyway (so they never
 * read as Custom) and, when the image's size is known, crops that are not the
 * shape they claim to be.
 */
export function canonicalArtDirectionIntent(intent: ImageArtDirectionIntent, dimensions?: ImageDimensions | null): ImageArtDirectionIntent {
  if (!hasDimensions(dimensions)) return { version: IMAGE_ART_DIRECTION_INTENT_VERSION, focalPoint: { ...intent.focalPoint }, crops: { ...intent.crops } };
  const crops: ImageArtDirectionIntent["crops"] = {};
  for (const shape of IMAGE_CROP_SHAPES) {
    const crop = intent.crops[shape];
    if (!crop || !cropMatchesShape(shape, crop, dimensions)) continue;
    if (isCustomCrop(crop, autoCrop(shape, intent.focalPoint, dimensions.width, dimensions.height))) crops[shape] = { ...crop };
  }
  return { version: IMAGE_ART_DIRECTION_INTENT_VERSION, focalPoint: { ...intent.focalPoint }, crops };
}

/**
 * Lenient read of stored intent (or anything shaped like it, including the
 * legacy WordPress record): clamps the focal point, drops unknown shapes,
 * malformed boxes and any generated data. Never null: no intent is the
 * centered default.
 */
export function normalizeArtDirectionIntent(value: unknown, dimensions?: ImageDimensions | null): ImageArtDirectionIntent {
  if (!value || typeof value !== "object") return defaultArtDirectionIntent();
  const record = value as Record<string, unknown>;
  const focalPoint = normalizeFocalPoint(record.focalPoint) ?? { ...DEFAULT_FOCAL_POINT };
  const crops: ImageArtDirectionIntent["crops"] = {};
  const raw = record.crops && typeof record.crops === "object" && !Array.isArray(record.crops) ? (record.crops as Record<string, unknown>) : {};
  for (const shape of IMAGE_CROP_SHAPES) {
    const crop = normalizeCropRect(raw[shape]);
    if (crop) crops[shape] = crop;
  }
  return canonicalArtDirectionIntent({ version: IMAGE_ART_DIRECTION_INTENT_VERSION, focalPoint, crops }, dimensions);
}

export type ArtDirectionIntentParse = { ok: true; intent: ImageArtDirectionIntent } | { ok: false; error: string };

/**
 * Strict read of an editor's save: anything that is not a known shape, a
 * finite 0–100 focal point or a normalized crop inside the image is refused
 * with a reason rather than silently dropped. A crop equal to the automatic
 * one is accepted and simply not stored.
 */
export function parseArtDirectionIntentInput(value: unknown, dimensions: ImageDimensions | null): ArtDirectionIntentParse {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { ok: false, error: "Send a focal point and crops." };
  const record = value as Record<string, unknown>;
  let focalPoint: FocalPoint = { ...DEFAULT_FOCAL_POINT };
  if (record.focalPoint !== undefined && record.focalPoint !== null) {
    const point = record.focalPoint as Record<string, unknown>;
    const finite = (n: unknown) => typeof n === "number" && Number.isFinite(n);
    if (typeof point !== "object" || !finite(point.x) || !finite(point.y)) return { ok: false, error: "The focal point needs numeric x and y." };
    if ((point.x as number) < 0 || (point.x as number) > 100 || (point.y as number) < 0 || (point.y as number) > 100) return { ok: false, error: "The focal point must be inside the photo (0–100)." };
    focalPoint = normalizeFocalPoint(point)!;
  }
  const crops: ImageArtDirectionIntent["crops"] = {};
  if (record.crops !== undefined && record.crops !== null) {
    if (typeof record.crops !== "object" || Array.isArray(record.crops)) return { ok: false, error: "Crops must be keyed by shape." };
    for (const [shape, rect] of Object.entries(record.crops as Record<string, unknown>)) {
      if (!isImageCropShape(shape)) return { ok: false, error: `Unknown crop shape "${shape.slice(0, 40)}".` };
      if (rect === null) continue;
      const normalized = normalizeCropRect(rect);
      if (!normalized) return { ok: false, error: `The ${shape} crop must be inside the photo.` };
      if (hasDimensions(dimensions) && !cropMatchesShape(shape, normalized, dimensions)) return { ok: false, error: `The ${shape} crop is not the ${shape} shape.` };
      crops[shape] = normalized;
    }
  }
  return { ok: true, intent: canonicalArtDirectionIntent({ version: IMAGE_ART_DIRECTION_INTENT_VERSION, focalPoint, crops }, dimensions) };
}

/** True when two intents would produce the same publication bytes. */
export function artDirectionIntentsEqual(left: ImageArtDirectionIntent, right: ImageArtDirectionIntent) {
  const same = (a: number, b: number) => Math.abs(a - b) < 1e-9;
  if (!same(left.focalPoint.x, right.focalPoint.x) || !same(left.focalPoint.y, right.focalPoint.y)) return false;
  for (const shape of IMAGE_CROP_SHAPES) {
    const a = left.crops[shape];
    const b = right.crops[shape];
    if (!a && !b) continue;
    if (!a || !b || !same(a.x, b.x) || !same(a.y, b.y) || !same(a.w, b.w) || !same(a.h, b.h)) return false;
  }
  return true;
}

/** The box readers see for a shape: the editor's crop, or the automatic focal-point crop. */
export function effectiveShapeCrop(intent: ImageArtDirectionIntent, shape: ImageCropShape, dimensions: ImageDimensions): { rect: CropRect; custom: boolean } {
  const custom = intent.crops[shape];
  return custom ? { rect: custom, custom: true } : { rect: autoCrop(shape, intent.focalPoint, dimensions.width, dimensions.height), custom: false };
}

/** A fractional crop as whole source pixels, always inside the image and at least 1×1. */
export function cropPixelBox(rect: CropRect, dimensions: ImageDimensions) {
  const left = Math.min(dimensions.width - 1, Math.max(0, Math.round(rect.x * dimensions.width)));
  const top = Math.min(dimensions.height - 1, Math.max(0, Math.round(rect.y * dimensions.height)));
  const width = Math.max(1, Math.min(dimensions.width - left, Math.round(rect.w * dimensions.width)));
  const height = Math.max(1, Math.min(dimensions.height - top, Math.round(rect.h * dimensions.height)));
  return { left, top, width, height };
}

/**
 * The intent a WordPress attachment's art direction expresses: its focal
 * point and drawn crops. WordPress's generated renditions are not intent and
 * are dropped; the new pipeline prepares its own content-addressed files.
 */
export function artDirectionIntentFromLegacy(value: ImageArtDirection | null | undefined, dimensions?: ImageDimensions | null): ImageArtDirectionIntent {
  if (!value) return defaultArtDirectionIntent();
  return normalizeArtDirectionIntent({ focalPoint: value.focalPoint, crops: value.crops }, dimensions);
}
