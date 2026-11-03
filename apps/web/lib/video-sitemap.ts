import { isoDurationSeconds } from "@byline/core";
import { escapeXml, SITEMAP_NAMESPACE } from "@/lib/sitemap-xml";
import { getVideoStoryMetadata } from "@/lib/story-video";
import { getPostHref, getPostRouteParts, type WordPressPost } from "@/lib/wordpress";

export const VIDEO_SITEMAP_NAMESPACE = "http://www.google.com/schemas/sitemap-video/1.1";
/** Google ignores `<video:duration>` outside 1–28,800 seconds. */
const MAX_VIDEO_DURATION_SECONDS = 28800;

/**
 * Google's video sitemap: one entry per published video story, at the story's
 * own canonical URL. `posts` must already be limited to publicly visible
 * stories. Articles are never listed, even with YouTube embeds in their body;
 * the title, description, thumbnail and player URL are the ones the page's
 * VideoObject names.
 */
export function buildVideoSitemapXml(posts: WordPressPost[], { siteUrl }: { siteUrl: string }) {
  const urls = posts.flatMap((post) => {
    const video = getVideoStoryMetadata(post);
    if (!video || !getPostRouteParts(post)) return [];
    const seconds = isoDurationSeconds(video.duration);
    const duration = seconds !== null && seconds <= MAX_VIDEO_DURATION_SECONDS ? `\n      <video:duration>${seconds}</video:duration>` : "";
    return [`  <url>
    <loc>${escapeXml(`${siteUrl}${getPostHref(post)}`)}</loc>
    <video:video>
      <video:thumbnail_loc>${escapeXml(video.thumbnailUrl)}</video:thumbnail_loc>
      <video:title>${escapeXml(video.name)}</video:title>
      <video:description>${escapeXml(video.description)}</video:description>
      <video:player_loc>${escapeXml(video.embedUrl)}</video:player_loc>${duration}
      <video:publication_date>${escapeXml(video.uploadDate)}</video:publication_date>
    </video:video>
  </url>`];
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="${SITEMAP_NAMESPACE}"
  xmlns:video="${VIDEO_SITEMAP_NAMESPACE}">
${urls.join("\n")}
</urlset>`;
}
