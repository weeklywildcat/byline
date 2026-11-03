/**
 * A story's format (Article or Video) and its primary YouTube video, as the
 * editor stores them in post meta (see includes/content/story-video.php).
 * URL parsing is the shared @byline/core parser the public site uses.
 */
import { formatVideoDuration, normalizeStoryFormat, parseYouTubeVideoId, youTubeDefaultThumbnailUrl, type StoryFormat } from '@byline/core';

export type { StoryFormat };

export const STORY_FORMAT_META = 'byline_story_format';
export const STORY_VIDEO_URL_META = 'byline_primary_video_url';

/** "Article" is the label for the stored `standard` value. */
export const STORY_FORMAT_OPTIONS: ReadonlyArray<{ value: StoryFormat; label: string }> = [
  { value: 'standard', label: 'Article' },
  { value: 'video', label: 'Video' }
];

export const VIDEO_REQUIRED_MESSAGE = 'Add a YouTube video before publishing.';
export const VIDEO_INVALID_MESSAGE = 'That isn’t a YouTube video link. Paste the link from YouTube’s Share button or address bar.';

/** What the Story Workspace receives in `format` (and the save route returns). */
export type StoryVideoSettings = {
  format: StoryFormat;
  videoUrl: string;
  video: { videoId: string; title: string; thumbnailUrl: string; duration: string } | null;
};

export function normalizeStoryVideoSettings(value: unknown): StoryVideoSettings {
  const record = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const video = record.video && typeof record.video === 'object' ? (record.video as Record<string, unknown>) : null;
  const videoId = typeof video?.videoId === 'string' ? video.videoId : '';
  return {
    format: normalizeStoryFormat(record.format),
    videoUrl: typeof record.videoUrl === 'string' ? record.videoUrl : '',
    video: video && videoId ? {
      videoId,
      title: typeof video.title === 'string' ? video.title : '',
      thumbnailUrl: typeof video.thumbnailUrl === 'string' && video.thumbnailUrl ? video.thumbnailUrl : youTubeDefaultThumbnailUrl(videoId),
      duration: typeof video.duration === 'string' ? video.duration : ''
    } : null
  };
}

export type VideoUrlState =
  | { state: 'empty' }
  | { state: 'invalid' }
  | { state: 'valid'; videoId: string; thumbnailUrl: string };

/** Whether a pasted value is a YouTube video, without asking the server. */
export function checkVideoUrl(url: string): VideoUrlState {
  if (!url.trim()) return { state: 'empty' };
  const videoId = parseYouTubeVideoId(url);
  return videoId ? { state: 'valid', videoId, thumbnailUrl: youTubeDefaultThumbnailUrl(videoId) } : { state: 'invalid' };
}

/** The writer-facing problem with a video story's URL, or null when it is ready. */
export function videoStoryProblem(format: StoryFormat, url: string): string | null {
  if (format !== 'video') return null;
  const check = checkVideoUrl(url);
  return check.state === 'valid' ? null : check.state === 'invalid' ? VIDEO_INVALID_MESSAGE : VIDEO_REQUIRED_MESSAGE;
}

/** "4:13" once YouTube has reported the duration. */
export function videoDurationLabel(duration: string): string | null {
  return formatVideoDuration(duration);
}

export function readStoryVideoMeta(meta: unknown): { format: StoryFormat; videoUrl: string } {
  const record = meta && typeof meta === 'object' ? (meta as Record<string, unknown>) : {};
  return {
    format: normalizeStoryFormat(record[STORY_FORMAT_META]),
    videoUrl: typeof record[STORY_VIDEO_URL_META] === 'string' ? (record[STORY_VIDEO_URL_META] as string) : ''
  };
}

/** The `meta` patch for one change; only the changed key is sent. */
export function storyVideoMetaPatch(change: { format?: unknown; videoUrl?: unknown }): Record<string, string> {
  return {
    ...(change.format !== undefined ? { [STORY_FORMAT_META]: normalizeStoryFormat(change.format) } : {}),
    ...(change.videoUrl !== undefined ? { [STORY_VIDEO_URL_META]: typeof change.videoUrl === 'string' ? change.videoUrl.trim() : '' } : {})
  };
}
