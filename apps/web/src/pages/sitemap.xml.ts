import { buildSitemapXml } from "@/lib/sitemap-xml";
import sitemap from "@/views/sitemap";

export const prerender = true;

export async function GET() {
  return new Response(buildSitemapXml(await sitemap()), { headers: { "Content-Type": "application/xml; charset=utf-8" } });
}
