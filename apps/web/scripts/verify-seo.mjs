import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { auditFeed, auditNewsSitemap, auditPage, auditSitemap, auditSitemapImages, decodeEntities, parsePage, sitemapImageLocations } from "./seo-audit.mts";

// Fails the build when generated pages drift from the search/social contract:
// absolute canonical and social URLs, timezone-aware dates, a sitemap that lists
// only canonical indexable pages, valid feeds, and well-formed structured data.
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputRoot = path.join(projectRoot, "out");

async function filesBelow(root) {
  const result = [];
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(absolute);
      else result.push(absolute);
    }
  }
  await visit(root);
  return result;
}

function publicPath(file) {
  const relative = path.relative(outputRoot, file).split(path.sep).join("/");
  if (relative === "index.html") return "/";
  if (relative.endsWith("/index.html")) return `/${relative.slice(0, -"index.html".length)}`;
  return `/${relative}`;
}

async function exists(target) {
  try { await access(target); return true; } catch { return false; }
}

const publication = JSON.parse(await readFile(path.join(outputRoot, "_byline", "publication.json"), "utf8"));
const expectedEntries = JSON.parse(await readFile(path.join(projectRoot, ".byline-build", "expected-routes.json"), "utf8"));
const kindByRoute = new Map(expectedEntries.map((entry) => [entry.path, entry.kind]));
const origin = String(process.env.NEXT_PUBLIC_SITE_URL || publication.urls?.publicSite || "https://weeklywildcat.com").replace(/\/$/, "");
const siteName = publication.identity?.name ?? "Weekly Wildcat";

const issues = [];
const pages = new Map();
const htmlFiles = (await filesBelow(outputRoot)).filter((file) => file.endsWith(".html") && !file.includes(`${path.sep}_astro${path.sep}`));

for (const file of htmlFiles) {
  const route = publicPath(file);
  const kind = kindByRoute.get(route);
  const html = await readFile(file, "utf8");
  const parsed = parsePage(html, route);
  pages.set(route, { canonical: parsed.canonicals[0] ?? "", robots: parsed.robots, kind });
  // Redirects and 404s are verified by verify-build.mjs; they must only stay out of the sitemap.
  if (kind === "redirect" || kind === "not-found" || route === "/404.html") continue;
  issues.push(...auditPage(html, route, { origin, siteName, kind }));
}

for (const [name, audit] of [
  ["sitemap.xml", (xml) => [...auditSitemap(xml, pages, origin), ...auditSitemapImages(xml, origin)]],
  ["news-sitemap.xml", (xml) => auditNewsSitemap(xml, pages, origin, Date.now())],
  ["feed.xml", (xml) => auditFeed(xml, pages, origin)]
]) {
  const file = path.join(outputRoot, name);
  if (!(await exists(file))) {
    issues.push({ route: `/${name}`, message: "was not generated" });
    continue;
  }
  issues.push(...audit(await readFile(file, "utf8")));
}

// Media contract: every photograph the sitemap advertises and every full-size
// source the lightbox or a media link can open must be a file in this export.
// Markup that names a mirrored file the build did not copy is a broken deploy.
async function publishedFileExists(url) {
  let pathname;
  try { pathname = decodeURIComponent(new URL(url, `${origin}/`).pathname); } catch { return false; }
  return pathname.startsWith("/") && exists(path.join(outputRoot, pathname));
}
const sitemapFile = path.join(outputRoot, "sitemap.xml");
if (await exists(sitemapFile)) {
  for (const [page, images] of sitemapImageLocations(await readFile(sitemapFile, "utf8"))) {
    for (const image of images) {
      if (!(await publishedFileExists(image))) issues.push({ route: page, message: `sitemap image is not in the export: ${image}` });
    }
  }
}
for (const file of htmlFiles) {
  const html = await readFile(file, "utf8");
  const route = publicPath(file);
  for (const tag of html.match(/<img\b[^>]*\bdata-byline-full-url=[^>]*>/gi) ?? []) {
    const full = tag.match(/data-byline-full-url="([^"]*)"/i)?.[1];
    if (full && full.includes("/_wordpress-media/") && !(await publishedFileExists(decodeEntities(full)))) {
      issues.push({ route, message: `full-size photograph is not in the export: ${full}` });
    }
  }
  for (const link of html.match(/<a\b[^>]*\bhref="[^"]*\/_wordpress-media\/[^"]*"[^>]*><img\b/gi) ?? []) {
    const href = link.match(/href="([^"]*)"/i)?.[1];
    if (href && !(await publishedFileExists(decodeEntities(href)))) issues.push({ route, message: `media link target is not in the export: ${href}` });
  }
}

const robots = await readFile(path.join(outputRoot, "robots.txt"), "utf8");
for (const sitemap of ["sitemap.xml", "news-sitemap.xml"]) {
  if (!robots.includes(`Sitemap: ${origin}/${sitemap}`)) issues.push({ route: "/robots.txt", message: `does not advertise ${origin}/${sitemap}` });
}

if (issues.length) {
  throw new Error(`SEO verification failed (${issues.length}):\n${issues.map((issue) => `  ${issue.route}: ${issue.message}`).join("\n")}`);
}
console.log(`SEO verification passed for ${pages.size} HTML documents, the sitemap, news sitemap and feed.`);
