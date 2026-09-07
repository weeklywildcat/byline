import { access, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputRoot = path.join(projectRoot, "out");
const buildRoot = path.join(projectRoot, ".byline-build");
const reportRoot = path.join(outputRoot, "_byline");

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
  if (relative === "404.html") return "/404.html";
  if (relative.endsWith("/index.html")) return `/${relative.slice(0, -"index.html".length)}`;
  return `/${relative}`;
}

function attr(source, name) {
  const tag = [...source.matchAll(/<meta\b[^>]*>/gi)].map((match) => match[0]).find((candidate) => {
    const identity = candidate.match(/(?:name|property)=(["'])(.*?)\1/i)?.[2];
    return identity === name;
  });
  return tag?.match(/content=(["'])(.*?)\1/i)?.[2] ?? "";
}

function attrs(source, name) {
  return [...source.matchAll(/<meta\b[^>]*>/gi)]
    .map((match) => match[0])
    .filter((candidate) => candidate.match(/(?:name|property)=(["'])(.*?)\1/i)?.[2] === name)
    .map((candidate) => candidate.match(/content=(["'])(.*?)\1/i)?.[2] ?? "")
    .filter(Boolean);
}

function link(source, rel) {
  const tag = [...source.matchAll(/<link\b[^>]*>/gi)].map((match) => match[0]).find((candidate) => candidate.match(/rel=(["'])(.*?)\1/i)?.[2] === rel);
  return tag?.match(/href=(["'])(.*?)\1/i)?.[2] ?? "";
}

async function exists(target) {
  try { await access(target); return true; } catch { return false; }
}

const files = await filesBelow(outputRoot);
const routeFiles = files.filter((file) => /\.(?:html|xml|txt)$/.test(file) && !file.includes(`${path.sep}_astro${path.sep}`));
const actualRoutes = routeFiles.map(publicPath).sort();
const expectedEntries = JSON.parse(await readFile(path.join(buildRoot, "expected-routes.json"), "utf8"));
const expectedRoutes = expectedEntries.map((entry) => entry.path).sort();
const expectedByPath = new Map(expectedEntries.map((entry) => [entry.path, entry]));
const searchIndexFile = path.join(outputRoot, "_byline", "search-index.json");
let searchIndex;
try {
  searchIndex = JSON.parse(await readFile(searchIndexFile, "utf8"));
} catch (error) {
  throw new Error(`Search index verification failed: ${error instanceof Error ? error.message : String(error)}`);
}

if (searchIndex?.schemaVersion !== 1 || !Array.isArray(searchIndex.items)) {
  throw new Error("Search index verification failed: expected schemaVersion 1 and an items array.");
}

const searchItemKinds = new Set(["story", "team", "season", "game"]);
for (const [index, item] of searchIndex.items.entries()) {
  if (!item || typeof item !== "object" || Array.isArray(item)) {
    throw new Error(`Search index verification failed: item ${index} is not an object.`);
  }

  if ("searchText" in item) {
    throw new Error(`Search index verification failed: item ${index} still contains the removed searchText field.`);
  }

  for (const field of ["id", "title", "excerpt", "href", "category", "author", "date"]) {
    const valid = field === "id"
      ? typeof item[field] === "string" || typeof item[field] === "number"
      : typeof item[field] === "string";
    if (!valid) {
      throw new Error(`Search index verification failed: item ${index} is missing required field ${field}.`);
    }
  }

  if (item.kind !== undefined && !searchItemKinds.has(item.kind)) {
    throw new Error(`Search index verification failed: item ${index} has unsupported kind ${String(item.kind)}.`);
  }

  if (item.searchTokens !== undefined && (!Array.isArray(item.searchTokens) || item.searchTokens.some((token) => typeof token !== "string"))) {
    throw new Error(`Search index verification failed: item ${index} has invalid searchTokens.`);
  }

  try {
    const href = new URL(item.href, "https://byline.invalid");
    if (href.origin === "https://byline.invalid" && !expectedRoutes.includes(href.pathname)) {
      throw new Error(`local route ${href.pathname} is not in the route manifest`);
    }
  } catch (error) {
    throw new Error(`Search index verification failed: item ${index} has an invalid href (${String(error)}).`);
  }
}

const removed = expectedRoutes.filter((route) => !actualRoutes.includes(route));
const unexpected = actualRoutes.filter((route) => !expectedRoutes.includes(route));
if (removed.length || unexpected.length) {
  throw new Error(`Route closure failed.\nMissing (${removed.length}): ${removed.join(", ") || "none"}\nUnexpected (${unexpected.length}): ${unexpected.join(", ") || "none"}`);
}

const missingAssets = [];
for (const file of files.filter((candidate) => /\.(?:html|css)$/.test(candidate))) {
  const source = await readFile(file, "utf8");
  const references = [
    ...source.matchAll(/(?:src|href)=["'](\/[^"'#?]+)(?:[?#][^"']*)?["']/gi),
    ...source.matchAll(/url\(["']?(\/[^)'"?#]+)(?:[?#][^)'" ]*)?["']?\)/gi)
  ].map((match) => match[1]);
  for (const reference of new Set(references)) {
    if (!reference.startsWith("/_astro/") && !reference.startsWith("/_wordpress-media/") && !/\.[a-z0-9]{2,5}$/i.test(reference)) continue;
    const target = path.join(outputRoot, decodeURIComponent(reference).replace(/^\//, ""));
    if (!(await exists(target))) missingAssets.push({ page: publicPath(file), asset: reference });
  }
}
if (missingAssets.length) throw new Error(`Asset closure failed:\n${missingAssets.map((item) => `${item.page} -> ${item.asset}`).join("\n")}`);

const seo = [];
for (const file of files.filter((candidate) => candidate.endsWith(".html"))) {
  const route = publicPath(file);
  const source = await readFile(file, "utf8");
  const title = source.match(/<title>([\s\S]*?)<\/title>/i)?.[1] ?? "";
  const canonical = link(source, "canonical");
  const description = attr(source, "description");
  if (expectedByPath.get(route)?.kind !== "not-found" && (!title || !canonical || !description)) {
    throw new Error(`SEO verification failed for ${route}: title=${Boolean(title)} canonical=${Boolean(canonical)} description=${Boolean(description)}`);
  }
  seo.push({
    route, title, canonical, description,
    openGraphTitle: attr(source, "og:title"), openGraphDescription: attr(source, "og:description"),
    openGraphImage: attr(source, "og:image"), openGraphImageWidths: attrs(source, "og:image:width"),
    openGraphImageHeights: attrs(source, "og:image:height"), openGraphImageAlts: attrs(source, "og:image:alt"),
    openGraphUrl: attr(source, "og:url"), articleSection: attr(source, "article:section"),
    articlePublishedTime: attr(source, "article:published_time"), articleModifiedTime: attr(source, "article:modified_time"),
    articleAuthors: attrs(source, "article:author"), articleTags: attrs(source, "article:tag"),
    twitterCard: attr(source, "twitter:card"), twitterImageAlts: attrs(source, "twitter:image:alt"), robots: attr(source, "robots"),
    structuredDataCount: [...source.matchAll(/type=["']application\/ld\+json["']/gi)].length
  });
}

const mediaItems = new Map();
const mediaDurations = new Map();
if (await exists(path.join(buildRoot, "media-manifest.ndjson"))) {
  const lines = (await readFile(path.join(buildRoot, "media-manifest.ndjson"), "utf8")).split("\n").filter(Boolean);
  for (const line of lines) {
    const item = JSON.parse(line);
    mediaDurations.set(item.sourceUrl, Math.max(mediaDurations.get(item.sourceUrl) ?? 0, Number(item.durationMs) || 0));
    const current = mediaItems.get(item.sourceUrl);
    if (!current || item.status === "materialized") mediaItems.set(item.sourceUrl, item);
  }
}
for (const item of mediaItems.values()) {
  if (item.status === "materialized" && !(await exists(path.join(outputRoot, item.localPath.replace(/^\//, ""))))) {
    throw new Error(`Media manifest references a missing file: ${item.localPath} (${item.sourceUrl})`);
  }
}

const snapshotMetrics = JSON.parse(await readFile(path.join(buildRoot, "snapshot-metrics.json"), "utf8"));
const sizes = { total: 0, html: 0, js: 0, css: 0, media: 0 };
for (const file of files) {
  const size = (await stat(file)).size;
  sizes.total += size;
  if (file.endsWith(".html")) sizes.html += size;
  else if (file.endsWith(".js")) sizes.js += size;
  else if (file.endsWith(".css")) sizes.css += size;
  if (file.includes(`${path.sep}_wordpress-media${path.sep}`)) sizes.media += size;
}
let totalBuild = {};
if (await exists(path.join(buildRoot, "build-duration.json"))) totalBuild = JSON.parse(await readFile(path.join(buildRoot, "build-duration.json"), "utf8"));
const metrics = {
  version: 1,
  framework: "astro",
  ...totalBuild,
  snapshot: snapshotMetrics,
  media: {
    required: mediaItems.size,
    materialized: [...mediaItems.values()].filter((item) => item.status === "materialized").length,
    externalFallbacks: [...mediaItems.values()].filter((item) => item.status === "external-fallback").length,
    materializationMs: Math.round([...mediaDurations.values()].reduce((sum, duration) => sum + duration, 0) * 100) / 100
  },
  routes: { expected: expectedRoutes.length, generated: actualRoutes.length },
  searchIndex: {
    schemaVersion: searchIndex.schemaVersion,
    items: searchIndex.items.length,
    bytes: (await stat(searchIndexFile)).size
  },
  outputBytes: sizes
};

await mkdir(reportRoot, { recursive: true });
await Promise.all([
  writeFile(path.join(reportRoot, "routes.json"), `${JSON.stringify(expectedEntries, null, 2)}\n`),
  writeFile(path.join(reportRoot, "seo.json"), `${JSON.stringify(seo, null, 2)}\n`),
  writeFile(path.join(reportRoot, "media-manifest.json"), `${JSON.stringify({ version: 1, items: Object.fromEntries(mediaItems) }, null, 2)}\n`),
  writeFile(path.join(reportRoot, "build-metrics.json"), `${JSON.stringify(metrics, null, 2)}\n`)
]);
console.log(`Verified ${actualRoutes.length} routes, ${seo.length} HTML documents, and ${mediaItems.size} media records.`);
