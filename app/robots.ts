import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/seo";
import { getSiteUrl } from "@/lib/wordpress";

export const dynamic = "force-static";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/"
    },
    host: getSiteUrl(),
    sitemap: [absoluteUrl("/sitemap.xml"), absoluteUrl("/news-sitemap.xml")]
  };
}
