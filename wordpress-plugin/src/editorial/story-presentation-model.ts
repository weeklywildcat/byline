/**
 * The author's two presentation choices, as the editor stores them in post meta
 * (see includes/content/story-presentation.php). Anything unrecognized reads as
 * the default, matching the server and the public site.
 */
export type StoryPresentation = 'standard' | 'immersive';
export type ImmersiveAlignment = 'bottom-left' | 'center';

export const STORY_PRESENTATION_META = 'byline_story_presentation';
export const STORY_IMMERSIVE_ALIGNMENT_META = 'byline_story_immersive_alignment';

export const STORY_PRESENTATION_OPTIONS: ReadonlyArray<{ value: StoryPresentation; label: string }> = [
  { value: 'standard', label: 'Standard' },
  { value: 'immersive', label: 'Immersive' }
];

export const IMMERSIVE_ALIGNMENT_OPTIONS: ReadonlyArray<{ value: ImmersiveAlignment; label: string }> = [
  { value: 'bottom-left', label: 'Bottom left' },
  { value: 'center', label: 'Center' }
];

export function normalizeStoryPresentation(value: unknown): StoryPresentation {
  return value === 'immersive' ? 'immersive' : 'standard';
}

export function normalizeImmersiveAlignment(value: unknown): ImmersiveAlignment {
  return value === 'center' ? 'center' : 'bottom-left';
}

export function readStoryPresentation(meta: unknown): { presentation: StoryPresentation; alignment: ImmersiveAlignment } {
  const record = meta && typeof meta === 'object' ? (meta as Record<string, unknown>) : {};
  return {
    presentation: normalizeStoryPresentation(record[STORY_PRESENTATION_META]),
    alignment: normalizeImmersiveAlignment(record[STORY_IMMERSIVE_ALIGNMENT_META])
  };
}

/** The `meta` patch for one change; only the changed key is sent. */
export function storyPresentationMetaPatch(change: { presentation?: unknown; alignment?: unknown }): Record<string, string> {
  return {
    ...(change.presentation !== undefined ? { [STORY_PRESENTATION_META]: normalizeStoryPresentation(change.presentation) } : {}),
    ...(change.alignment !== undefined ? { [STORY_IMMERSIVE_ALIGNMENT_META]: normalizeImmersiveAlignment(change.alignment) } : {})
  };
}
