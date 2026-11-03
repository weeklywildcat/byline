/**
 * Editor art direction for a photograph: one focal point plus an optional crop
 * box per named shape. WordPress stores it on the attachment; every public
 * surface and the editor previews read it through these helpers.
 *
 * A focal point is applied with CSS `object-position`, which is exact for every
 * cover crop. Only a crop box the editor drew (tighter than, or away from, the
 * automatic crop) gets real cropped files ("renditions"), generated in
 * WordPress. The `social` shape always gets one, because social platforms crop
 * on their own. The PHP copy of this table lives in
 * `wordpress-plugin/includes/content/image-art-direction.php`; a parity test
 * keeps them identical.
 */

export const IMAGE_CROP_SHAPES = ["wide", "card", "standard", "square", "portrait", "social"] as const;
export type ImageCropShape = (typeof IMAGE_CROP_SHAPES)[number];

export type ImageCropShapeDetails = {
  label: string;
  /** Width and height of the shape, e.g. [16, 9]. */
  ratio: readonly [number, number];
  /** Where readers see it. */
  usedFor: string;
  /** Rendition widths generated for an explicit crop (never larger than the crop itself). */
  widths: readonly number[];
};

export const IMAGE_CROP_SHAPE_DETAILS: Record<ImageCropShape, ImageCropShapeDetails> = {
  wide: { label: "Wide", ratio: [16, 9], usedFor: "List leads and homepage leads", widths: [640, 1280, 1920] },
  card: { label: "Card", ratio: [3, 2], usedFor: "Homepage story cards", widths: [480, 960, 1440] },
  standard: { label: "Standard", ratio: [4, 3], usedFor: "Section lists, opinion and related coverage", widths: [480, 960, 1440] },
  square: { label: "Square", ratio: [1, 1], usedFor: "Compact lists, related stories and collections", widths: [320, 640, 1080] },
  portrait: { label: "Portrait", ratio: [4, 5], usedFor: "Athlete spotlight", widths: [400, 800, 1200] },
  social: { label: "Social", ratio: [1200, 630], usedFor: "Facebook, X, LinkedIn, Discord and Google", widths: [1200] }
};

/** 0–100 from the left and top edge, like Core's FocalPointPicker × 100. */
export type FocalPoint = { x: number; y: number };
/** Fractions (0–1) of the original image. */
export type CropRect = { x: number; y: number; w: number; h: number };
export type ImageRendition = { url: string; width: number; height: number };

export type ImageArtDirection = {
  focalPoint: FocalPoint;
  crops: Partial<Record<ImageCropShape, CropRect>>;
  renditions: Partial<Record<ImageCropShape, ImageRendition[]>>;
};

export const DEFAULT_FOCAL_POINT: FocalPoint = { x: 50, y: 50 };

const EPSILON = 0.005;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function isImageCropShape(value: unknown): value is ImageCropShape {
  return typeof value === "string" && (IMAGE_CROP_SHAPES as readonly string[]).includes(value);
}

export function shapeAspectRatio(shape: ImageCropShape) {
  const [width, height] = IMAGE_CROP_SHAPE_DETAILS[shape].ratio;
  return width / height;
}

export function normalizeFocalPoint(value: unknown): FocalPoint | null {
  if (!value || typeof value !== "object") return null;
  const { x, y } = value as Record<string, unknown>;
  if (!finite(x) || !finite(y)) return null;
  return { x: Math.round(clamp(x, 0, 100) * 100) / 100, y: Math.round(clamp(y, 0, 100) * 100) / 100 };
}

export function normalizeCropRect(value: unknown): CropRect | null {
  if (!value || typeof value !== "object") return null;
  const { x, y, w, h } = value as Record<string, unknown>;
  if (![x, y, w, h].every(finite)) return null;
  const rect = { x: x as number, y: y as number, w: w as number, h: h as number };
  if (rect.w <= 0 || rect.h <= 0 || rect.x < 0 || rect.y < 0) return null;
  if (rect.x + rect.w > 1 + EPSILON || rect.y + rect.h > 1 + EPSILON) return null;
  return {
    x: rect.x,
    y: rect.y,
    w: Math.min(rect.w, 1 - rect.x),
    h: Math.min(rect.h, 1 - rect.y)
  };
}

