import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputRoot = path.join(projectRoot, "out");

// Next's static exporter emitted both forms. Keep the directory form as a
// compatibility artifact so old links and the route inventory remain exact.
await mkdir(path.join(outputRoot, "404"), { recursive: true });
await copyFile(path.join(outputRoot, "404.html"), path.join(outputRoot, "404", "index.html"));
