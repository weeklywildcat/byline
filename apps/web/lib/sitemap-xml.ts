import type { SitemapEntry } from "@/lib/metadata";

export const SITEMAP_NAMESPACE = "http://www.sitemaps.org/schemas/sitemap/0.9";
/** Google's image extension for regular sitemaps. */
export const SITEMAP_IMAGE_NAMESPACE = "http://www.google.com/schemas/sitemap-image/1.1";

export function escapeXml(value: unknown) {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function renderEntry(entry: SitemapEntry) {
  const images = (entry.images ?? []).map((image) => `\n    <image:image>\n      <image:loc>${escapeXml(image)}</image:loc>\n    </image:image>`).join("");

  return `  <url>\n    <loc>${escapeXml(entry.url)}</loc>${entry.lastModified ? `\n    <lastmod>${new Date(entry.lastModified).toISOString()}</lastmod>` : ""}${entry.changeFrequency ? `\n    <changefreq>${entry.changeFrequency}</changefreq>` : ""}${entry.priority !== undefined ? `\n    <priority>${entry.priority}</priority>` : ""}${images}\n  </url>`;
}

/** The regular sitemap, with article entries carrying their editorial photographs. */
export function buildSitemapXml(entries: SitemapEntry[]) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="${SITEMAP_NAMESPACE}" xmlns:image="${SITEMAP_IMAGE_NAMESPACE}">\n${entries.map(renderEntry).join("\n")}\n</urlset>`;
}
