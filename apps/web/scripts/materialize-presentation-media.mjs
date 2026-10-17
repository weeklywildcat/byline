import { access, copyFile, mkdir, readFile, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputRoot = path.resolve(process.env.BYLINE_STATIC_ROOT || path.join(projectRoot, "out"));
const canonicalDir = path.join(outputRoot, "_wordpress-media");
const presentationDir = path.join(outputRoot, "_byline", "presentation-media");

async function exists(target) {
  try { await access(target); return true; } catch { return false; }
}

async function htmlFilesBelow(root) {
  const result = [];
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(absolute);
      else if (entry.name.endsWith(".html")) result.push(absolute);
    }
  }
  await visit(root);
  return result;
}

// Derive the alias set from generated HTML so a deployment only contains
// presentation copies that the current build actually references.
await rm(presentationDir, { recursive: true, force: true });

const filenames = new Set();
for (const file of await htmlFilesBelow(outputRoot)) {
  const html = await readFile(file, "utf8");
  for (const match of html.matchAll(/\/_byline\/presentation-media\/([^"'\s<>)?#]+)/g)) {
    filenames.add(match[1]);
  }
}

if (filenames.size === 0) {
  console.log("No presentation-only media aliases are required by this build.");
  process.exit(0);
}

await mkdir(presentationDir, { recursive: true });

for (const filename of filenames) {
  const safe = path.basename(filename);
  if (safe !== filename) {
    throw new Error(`Unsafe presentation media filename: ${filename}`);
  }

  const source = path.join(canonicalDir, safe);
  if (!(await exists(source))) {
    throw new Error(`Presentation media source is missing from the static export: ${source}`);
  }

  await copyFile(source, path.join(presentationDir, safe));
}

console.log(`Materialized ${filenames.size} presentation-only media aliases.`);
