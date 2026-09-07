import { access, copyFile, mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";

const projectRoot = process.cwd();
const sourceDir = path.join(projectRoot, "public", "_wordpress-media");
const outputDir = path.join(projectRoot, "out", "_wordpress-media");
const manifestFile = path.join(projectRoot, ".byline-build", "media-manifest.ndjson");

async function exists(target) {
  try { await access(target); return true; } catch { return false; }
}

// Astro copies public/ wholesale. Replace that copy with the current build's
// closed media set so a persistent download cache cannot leak stale files into
// the deploy artifact.
await rm(outputDir, { recursive: true, force: true });
if (!(await exists(manifestFile))) {
  console.log("No WordPress media is required by this build.");
  process.exit(0);
}

const items = new Map();
for (const line of (await readFile(manifestFile, "utf8")).split("\n").filter(Boolean)) {
  const item = JSON.parse(line);
  if (!items.has(item.sourceUrl) || item.status === "materialized") items.set(item.sourceUrl, item);
}
const materialized = [...items.values()].filter((item) => item.status === "materialized");
await mkdir(outputDir, { recursive: true });
for (const item of materialized) {
  const filename = path.basename(item.localPath);
  const source = path.join(sourceDir, filename);
  if (!(await exists(source))) throw new Error(`Media manifest source is missing from the download cache: ${source}`);
  await copyFile(source, path.join(outputDir, filename));
}
console.log(`Copied ${materialized.length} required WordPress media files into out/_wordpress-media.`);
