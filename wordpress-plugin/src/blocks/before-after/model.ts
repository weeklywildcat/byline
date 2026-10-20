import type { StoryImage } from '../story/models';

/** `cover` crops the After photograph to the Before frame; `contain` shows both complete, with margins where their shapes differ. */
export type ComparisonFit = 'cover' | 'contain';
export const normalizeFit = (value: unknown): ComparisonFit => value === 'contain' ? 'contain' : 'cover';

const shape = (image?: StoryImage) => image?.width && image.height ? image.width / image.height : 0;

/**
 * Width over height of the comparison frame. The frame is sized from the
 * photographs' shapes so a tall pair is capped to the screen instead of
 * running past it: the Before photograph's shape when the After photograph is
 * cropped to match, the narrower of the two when both are shown complete.
 * Without dimensions the photographs size the frame themselves.
 */
export function comparisonAspect(before: StoryImage | undefined, after: StoryImage | undefined, fit: ComparisonFit): number | undefined {
  const shapes = [shape(before), shape(after)].filter(Boolean);
  if (!shapes.length) return undefined;
  return Math.round((fit === 'contain' ? Math.min(...shapes) : shape(before) || shapes[0]) * 1000) / 1000;
}

/** The credit line WordPress prints under the comparison (see byline_story_render_before_after), for display in the editor only. */
export function comparisonCredit(credits: { before?: string; after?: string }, labels: { before: string; after: string }): string {
  const named = ([[credits.before, labels.before], [credits.after, labels.after]] as const).filter(([credit]) => credit);
  const unique = Array.from(new Set(named.map(([credit]) => credit)));
  if (!unique.length) return '';
  return unique.length === 1 ? `Photo: ${unique[0]}` : `Photo: ${named.map(([credit, label]) => `${credit} (${label})`).join(', ')}`;
}
