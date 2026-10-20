/**
 * What a story block remembers about a photograph. The attachment stays
 * canonical: responsive candidates and the credit are resolved from it when the
 * article renders (see includes/content/story-blocks.php), so neither is saved.
 * `srcSet`, `sizes` and `credit` only appear on content saved by Byline 0.3.24
 * and earlier and are read by the legacy save functions.
 */
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
/** New markers step across the photograph instead of stacking on the centre. */
export function nextMarkerPoint(count: number): { x: number; y: number } {
  return { x: 50 + (count % 5) * 8, y: 50 + (count % 4) * 6 };
}
export function updateAnnotation(items: Annotation[], id: string, values: Partial<Omit<Annotation, 'id'>>): Annotation[] {
  return items.map((item) => item.id !== id ? item : {
    ...item, ...values,
    x: clampCoordinate(values.x ?? item.x), y: clampCoordinate(values.y ?? item.y)
  });
}
/** Arrow keys nudge a marker by 1% of the photograph, Shift by 10%. */
export function nudgeAnnotation(items: Annotation[], id: string, key: string, shift = false): Annotation[] {
  const step = shift ? 10 : 1;
  const delta = ({ ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] } as Record<string, number[]>)[key];
  const current = items.find((item) => item.id === id);
  return delta && current ? updateAnnotation(items, id, { x: current.x + delta[0], y: current.y + delta[1] }) : items;
}
/** A marker with no text points at nothing, so readers are not shown it. */
export function isAnnotationEmpty(note: Annotation): boolean { return !note.title.trim() && !note.body.trim(); }
export function publishedAnnotations(items: Annotation[]): Annotation[] { return items.filter((note) => !isAnnotationEmpty(note)); }
/**
 * Duplicated and pasted blocks arrive carrying the original's IDs, and a note's
 * ID is its public anchor. Give a block's colliding notes fresh IDs and leave
 * the rest alone; the same array comes back when nothing collides.
 */
export function withFreshIds(items: Annotation[], taken: ReadonlySet<string>, makeId: () => string = newAnnotationId): Annotation[] {
  const seen = new Set(taken);
  let changed = false;
  const next = items.map((note) => {
    if (seen.has(note.id)) { changed = true; const id = makeId(); seen.add(id); return { ...note, id }; }
    seen.add(note.id);
    return note;
  });
  return changed ? next : items;
}
export function mismatchedRatios(before?: StoryImage, after?: StoryImage): boolean {
  if (!before?.width || !before.height || !after?.width || !after.height) return false;
  return Math.abs((before.width / before.height) / (after.width / after.height) - 1) > .12;
}
export function imageFromMedia(media: any): StoryImage {
  return {
    id: media.id, url: media.url || media.source_url || '', alt: media.alt || media.alt_text || '',
    width: media.width || media.media_details?.width, height: media.height || media.media_details?.height
  };
}
/** The credit WordPress would print for a media-library item, for display in the editor only. */
export function creditFromMedia(media: any): string {
  return String(media?.byline_story_image?.credit || '');
}
export function hasImage(image?: StoryImage): image is StoryImage { return Boolean(image?.url); }
