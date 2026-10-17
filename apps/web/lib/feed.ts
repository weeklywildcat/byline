import { getPrimaryVisibleCategory } from "@/lib/content";
import { getWordPressInstant } from "@/lib/dates";
import { stripHtml } from "@/lib/format";
import { escapeXml } from "@/lib/news-sitemap";
import { getContributorName, getPostContributors, getPostHref, getPostRouteParts, type WordPressPost } from "@/lib/wordpress";

export const FEED_ITEM_LIMIT = 30;
const FEED_SUMMARY_LENGTH = 320;

type FeedOptions = {
  siteUrl: string;
  title: string;
  description: string;
  /** BCP 47 tag, e.g. "en-US". */
  language: string;
  timeZone: string;
};

function summarize(post: WordPressPost) {
  const text = stripHtml(post.excerpt.rendered || post.content.rendered);

  if (text.length <= FEED_SUMMARY_LENGTH) return text;

  const cut = text.slice(0, FEED_SUMMARY_LENGTH);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), 0) || FEED_SUMMARY_LENGTH).trim()}...`;
}

/**
 * RSS 2.0 for the newest public stories. `posts` must already be limited to
 * publicly visible stories, newest first.
 */
export function buildRssFeed(posts: WordPressPost[], { siteUrl, title, description, language, timeZone }: FeedOptions) {
  const items = posts
    .flatMap((post) => {
      const published = getWordPressInstant({ gmt: post.date_gmt, local: post.date }, timeZone);
      if (!published || !getPostRouteParts(post)) return [];

      const link = `${siteUrl}${getPostHref(post)}`;
      const category = getPrimaryVisibleCategory(post);
      const authors = getPostContributors(post).map((contributor) => getContributorName(contributor));

      return [{
        published,
        xml: [
          "    <item>",
          `      <title>${escapeXml(stripHtml(post.title.rendered))}</title>`,
          `      <link>${escapeXml(link)}</link>`,
          `      <guid isPermaLink="true">${escapeXml(link)}</guid>`,
          `      <pubDate>${published.toUTCString()}</pubDate>`,
          ...authors.map((author) => `      <dc:creator>${escapeXml(stripHtml(author))}</dc:creator>`),
          ...(category ? [`      <category>${escapeXml(stripHtml(category.name))}</category>`] : []),
          `      <description>${escapeXml(summarize(post))}</description>`,
          "    </item>"
        ].join("\n")
      }];
    })
    .slice(0, FEED_ITEM_LIMIT);
  const newest = items.reduce<Date | undefined>((current, item) => (!current || item.published > current ? item.published : current), undefined);

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>${escapeXml(title)}</title>
    <link>${escapeXml(`${siteUrl}/`)}</link>
    <description>${escapeXml(description)}</description>
    <language>${escapeXml(language)}</language>
${newest ? `    <lastBuildDate>${newest.toUTCString()}</lastBuildDate>\n` : ""}    <atom:link href="${escapeXml(`${siteUrl}/feed.xml`)}" rel="self" type="application/rss+xml" />
${items.map((item) => item.xml).join("\n")}
  </channel>
</rss>
`;
}
