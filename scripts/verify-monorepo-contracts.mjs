import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";

async function textFiles(root) {
  const files = [];
  for (const name of await readdir(root)) {
    const path = join(root, name);
    const metadata = await stat(path);
    if (metadata.isDirectory()) files.push(...await textFiles(path));
    else if (/\.(?:html|json|js|xml|txt)$/i.test(name)) files.push(path);
  }
  return files;
}

const nextConfig = await readFile("apps/web/next.config.ts", "utf8");
if (!/output:\s*["']export["']/.test(nextConfig)) {
  throw new Error('The public app must retain output: "export".');
}

const wranglerConfig = await readFile("apps/web/wrangler.jsonc", "utf8");
if (/"(?:main|run_worker_first|d1_databases)"\s*:/.test(wranglerConfig)) {
  throw new Error("The public site must deploy as static assets.");
}

const outputRoot = "apps/web/out";
const forbiddenPublicValues = [
  "BYLINE_TEST_SECRET_DO_NOT_EXPORT",
  "BYLINE_BUILD_TOKEN",
  "BYLINE_DEPLOY_HOOK_URL",
  "PAYLOAD_SECRET",
  "DATABASE_URL"
];
for (const file of await textFiles(outputRoot)) {
  const contents = await readFile(file, "utf8");
  for (const forbidden of forbiddenPublicValues) {
    if (contents.includes(forbidden)) throw new Error(`Protected admin value ${forbidden} leaked into ${file}`);
  }
}

console.log("Static export and public secret contracts verified.");
