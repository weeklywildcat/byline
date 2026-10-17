import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildRedirectsFile } from "./redirects.mts";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const entries = JSON.parse(await readFile(path.join(projectRoot, ".byline-build", "expected-routes.json"), "utf8"));
const redirects = entries
  .filter((entry) => entry.kind === "redirect" && entry.delivery === "edge")
  .map((entry) => ({ from: entry.path, to: entry.redirectTo }));

await mkdir(path.join(projectRoot, "out"), { recursive: true });
await writeFile(path.join(projectRoot, "out", "_redirects"), buildRedirectsFile(redirects), "utf8");
console.log(`Generated out/_redirects with ${redirects.length} edge redirects.`);
