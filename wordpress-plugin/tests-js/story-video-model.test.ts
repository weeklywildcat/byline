import { describe, expect, it } from 'vitest';
import {
  STORY_FORMAT_META,
  STORY_FORMAT_OPTIONS,
  STORY_VIDEO_URL_META,
  VIDEO_INVALID_MESSAGE,
  VIDEO_REQUIRED_MESSAGE,
  checkVideoUrl,
  normalizeStoryVideoSettings,
  readStoryVideoMeta,
  storyVideoMetaPatch,
  videoStoryProblem
} from '../src/editorial/story-video-model';

const ID = 'dQw4w9WgXcQ';

describe('story format editor model', () => {
  it('offers Article and Video only, with Article stored as standard', () => {
    expect(STORY_FORMAT_OPTIONS.map((option) => [option.value, option.label])).toEqual([['standard', 'Article'], ['video', 'Video']]);
  });

  it('reads missing or unknown meta as an Article with no video', () => {
    expect(readStoryVideoMeta(undefined)).toEqual({ format: 'standard', videoUrl: '' });
    expect(readStoryVideoMeta({ [STORY_FORMAT_META]: 'photo', [STORY_VIDEO_URL_META]: 5 })).toEqual({ format: 'standard', videoUrl: '' });
    expect(readStoryVideoMeta({ [STORY_FORMAT_META]: 'video', [STORY_VIDEO_URL_META]: `https://youtu.be/${ID}` })).toEqual({ format: 'video', videoUrl: `https://youtu.be/${ID}` });
  });

  it('writes only the key that changed', () => {
    expect(storyVideoMetaPatch({ format: 'video' })).toEqual({ byline_story_format: 'video' });
    expect(storyVideoMetaPatch({ format: 'nonsense' })).toEqual({ byline_story_format: 'standard' });
    expect(storyVideoMetaPatch({ videoUrl: ` https://youtu.be/${ID} ` })).toEqual({ byline_primary_video_url: `https://youtu.be/${ID}` });
    expect(storyVideoMetaPatch({})).toEqual({});
  });

  it('previews any normal YouTube link and rejects everything else', () => {
    for (const url of [`https://www.youtube.com/watch?v=${ID}`, `https://youtu.be/${ID}`, `https://www.youtube.com/shorts/${ID}`, `https://www.youtube.com/embed/${ID}`]) {
      expect(checkVideoUrl(url)).toEqual({ state: 'valid', videoId: ID, thumbnailUrl: `https://i.ytimg.com/vi/${ID}/hqdefault.jpg` });
    }
    expect(checkVideoUrl('')).toEqual({ state: 'empty' });
    expect(checkVideoUrl('https://vimeo.com/1')).toEqual({ state: 'invalid' });
  });

  it('asks a video story, and only a video story, for its video', () => {
    expect(videoStoryProblem('standard', '')).toBeNull();
    expect(videoStoryProblem('video', '')).toBe(VIDEO_REQUIRED_MESSAGE);
    expect(VIDEO_REQUIRED_MESSAGE).toBe('Add a YouTube video before publishing.');
    expect(videoStoryProblem('video', 'https://vimeo.com/1')).toBe(VIDEO_INVALID_MESSAGE);
    expect(videoStoryProblem('video', `https://youtu.be/${ID}`)).toBeNull();
  });

  it('normalizes the Story Workspace payload', () => {
    expect(normalizeStoryVideoSettings(undefined)).toEqual({ format: 'standard', videoUrl: '', video: null });
    expect(normalizeStoryVideoSettings({ format: 'video', videoUrl: 'x', video: { videoId: ID, title: 'Pep rally', thumbnailUrl: '', duration: 'PT1M' } }).video)
      .toEqual({ videoId: ID, title: 'Pep rally', thumbnailUrl: `https://i.ytimg.com/vi/${ID}/hqdefault.jpg`, duration: 'PT1M' });
  });
});
