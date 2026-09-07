import { spawnSync } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const astroCommand = path.join(path.dirname(require.resolve("astro/package.json")), "bin", "astro.mjs");
const astroArguments = process.argv.slice(2);
const defaultWordPressApi = "https://cms.weeklywildcat.com/wp-json/wp/v2";

if (astroArguments.length === 0) throw new Error("An Astro command is required.");

function publicationEndpoint() {
  if (process.env.BYLINE_PUBLICATION_URL) return process.env.BYLINE_PUBLICATION_URL;
  return (process.env.NEXT_PUBLIC_WP_API_URL || defaultWordPressApi).replace(/\/wp\/v2\/?$/, "/byline/v1/publication");
}

async function loadPublication() {
  if (process.env.BYLINE_PUBLICATION_FILE) {
    const value = JSON.parse(await readFile(path.resolve(projectRoot, process.env.BYLINE_PUBLICATION_FILE), "utf8"));
    if (value?.schemaVersion !== 1) throw new Error("BYLINE_PUBLICATION_FILE uses an unsupported schema version.");
    return value;
  }
  if (process.env.BYLINE_PUBLICATION_JSON) return JSON.parse(process.env.BYLINE_PUBLICATION_JSON);
  const endpoint = publicationEndpoint();
  try {
    const response = await fetch(endpoint, { headers: { "User-Agent": "Byline static publication builder" }, signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    const value = await response.json();
    if (value?.schemaVersion !== 1) throw new Error("unsupported or missing schemaVersion");
    console.log(`Loaded Byline publication configuration from ${endpoint}`);
    return value;
  } catch (error) {
    console.warn(`Byline publication endpoint unavailable (${error instanceof Error ? error.message : error}); using compatibility defaults.`);
    return null;
  }
}

async function loadDesigns(publication) {
  if (process.env.BYLINE_DESIGNS_FILE) return JSON.parse(await readFile(path.resolve(projectRoot, process.env.BYLINE_DESIGNS_FILE), "utf8"));
  if (process.env.BYLINE_DESIGNS_JSON) return JSON.parse(process.env.BYLINE_DESIGNS_JSON);
  if (!publication || process.env.BYLINE_PUBLICATION_FILE) return {};
  const endpoint = publicationEndpoint().replace(/\/publication\/?$/, "/designs");
  const response = await fetch(endpoint, { signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error(`Byline could not load published designs: ${response.status} ${response.statusText}`);
  const summaries = await response.json();
  if (!Array.isArray(summaries)) throw new Error("Byline design index was malformed.");
  const designs = await Promise.all(summaries.map(async ({ template }) => {
    const designResponse = await fetch(`${endpoint.replace(/\/designs\/?$/, "/design")}/${encodeURIComponent(template)}`, { signal: AbortSignal.timeout(10000) });
    if (!designResponse.ok) throw new Error(`Byline could not load design ${template}: ${designResponse.status}`);
    return [template, await designResponse.json()];
  }));
  return Object.fromEntries(designs);
}

const publication = await loadPublication();
const designs = await loadDesigns(publication);
if (astroArguments[0] === "build") {
  const buildDirectory = path.join(projectRoot, ".byline-build");
  await rm(buildDirectory, { recursive: true, force: true });
  await mkdir(buildDirectory, { recursive: true });
}
const buildStarted = performance.now();
const child = spawnSync(process.execPath, [astroCommand, ...astroArguments], {
  cwd: projectRoot,
  env: {
    ...process.env,
    WORDPRESS_FETCH_CACHE_KEY: process.env.WORDPRESS_FETCH_CACHE_KEY || process.env.CF_PAGES_COMMIT_SHA || `local-build-${Date.now()}`,
    ...(publication ? { BYLINE_PUBLICATION_JSON: JSON.stringify(publication) } : {}),
    ...(publication?.urls?.publicSite && !process.env.NEXT_PUBLIC_SITE_URL ? { NEXT_PUBLIC_SITE_URL: publication.urls.publicSite } : {}),
    ...(publication?.urls?.cms && !process.env.NEXT_PUBLIC_WP_API_URL ? { NEXT_PUBLIC_WP_API_URL: `${String(publication.urls.cms).replace(/\/$/, "")}/wp-json/wp/v2` } : {}),
    ...(Object.keys(designs).length ? { BYLINE_DESIGNS_JSON: JSON.stringify(designs) } : {})
  },
  stdio: "inherit"
});
if (child.error) throw child.error;
if (child.status !== 0) process.exit(child.status ?? 1);

if (astroArguments[0] === "build") {
  await writeFile(path.join(projectRoot, ".byline-build", "build-duration.json"), `${JSON.stringify({ durationMs: Math.round((performance.now() - buildStarted) * 100) / 100 }, null, 2)}\n`);
  const activePublication = publication ?? JSON.parse(await readFile(path.join(projectRoot, "tests", "fixtures", "weekly-wildcat-publication.json"), "utf8"));
  const outputDirectory = path.join(projectRoot, "out", "_byline");
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(path.join(outputDirectory, "publication.json"), `${JSON.stringify(activePublication, null, 2)}\n`);
  await writeFile(path.join(outputDirectory, "designs.json"), `${JSON.stringify(designs, null, 2)}\n`);
}
