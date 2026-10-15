import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(await readFile(path.join(projectRoot, "package.json"), "utf8"));
let builtPublication = {};
try {
  builtPublication = JSON.parse(await readFile(path.join(projectRoot, "out", "_byline", "publication.json"), "utf8"));
} catch {
  // Older/local build paths may not have resolved a publication yet.
}

function positiveInteger(value, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

const manifest = {
  protocolVersion: 1,
  frontendVersion: String(packageJson.version || "0.0.0"),
  publicationSchemaVersion: 1,
  generatedAt: new Date().toISOString(),
  publicationRevision: positiveInteger(process.env.BYLINE_PUBLICATION_REVISION ?? builtPublication.revision),
  theme: "weekly-wildcat"
};
const outputDirectory = path.join(projectRoot, "out", "_byline");

await mkdir(outputDirectory, { recursive: true });
await writeFile(path.join(outputDirectory, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

console.log("Generated out/_byline/manifest.json");
