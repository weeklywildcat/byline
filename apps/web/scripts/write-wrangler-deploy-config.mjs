import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// The monorepo is built from its root (`npm run build:frontend`), but the only
// Wrangler configuration is apps/web/wrangler.jsonc. Workers Builds runs its
// deploy command (`wrangler deploy` / `wrangler preview`) from the same root, where
// Wrangler finds no configuration at all. Wrangler's redirected-configuration file
// points it at the real one, so no deploy command needs a --config flag.
// https://developers.cloudflare.com/workers/wrangler/configuration/#generated-wrangler-configuration
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = path.resolve(projectRoot, "..", "..");
const deployDirectory = path.join(repositoryRoot, ".wrangler", "deploy");
const configPath = path.relative(deployDirectory, path.join(projectRoot, "wrangler.jsonc")).split(path.sep).join("/");

await mkdir(deployDirectory, { recursive: true });
await writeFile(path.join(deployDirectory, "config.json"), `${JSON.stringify({ configPath }, null, 2)}\n`, "utf8");
console.log(`Generated .wrangler/deploy/config.json pointing at ${configPath}.`);
