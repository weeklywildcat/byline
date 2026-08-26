import { cp, mkdir, stat } from "node:fs/promises";
import path from "node:path";

const projectRoot = process.cwd();
const sourceDir = path.join(projectRoot, "public", "_wordpress-media");
const outputDir = path.join(projectRoot, "out", "_wordpress-media");

async function exists(directory) {
  const result = await stat(directory).catch(() => null);

  return Boolean(result?.isDirectory());
}

if (await exists(sourceDir)) {
  await mkdir(path.dirname(outputDir), { recursive: true });
  await cp(sourceDir, outputDir, { recursive: true, force: true });
  console.log("Copied mirrored WordPress media into out/_wordpress-media.");
} else {
  console.log("No mirrored WordPress media found to copy.");
}
