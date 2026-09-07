import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.resolve(projectRoot, process.argv[2] || "out");
const destination = path.resolve(projectRoot, process.argv[3] || "../../migration");
const label = process.argv[4] || "baseline";
const files = [];
async function visit(directory) { for (const entry of await readdir(directory, { withFileTypes: true })) { const file = path.join(directory, entry.name); if (entry.isDirectory()) await visit(file); else files.push(file); } }
await visit(output);
function routeFor(file) { const relative = path.relative(output, file).split(path.sep).join("/"); if (relative === "index.html") return "/"; if (relative === "404.html") return "/404.html"; if (relative.endsWith("/index.html")) return `/${relative.slice(0, -10)}`; return `/${relative}`; }
const routes = files
  .filter((file) => file.endsWith(".html") || (["robots.txt", "sitemap.xml", "news-sitemap.xml"].includes(path.basename(file)) && path.dirname(file) === output))
  .map(routeFor)
  .filter((route) => route !== "/_not-found/" && !route.includes("/__byline-empty__/"))
  .sort();
const seo = [];
for (const file of files.filter((file) => file.endsWith(".html"))) {
  const source = await readFile(file, "utf8");
  const find = (pattern) => source.match(pattern)?.[1] ?? "";
  const attribute = (tag, name) => tag.match(new RegExp(`${name}=(["'])(.*?)\\1`, "i"))?.[2] ?? "";
  const meta = (name) => {
    const tag = [...source.matchAll(/<meta\b[^>]*>/gi)].map((match) => match[0]).find((candidate) => attribute(candidate, "(?:name|property)") === name);
    return tag ? attribute(tag, "content") : "";
  };
  const canonicalTag = [...source.matchAll(/<link\b[^>]*>/gi)].map((match) => match[0]).find((candidate) => attribute(candidate, "rel") === "canonical");
  seo.push({ route: routeFor(file), title: find(/<title>([\s\S]*?)<\/title>/i), canonical: canonicalTag ? attribute(canonicalTag, "href") : "", description: meta("description"), openGraphUrl: meta("og:url") });
}
const sizes = { total: 0, html: 0, js: 0, css: 0, media: 0 };
for (const file of files) {
  const bytes = (await stat(file)).size;
  sizes.total += bytes;
  if (file.endsWith(".html")) sizes.html += bytes;
  else if (file.endsWith(".js")) sizes.js += bytes;
  else if (file.endsWith(".css")) sizes.css += bytes;
  if (file.includes(`${path.sep}_wordpress-media${path.sep}`)) sizes.media += bytes;
}
await mkdir(destination, { recursive: true });
await Promise.all([
  writeFile(path.join(destination, `${label}-routes.json`), `${JSON.stringify(routes, null, 2)}\n`),
  writeFile(path.join(destination, `${label}-seo.json`), `${JSON.stringify(seo, null, 2)}\n`),
  writeFile(path.join(destination, `${label}-metrics.json`), `${JSON.stringify({ routeCount: routes.length, htmlCount: seo.length, outputBytes: sizes }, null, 2)}\n`)
]);
console.log(`Captured ${routes.length} routes and ${seo.length} SEO records for ${label}.`);
