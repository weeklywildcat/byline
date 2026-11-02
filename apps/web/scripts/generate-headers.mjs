import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { STATIC_HEADER_RULES, buildHeadersFile } from "./headers.mts";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

await mkdir(path.join(projectRoot, "out"), { recursive: true });
await writeFile(path.join(projectRoot, "out", "_headers"), buildHeadersFile(), "utf8");
console.log(`Generated out/_headers with ${STATIC_HEADER_RULES.length} rule(s).`);
