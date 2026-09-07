import type { RobotsDocument } from "@/lib/metadata";
import { absoluteUrl } from "@/lib/seo";
import { getSiteUrl } from "@/lib/wordpress";

export default function robots(): RobotsDocument {
  return {
    rules: {
      userAgent: "*",
      allow: "/"
    },
    host: getSiteUrl(),
    sitemap: [absoluteUrl("/sitemap.xml"), absoluteUrl("/news-sitemap.xml")]
  };
}
