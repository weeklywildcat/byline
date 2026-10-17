import { filterVisibleContentPosts } from "@/lib/content";
import { buildNewsSitemapXml } from "@/lib/news-sitemap";
import { getPublicationConfig } from "@/lib/publication";
import { SITE_NAME } from "@/lib/seo";
import { getAllPosts, getSiteUrl } from "@/lib/wordpress";

export async function GET() {
  const xml = buildNewsSitemapXml(filterVisibleContentPosts(await getAllPosts()), {
    siteUrl: getSiteUrl(),
    publicationName: SITE_NAME,
    timeZone: getPublicationConfig().timezone,
    now: Date.now()
  });

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8"
    }
  });
}
