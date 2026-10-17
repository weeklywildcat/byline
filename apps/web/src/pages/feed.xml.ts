import { filterVisibleContentPosts } from "@/lib/content";
import { buildRssFeed } from "@/lib/feed";
import { getPublicationConfig } from "@/lib/publication";
import { SITE_DESCRIPTION, SITE_NAME } from "@/lib/seo";
import { getAllPosts, getSiteUrl } from "@/lib/wordpress";

export const prerender = true;

export async function GET() {
  const publication = getPublicationConfig();
  const xml = buildRssFeed(filterVisibleContentPosts(await getAllPosts()), {
    siteUrl: getSiteUrl(),
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    language: publication.locale,
    timeZone: publication.timezone
  });

  return new Response(xml, { headers: { "Content-Type": "application/rss+xml; charset=utf-8" } });
}