function normalizeRenditions(value: unknown): ImageRendition[] {
  if (!Array.isArray(value)) return [];
  const renditions = value.flatMap((item): ImageRendition[] => {
    if (!item || typeof item !== "object") return [];
    const { url, width, height } = item as Record<string, unknown>;
    if (typeof url !== "string" || !url.trim()) return [];
    if (!finite(width) || !finite(height) || width <= 0 || height <= 0) return [];
    return [{ url, width: Math.round(width), height: Math.round(height) }];
  });
  return renditions.sort((a, b) => a.width - b.width);
}

/** Validates art direction from WordPress or the snapshot; null when there is none. */
export function normalizeArtDirection(value: unknown): ImageArtDirection | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const focalPoint = normalizeFocalPoint(record.focalPoint);
  const crops: ImageArtDirection["crops"] = {};
  const renditions: ImageArtDirection["renditions"] = {};
  const rawCrops = record.crops && typeof record.crops === "object" ? record.crops as Record<string, unknown> : {};
  const rawRenditions = record.renditions && typeof record.renditions === "object" ? record.renditions as Record<string, unknown> : {};

  for (const shape of IMAGE_CROP_SHAPES) {
    const crop = normalizeCropRect(rawCrops[shape]);
    if (crop) crops[shape] = crop;
    const files = normalizeRenditions(rawRenditions[shape]);
    if (files.length) renditions[shape] = files;
  }

  if (!focalPoint && !Object.keys(crops).length && !Object.keys(renditions).length) return null;
  return { focalPoint: focalPoint ?? DEFAULT_FOCAL_POINT, crops, renditions };
}

/** The CSS `object-position` for a focal point, e.g. "30% 22%". */
export function objectPosition(focal: FocalPoint | null | undefined) {
  const point = focal ?? DEFAULT_FOCAL_POINT;
  return `${point.x}% ${point.y}%`;
}

/** True when the focal point would change what readers see. */
export function hasCustomFocalPoint(art: ImageArtDirection | null | undefined) {
  if (!art) return false;
  return Math.abs(art.focalPoint.x - 50) > 0.5 || Math.abs(art.focalPoint.y - 50) > 0.5;
}

/**
 * The crop a browser shows with `object-fit: cover` and `object-position` at
 * the focal point: the largest box of the shape, offset the way CSS offsets it.
 * Using CSS's own rule keeps the editor's "Auto" box identical to the page.
 */
export function autoCrop(shape: ImageCropShape, focal: FocalPoint | null | undefined, width: number, height: number): CropRect {
  return autoCropForRatio(shapeAspectRatio(shape), focal, width, height);
}

/** `autoCrop` for any frame ratio, e.g. a phone-sized Immersive hero. */
export function autoCropForRatio(target: number, focal: FocalPoint | null | undefined, width: number, height: number): CropRect {
  const point = focal ?? DEFAULT_FOCAL_POINT;
  if (!(width > 0) || !(height > 0) || !(target > 0)) return { x: 0, y: 0, w: 1, h: 1 };
  const source = width / height;
  if (source > target) {
    const w = target / source;
    return { x: (1 - w) * (point.x / 100), y: 0, w, h: 1 };
  }
  const h = source / target;
  return { x: 0, y: (1 - h) * (point.y / 100), w: 1, h };
}

/** True when an editor-drawn crop differs from the automatic one (so it needs files). */
export function isCustomCrop(crop: CropRect | null | undefined, auto: CropRect) {
  if (!crop) return false;
  return Math.abs(crop.x - auto.x) > EPSILON || Math.abs(crop.y - auto.y) > EPSILON
    || Math.abs(crop.w - auto.w) > EPSILON || Math.abs(crop.h - auto.h) > EPSILON;
}

export type ArtDirectedSource = {
  src: string;
  srcSet: string;
  width: number;
  height: number;
};

/** Generated files for a shape, largest last; null when the shape is shown with CSS. */
export function artDirectedSource(art: ImageArtDirection | null | undefined, shape: ImageCropShape): ArtDirectedSource | null {
  const files = art?.renditions[shape];
  if (!files?.length) return null;
  const largest = files[files.length - 1];
  return {
    src: largest.url,
    srcSet: files.map((file) => `${file.url} ${file.width}w`).join(", "),
    width: largest.width,
    height: largest.height
  };
}
