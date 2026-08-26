import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const nextCommand = path.join(path.dirname(require.resolve("next/package.json")), "dist", "bin", "next");
const nextArguments = process.argv.slice(2);
const defaultWordPressApi = "https://cms.weeklywildcat.com/wp-json/wp/v2";

if (nextArguments.length === 0) {
  throw new Error("A Next.js command is required.");
}

function publicationEndpoint() {
  if (process.env.BYLINE_PUBLICATION_URL) return process.env.BYLINE_PUBLICATION_URL;
  const wordpressApi = process.env.NEXT_PUBLIC_WP_API_URL || defaultWordPressApi;
  return wordpressApi.replace(/\/wp\/v2\/?$/, "/byline/v1/publication");
}

async function loadPublication() {
  if (process.env.BYLINE_PUBLICATION_FILE) {
    const configured = JSON.parse(
      await readFile(path.resolve(projectRoot, process.env.BYLINE_PUBLICATION_FILE), "utf8")
    );
    if (configured?.schemaVersion !== 1) throw new Error("BYLINE_PUBLICATION_FILE uses an unsupported schema version.");
    return configured;
  }

  if (process.env.BYLINE_PUBLICATION_JSON) {
    const configured = JSON.parse(process.env.BYLINE_PUBLICATION_JSON);
    if (configured?.schemaVersion !== 1) throw new Error("BYLINE_PUBLICATION_JSON uses an unsupported schema version.");
    return configured;
  }

  const endpoint = publicationEndpoint();
  try {
    const response = await fetch(endpoint, {
      headers: { "User-Agent": "Byline static publication builder" },
      signal: AbortSignal.timeout(10000)
    });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    const publication = await response.json();
    if (publication?.schemaVersion !== 1) throw new Error("unsupported or missing schemaVersion");
    console.log(`Loaded Byline publication configuration from ${endpoint}`);
    return publication;
  } catch (error) {
    console.warn(`Byline publication endpoint unavailable (${error instanceof Error ? error.message : error}); using the Weekly Wildcat compatibility defaults.`);
    return null;
  }
}

async function loadDesigns(publication) {
  if (process.env.BYLINE_DESIGNS_FILE) {
    return JSON.parse(await readFile(path.resolve(projectRoot, process.env.BYLINE_DESIGNS_FILE), "utf8"));
  }
  if (process.env.BYLINE_DESIGNS_JSON) {
    return JSON.parse(process.env.BYLINE_DESIGNS_JSON);
  }
  if (!publication || process.env.BYLINE_PUBLICATION_FILE) return {};

  const endpoint = publicationEndpoint().replace(/\/publication\/?$/, "/designs");
  try {
    const response = await fetch(endpoint, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    const summaries = await response.json();
    if (!Array.isArray(summaries)) throw new Error("invalid design index");
    const designs = await Promise.all(summaries.map(async ({ template }) => {
      const designResponse = await fetch(`${endpoint.replace(/\/designs\/?$/, "/design")}/${encodeURIComponent(template)}`, {
        signal: AbortSignal.timeout(10000)
      });
      if (!designResponse.ok) throw new Error(`${template}: ${designResponse.status}`);
      return [template, await designResponse.json()];
    }));
    return Object.fromEntries(designs);
  } catch (error) {
    throw new Error(`Byline could not load published designs: ${error instanceof Error ? error.message : error}`);
  }
}

const publication = await loadPublication();
const designs = await loadDesigns(publication);
const publicationWordPressApi = publication?.urls?.cms
  ? `${String(publication.urls.cms).replace(/\/$/, "")}/wp-json/wp/v2`
  : undefined;
const child = spawnSync(process.execPath, [nextCommand, ...nextArguments], {
  cwd: projectRoot,
  env: {
    ...process.env,
    ...(publication ? { BYLINE_PUBLICATION_JSON: JSON.stringify(publication) } : {}),
    ...(publication?.urls?.publicSite && !process.env.NEXT_PUBLIC_SITE_URL ? { NEXT_PUBLIC_SITE_URL: publication.urls.publicSite } : {}),
    ...(publicationWordPressApi && !process.env.NEXT_PUBLIC_WP_API_URL ? { NEXT_PUBLIC_WP_API_URL: publicationWordPressApi } : {}),
    ...(Object.keys(designs).length ? { BYLINE_DESIGNS_JSON: JSON.stringify(designs) } : {})
  },
  stdio: "inherit"
});

if (child.error) throw child.error;
if (child.status !== 0) process.exit(child.status ?? 1);

if (nextArguments[0] === "build") {
  const activePublication = publication ?? JSON.parse(
    await readFile(path.join(projectRoot, "tests", "fixtures", "weekly-wildcat-publication.json"), "utf8")
  );
  const outputDirectory = path.join(projectRoot, "out", "_byline");
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(path.join(outputDirectory, "publication.json"), `${JSON.stringify(activePublication, null, 2)}\n`, "utf8");
  await writeFile(path.join(outputDirectory, "designs.json"), `${JSON.stringify(designs, null, 2)}\n`, "utf8");
}
