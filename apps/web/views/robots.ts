import type { RobotsDocument } from "@/lib/metadata";
import { absoluteUrl } from "@/lib/seo";
import { getSiteUrl } from "@/lib/public-content";

export default function robots(): RobotsDocument {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: "/_byline/presentation-media/"
    },
    host: getSiteUrl(),
    sitemap: [absoluteUrl("/sitemap.xml"), absoluteUrl("/news-sitemap.xml"), absoluteUrl("/video-sitemap.xml")]
  };
}
