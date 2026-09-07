import sitemap from "@/views/sitemap";

export const prerender = true;

function escapeXml(value: unknown) {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export async function GET() {
  const entries = await sitemap();
  const urls = entries.map((entry) => `  <url>\n    <loc>${escapeXml(entry.url)}</loc>${entry.lastModified ? `\n    <lastmod>${new Date(entry.lastModified).toISOString()}</lastmod>` : ""}${entry.changeFrequency ? `\n    <changefreq>${entry.changeFrequency}</changefreq>` : ""}${entry.priority !== undefined ? `\n    <priority>${entry.priority}</priority>` : ""}\n  </url>`).join("\n");
  return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>`, { headers: { "Content-Type": "application/xml; charset=utf-8" } });
}
