import { nativeStory } from "./native-snapshot";
import { nativeVideoMetadata } from "./native-article-seo";
import { formatVideoDuration, youTubeDefaultThumbnailUrl, youTubeEmbedUrl } from "@byline/core";
import type { ArticleVideoView, StoryVideoBadgeView } from "@byline/ui";
import { stripHtml } from "@/lib/format";
import { absoluteUrl, getContributorPersonId, getNewsArticleId, getNewsArticleSchema, getOrganizationId, getPostTimestamps, getSeoDescription } from "@/lib/seo";
import { getPostContributors, getPostHref, getPostPrimaryVideo, type ArchivePost } from "@/lib/public-content";

/**
 * A video story's one video, as every public surface describes it. The page's
 * player, its `VideoObject` and the video sitemap all read this, so they name
 * the same video with the same title, description, thumbnail and player URL.
 */
export type VideoStoryMetadata = {
  videoId: string;
  /** The iframe `src`, `VideoObject.embedUrl` and `<video:player_loc>`. */
  embedUrl: string;
  name: string;
  description: string;
  thumbnailUrl: string;
  /** Timezone-aware ISO 8601: YouTube's publication time, else the story's. */
  uploadDate: string;
  /** ISO 8601, only when YouTube reported it. */
  duration?: string;
  /** "4:13", only when the duration is known. */
  durationLabel: string | null;
};

/** Google reads at most 2,048 characters of a video description. */
const VIDEO_DESCRIPTION_LIMIT = 2048;

function plainText(value: string | undefined) {
  return stripHtml(value ?? "").replace(/\s+/g, " ").trim();
}

function limit(value: string) {
  if (value.length <= VIDEO_DESCRIPTION_LIMIT) return value;
  const trimmed = value.slice(0, VIDEO_DESCRIPTION_LIMIT - 1);
  const lastSpace = trimmed.lastIndexOf(" ");
  return `${trimmed.slice(0, lastSpace > 0 ? lastSpace : trimmed.length).trim()}…`;
}

/** Null for an article, including one with YouTube embeds in its body. */
export function getVideoStoryMetadata(post: ArchivePost): VideoStoryMetadata | null {
  const native = nativeStory(post.id);
  if (native) return nativeVideoMetadata(native);
  const video = getPostPrimaryVideo(post);
  if (!video) return null;
  const headline = plainText(post.title.rendered);
  const uploadDate = video.uploadDate ?? getPostTimestamps(post).published;
  if (!uploadDate) return null;
  const name = video.title || headline;
  // The newsroom's own deck describes the video best; YouTube's description
  // and then the story's opening are fallbacks.
  const description = limit(plainText(post.excerpt.rendered) || plainText(video.description) || getSeoDescription(post.content.rendered, "") || name);
  return {
    videoId: video.videoId,
    embedUrl: youTubeEmbedUrl(video.videoId),
    name,
    description,
    thumbnailUrl: video.thumbnailUrl ?? youTubeDefaultThumbnailUrl(video.videoId),
    uploadDate,
    ...(video.duration ? { duration: video.duration } : {}),
    durationLabel: formatVideoDuration(video.duration)
  };
}

/** The player a video story's article view renders above its body. */
export function getArticleVideoView(post: ArchivePost): ArticleVideoView | null {
  const video = getVideoStoryMetadata(post);
  return video ? { videoId: video.videoId, embedUrl: video.embedUrl, title: video.name, duration: video.durationLabel } : null;
}

/** The small Video label on a video story's card. */
export function getStoryVideoBadge(post: ArchivePost): StoryVideoBadgeView | null {
  const video = getVideoStoryMetadata(post);
  return video ? { duration: video.durationLabel } : null;
}

export function getVideoObjectId(post: ArchivePost) {
  return `${absoluteUrl(getPostHref(post))}#video`;
}

/** Google's `VideoObject` for a video story; null for an article. */
export function getVideoObjectSchema(post: ArchivePost) {
  const video = getVideoStoryMetadata(post);
  if (!video) return null;
  // The same Person entities the NewsArticle names; one-off guests have no entity to point at.
  const authors = getPostContributors(post).flatMap((contributor) => {
    const id = getContributorPersonId(contributor);
    return id ? [{ "@id": id }] : [];
  });
  return {
    "@type": "VideoObject",
    "@id": getVideoObjectId(post),
    name: video.name,
    description: video.description,
    thumbnailUrl: [video.thumbnailUrl],
    uploadDate: video.uploadDate,
    embedUrl: video.embedUrl,
    ...(video.duration ? { duration: video.duration } : {}),
    ...(authors.length ? { creator: authors.length === 1 ? authors[0] : authors } : {}),
    publisher: { "@id": getOrganizationId() },
    isPartOf: { "@id": getNewsArticleId(post) }
  };
}

/**
 * The article's JSON-LD. A video story keeps its NewsArticle and adds the
 * VideoObject beside it in one graph, each pointing at the other.
 */
export function getArticleJsonLd(post: ArchivePost, options: { articleBody?: boolean } = {}) {
  const article = getNewsArticleSchema(post, options);
  const video = getVideoObjectSchema(post);
  if (!video) return article;
  const { "@context": context, ...articleNode } = article;
  return { "@context": context, "@graph": [{ ...articleNode, video: { "@id": video["@id"] } }, video] };
}

/** Published video stories, newest first as given; `posts` must already be publicly visible. */
export function getVideoStories(posts: ArchivePost[]) {
  return posts.filter((post) => getVideoStoryMetadata(post) !== null);
}
