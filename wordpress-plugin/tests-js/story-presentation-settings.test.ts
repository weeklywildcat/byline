import { describe, expect, it } from 'vitest';
import {
  IMMERSIVE_ALIGNMENT_OPTIONS,
  STORY_IMMERSIVE_ALIGNMENT_META,
  STORY_PRESENTATION_META,
  STORY_PRESENTATION_OPTIONS,
  normalizeImmersiveAlignment,
  normalizeStoryPresentation,
  readStoryPresentation,
  storyPresentationMetaPatch
} from '../src/editorial/story-presentation-model';

describe('story presentation editor model', () => {
  it('offers exactly the two presentations and two headline positions, nothing else', () => {
    expect(STORY_PRESENTATION_OPTIONS.map((option) => [option.value, option.label])).toEqual([['standard', 'Standard'], ['immersive', 'Immersive']]);
    expect(IMMERSIVE_ALIGNMENT_OPTIONS.map((option) => [option.value, option.label])).toEqual([['bottom-left', 'Bottom left'], ['center', 'Center']]);
  });

  it('defaults to Standard and Bottom left for missing, partial or unknown meta', () => {
    expect(readStoryPresentation(undefined)).toEqual({ presentation: 'standard', alignment: 'bottom-left' });
    expect(readStoryPresentation({})).toEqual({ presentation: 'standard', alignment: 'bottom-left' });
    expect(readStoryPresentation({ [STORY_PRESENTATION_META]: 'fullbleed', [STORY_IMMERSIVE_ALIGNMENT_META]: 'right' })).toEqual({ presentation: 'standard', alignment: 'bottom-left' });
    expect(readStoryPresentation({ [STORY_PRESENTATION_META]: 'immersive', [STORY_IMMERSIVE_ALIGNMENT_META]: 'center' })).toEqual({ presentation: 'immersive', alignment: 'center' });
  });

  it('writes only the key that changed, normalized', () => {
    expect(storyPresentationMetaPatch({ presentation: 'immersive' })).toEqual({ byline_story_presentation: 'immersive' });
    expect(storyPresentationMetaPatch({ alignment: 'center' })).toEqual({ byline_story_immersive_alignment: 'center' });
    expect(storyPresentationMetaPatch({ presentation: 'nonsense' })).toEqual({ byline_story_presentation: 'standard' });
    expect(storyPresentationMetaPatch({})).toEqual({});
    expect(normalizeStoryPresentation(null)).toBe('standard');
    expect(normalizeImmersiveAlignment(42)).toBe('bottom-left');
  });
});
