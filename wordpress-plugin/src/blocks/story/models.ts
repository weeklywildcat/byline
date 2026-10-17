export type StoryImage = { id?: number; url: string; alt: string; width?: number; height?: number; srcSet?: string; sizes?: string; credit?: string };
export type Annotation = { id: string; x: number; y: number; title: string; body: string };
export const MAX_ANNOTATIONS = 12;
export function newAnnotationId(): string {
  return globalThis.crypto?.randomUUID?.() || `note-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
export function clampCoordinate(value: number): number { return Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 50; }
export function changeAnnotations(items: Annotation[], action: 'add' | 'remove' | 'up' | 'down', id: string, point = { x: 50, y: 50 }): Annotation[] {
  if (action === 'add') return items.length < MAX_ANNOTATIONS && !items.some((item) => item.id === id)
    ? [...items, { id, x: clampCoordinate(point.x), y: clampCoordinate(point.y), title: '', body: '' }] : items;
  const index = items.findIndex((item) => item.id === id);
  if (index < 0) return items;
  if (action === 'remove') return items.filter((item) => item.id !== id);
  const next = [...items]; const destination = index + (action === 'up' ? -1 : 1);
  if (destination < 0 || destination >= items.length) return items;
  [next[index], next[destination]] = [next[destination], next[index]];
  return next;
}
export function mismatchedRatios(before?: StoryImage, after?: StoryImage): boolean {
  if (!before?.width || !before.height || !after?.width || !after.height) return false;
  return Math.abs((before.width / before.height) / (after.width / after.height) - 1) > .12;
}
export function imageFromMedia(media: any): StoryImage {
  return {
    id: media.id, url: media.url || media.source_url || '', alt: media.alt || media.alt_text || '',
    width: media.width || media.media_details?.width, height: media.height || media.media_details?.height,
    srcSet: media.byline_story_image?.srcSet || '', sizes: media.byline_story_image?.sizes || '', credit: media.byline_story_image?.credit || ''
  };
}
