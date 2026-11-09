import { filterVisibleContentPosts } from "@/lib/content";
import { buildVideoSitemapXml } from "@/lib/video-sitemap";
import { getAllPosts, getSiteUrl } from "@/lib/public-content";

export async function GET() {
  const xml = buildVideoSitemapXml(filterVisibleContentPosts(await getAllPosts()), { siteUrl: getSiteUrl() });

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8"
    }
  });
}
