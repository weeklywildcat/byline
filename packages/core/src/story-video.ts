/**
 * First-class video stories. A video story is an ordinary WordPress post whose
 * Byline story format is "video" and which has one primary YouTube video. A
 * YouTube embed somewhere in an ordinary article's body does not make it one.
 *
 * WordPress stores the format and the pasted URL and fills in what YouTube
 * knows about the video (see wordpress-plugin/includes/content/story-video.php).
 * This module is the one place both the editor and the public site parse a
 * YouTube URL and validate the published projection.
 */

export type StoryFormat = "standard" | "video";

export const STORY_FORMATS: readonly StoryFormat[] = ["standard", "video"];

/** The published primary video. Only `videoId` is required; everything else is optional enrichment. */
export type PrimaryVideo = {
  provider: "youtube";
  videoId: string;
  /** The canonical watch URL on youtube.com. */
  url: string;
  title?: string;
  description?: string;
  thumbnailUrl?: string;
  /** ISO 8601 timestamp of YouTube publication. */
  uploadDate?: string;
  /** ISO 8601 duration, e.g. PT4M13S. */
  duration?: string;
};

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const YOUTUBE_HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "youtube-nocookie.com", "www.youtube-nocookie.com"]);
const PATH_PREFIXES = ["shorts", "embed", "live", "v", "e"];

export function normalizeStoryFormat(value: unknown): StoryFormat {
  return value === "video" ? "video" : "standard";
}

export function isYouTubeVideoId(value: unknown): value is string {
  return typeof value === "string" && VIDEO_ID.test(value);
}

/**
 * The video ID from a normal YouTube URL (watch, youtu.be, Shorts, embed or
 * live links, with or without the scheme), or null for anything else.
 */
export function parseYouTubeVideoId(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const trimmed = input.trim();
  if (!trimmed || trimmed.length > 2048 || /\s/.test(trimmed)) return null;
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }
  if ((url.protocol !== "https:" && url.protocol !== "http:") || url.username || url.password || url.port) return null;
  const host = url.hostname.toLowerCase();
  const segments = url.pathname.split("/").filter(Boolean);
  let candidate: string | null = null;
  if (host === "youtu.be" || host === "www.youtu.be") {
    candidate = segments.length === 1 ? segments[0] : null;
  } else if (YOUTUBE_HOSTS.has(host)) {
    if (segments.length === 1 && segments[0] === "watch") candidate = url.searchParams.get("v");
    else if (segments.length === 2 && PATH_PREFIXES.includes(segments[0])) candidate = segments[1];
  }
  return isYouTubeVideoId(candidate) ? candidate : null;
}

/** The one player URL used by the iframe, `VideoObject.embedUrl` and the video sitemap. */
export function youTubeEmbedUrl(videoId: string) {
  return `https://www.youtube.com/embed/${videoId}`;
}

export function youTubeWatchUrl(videoId: string) {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

/** A thumbnail YouTube serves for every public video (480×360). */
export function youTubeDefaultThumbnailUrl(videoId: string) {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

const ISO_DURATION = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/;

/** Seconds in an ISO 8601 duration, or null when it is not a positive duration. */
export function isoDurationSeconds(value: unknown): number | null {
  if (typeof value !== "string" || value === "P" || value.endsWith("T")) return null;
  const match = value.match(ISO_DURATION);
  if (!match) return null;
  const [, days = "0", hours = "0", minutes = "0", seconds = "0"] = match;
  const total = Number(days) * 86400 + Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds);
  return Number.isSafeInteger(total) && total > 0 ? total : null;
}

/** "4:13" or "1:02:05" for a card or player label; null when the duration is unknown. */
export function formatVideoDuration(value: unknown): string | null {
  const total = isoDurationSeconds(value);
  if (total === null) return null;
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = String(total % 60).padStart(2, "0");
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}:${seconds}` : `${minutes}:${seconds}`;
}

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";

function httpsUrl(value: unknown): string {
  const candidate = text(value);
  if (!candidate) return "";
  try {
    const url = new URL(candidate);
    return url.protocol === "https:" && !url.username && !url.password ? url.href : "";
  } catch {
    return "";
  }
}

function instant(value: unknown): string {
  const candidate = text(value);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/i.test(candidate)) return "";
  const time = Date.parse(candidate);
  return Number.isFinite(time) ? new Date(time).toISOString() : "";
}

/**
 * Validates the published WordPress projection. The video ID is the canonical
 * identifier; a stored URL or ID that is not a YouTube video yields null.
 */
export function normalizePrimaryVideo(input: unknown): PrimaryVideo | null {
  if (!isRecord(input) || (input.provider !== undefined && input.provider !== "youtube")) return null;
  const videoId = isYouTubeVideoId(input.videoId) ? input.videoId : parseYouTubeVideoId(input.url);
  if (!videoId) return null;
  const title = text(input.title);
  const description = text(input.description);
  const thumbnailUrl = httpsUrl(input.thumbnailUrl);
  const uploadDate = instant(input.uploadDate);
  const duration = isoDurationSeconds(input.duration) !== null ? String(input.duration) : "";
  return {
    provider: "youtube",
    videoId,
    url: youTubeWatchUrl(videoId),
    ...(title ? { title } : {}),
    ...(description ? { description } : {}),
    ...(thumbnailUrl ? { thumbnailUrl } : {}),
    ...(uploadDate ? { uploadDate } : {}),
    ...(duration ? { duration } : {})
  };
}
