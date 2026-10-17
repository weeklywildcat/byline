import { getWordPressInstant } from "@/lib/dates";
import { stripHtml } from "@/lib/format";
import { getPostHref, getPostRouteParts, type WordPressPost } from "@/lib/wordpress";

const NEWS_NAMESPACE = "http://www.google.com/schemas/sitemap-news/0.9";
const SITEMAP_NAMESPACE = "http://www.sitemaps.org/schemas/sitemap/0.9";
const NEWS_PUBLICATION_LANGUAGE = "en";
/** Google News only reads stories from the last two days; older URLs are noise. */
export const NEWS_RECENCY_WINDOW_MS = 2 * 24 * 60 * 60 * 1000;
export const NEWS_SITEMAP_LIMIT = 1000;

export function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

type NewsSitemapOptions = {
  siteUrl: string;
  publicationName: string;
  timeZone: string;
  now: number;
};

function publishedAt(post: WordPressPost, timeZone: string) {
  return getWordPressInstant({ gmt: post.date_gmt, local: post.date }, timeZone);
}

/**
 * `posts` must already be limited to publicly visible stories. Only those
 * published within the news window, with a canonical article URL, are listed.
 */
export function buildNewsSitemapXml(posts: WordPressPost[], { siteUrl, publicationName, timeZone, now }: NewsSitemapOptions) {
  const urls = posts
    .flatMap((post) => {
      const published = publishedAt(post, timeZone);
      if (!published || !getPostRouteParts(post)) return [];
      const age = now - published.getTime();
      if (age < 0 || age > NEWS_RECENCY_WINDOW_MS) return [];

      return [`  <url>
    <loc>${escapeXml(`${siteUrl}${getPostHref(post)}`)}</loc>
    <news:news>
      <news:publication>
        <news:name>${escapeXml(publicationName)}</news:name>
        <news:language>${NEWS_PUBLICATION_LANGUAGE}</news:language>
      </news:publication>
      <news:publication_date>${published.toISOString()}</news:publication_date>
      <news:title>${escapeXml(stripHtml(post.title.rendered))}</news:title>
    </news:news>
  </url>`];
    })
    .slice(0, NEWS_SITEMAP_LIMIT)
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="${SITEMAP_NAMESPACE}"
  xmlns:news="${NEWS_NAMESPACE}">
${urls}
</urlset>`;
}
