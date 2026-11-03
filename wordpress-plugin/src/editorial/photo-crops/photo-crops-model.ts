import {
  DEFAULT_FOCAL_POINT,
  IMAGE_CROP_SHAPES,
  IMAGE_CROP_SHAPE_DETAILS,
  autoCrop,
  isCustomCrop,
  normalizeArtDirection,
  normalizeCropRect,
  normalizeFocalPoint,
  type CropRect,
  type FocalPoint,
  type ImageArtDirection,
  type ImageCropShape
} from '@byline/core';

/** GET/POST /byline/v1/media/<id>/art-direction */
export type ArtDirectionImage = {
  id: number;
  url: string;
  previewUrl: string;
  width: number;
  height: number;
  alt: string;
  artDirection: ImageArtDirection | null;
};

/** What the editor is changing: a focal point and only the crops drawn by hand. */
export type CropDraft = {
  focalPoint: FocalPoint;
  crops: Partial<Record<ImageCropShape, CropRect>>;
};

/** react-easy-crop's cropped area, in percent of the image. */
export type CropArea = { x: number; y: number; width: number; height: number };

function positive(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.round(value) : 0;
}

export function readArtDirectionImage(value: unknown): ArtDirectionImage | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const id = positive(record.id);
  const url = typeof record.url === 'string' ? record.url : '';
  if (!id || !url) return null;
  return {
    id,
    url,
    previewUrl: typeof record.previewUrl === 'string' && record.previewUrl ? record.previewUrl : url,
    width: positive(record.width),
    height: positive(record.height),
    alt: typeof record.alt === 'string' ? record.alt : '',
    artDirection: normalizeArtDirection(record.artDirection)
  };
}

/** Starts a draft from saved art direction, keeping only crops that differ from automatic. */
export function draftFromImage(image: ArtDirectionImage): CropDraft {
  const focalPoint = image.artDirection?.focalPoint ?? DEFAULT_FOCAL_POINT;
  const crops: CropDraft['crops'] = {};
  for (const shape of IMAGE_CROP_SHAPES) {
    const crop = image.artDirection?.crops[shape];
    if (crop && isCustomCrop(crop, autoCrop(shape, focalPoint, image.width, image.height))) crops[shape] = crop;
  }
  return { focalPoint, crops };
}

export function effectiveCrop(draft: CropDraft, shape: ImageCropShape, width: number, height: number) {
  const custom = draft.crops[shape];
  return custom ? { rect: custom, custom: true } : { rect: autoCrop(shape, draft.focalPoint, width, height), custom: false };
}

export function setFocalPoint(draft: CropDraft, value: FocalPoint): CropDraft {
  return { ...draft, focalPoint: normalizeFocalPoint(value) ?? draft.focalPoint };
}

/** Records a hand-drawn crop; one that matches the automatic crop is dropped. */
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

export function draftPayload(draft: CropDraft) {
  return { focalPoint: draft.focalPoint, crops: draft.crops };
}

export function draftsEqual(left: CropDraft, right: CropDraft) {
  return JSON.stringify(draftPayload(left)) === JSON.stringify(draftPayload(right));
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

/**
 * Styles for an `<img>` inside an `overflow: hidden` frame of the crop's own
 * ratio, so the frame shows exactly `rect` of the photo.
 */
export function frameImageStyle(rect: CropRect) {
  return {
    position: 'absolute' as const,
    maxWidth: 'none',
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
