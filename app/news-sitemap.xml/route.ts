import { filterVisibleContentPosts } from "@/lib/content";
import { stripHtml } from "@/lib/format";
import { absoluteUrl, SITE_NAME } from "@/lib/seo";
import { getAllPosts, getPostHref, type WordPressPost } from "@/lib/wordpress";

export const dynamic = "force-static";

const NEWS_NAMESPACE = "http://www.google.com/schemas/sitemap-news/0.9";
const SITEMAP_NAMESPACE = "http://www.sitemaps.org/schemas/sitemap/0.9";
const NEWS_PUBLICATION_LANGUAGE = "en";
const NEWS_RECENCY_WINDOW_MS = 2 * 24 * 60 * 60 * 1000;
const NEWS_SITEMAP_LIMIT = 1000;

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function parseWordPressDate(value: string | undefined) {
  if (!value || value.startsWith("0000-00-00")) {
    return null;
  }

  const hasTimezone = /(?:z|[+-]\d{2}:?\d{2})$/i.test(value);
  const date = new Date(hasTimezone ? value : `${value}Z`);

  return Number.isFinite(date.getTime()) ? date : null;
}

function getPublishedDate(post: Pick<WordPressPost, "date" | "date_gmt">) {
  return parseWordPressDate(post.date_gmt) ?? parseWordPressDate(post.date);
}

function isRecentNewsPost(post: WordPressPost, now: number) {
  const publishedDate = getPublishedDate(post);

  if (!publishedDate) {
    return false;
  }

  const age = now - publishedDate.getTime();

  return age >= 0 && age <= NEWS_RECENCY_WINDOW_MS;
}

function renderNewsSitemapUrl(post: WordPressPost) {
  const publishedDate = getPublishedDate(post);
  const href = getPostHref(post);

  if (!publishedDate || href === "#") {
    return "";
  }

  return `  <url>
    <loc>${escapeXml(absoluteUrl(href))}</loc>
    <news:news>
      <news:publication>
        <news:name>${escapeXml(SITE_NAME)}</news:name>
        <news:language>${NEWS_PUBLICATION_LANGUAGE}</news:language>
      </news:publication>
      <news:publication_date>${publishedDate.toISOString()}</news:publication_date>
      <news:title>${escapeXml(stripHtml(post.title.rendered))}</news:title>
    </news:news>
  </url>`;
}

export async function GET() {
  const now = Date.now();
  const posts = filterVisibleContentPosts(await getAllPosts())
    .filter((post) => isRecentNewsPost(post, now))
    .slice(0, NEWS_SITEMAP_LIMIT);
  const urls = posts.map(renderNewsSitemapUrl).filter(Boolean).join("\n");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="${SITEMAP_NAMESPACE}"
  xmlns:news="${NEWS_NAMESPACE}">
${urls}
</urlset>`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8"
    }
  });
}
