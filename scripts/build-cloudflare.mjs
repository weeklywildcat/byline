#!/usr/bin/env node
// Cloudflare Workers Builds installs the whole monorepo by default. With
// SKIP_DEPENDENCY_INSTALL=1, install only the public site and its dependencies.
// Keep Astro's restored incremental cache outside node_modules while npm ci
// recreates the dependency tree.
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rename, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cache = path.join(root, "apps/web/node_modules/.astro");
const cacheStagingDirectory = await mkdtemp(path.join(root, ".byline-astro-cache-"));
const stagedCache = path.join(cacheStagingDirectory, "astro");
let cacheSaved = false;

function npm(args) {
  console.log(`[byline] npm ${args.join(" ")}`);
  const startedAt = performance.now();
  const result = spawnSync(process.platform === "win32" ? "npm.cmd" : "npm", args, {
    cwd: root,
    stdio: "inherit",
    env: process.env,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`npm ${args[0]} failed (${result.signal || result.status})`);
  console.log(`[byline] npm ${args[0]} finished in ${((performance.now() - startedAt) / 1000).toFixed(1)}s`);
}

try {
  try {
    await rename(cache, stagedCache);
    cacheSaved = true;
    console.log("[byline] Preserved the restored Astro incremental cache");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  try {
    npm([
      "ci",
      "--workspace=@byline/web",
      "--include-workspace-root=false",
      "--prefer-offline",
      "--no-audit",
      "--no-fund",
    ]);
  } finally {
    // Restoring in finally also protects the cache if npm fails.
    if (cacheSaved) {
      await mkdir(path.dirname(cache), { recursive: true });
      await rm(cache, { recursive: true, force: true });
      await rename(stagedCache, cache);
      console.log("[byline] Restored the Astro incremental cache");
    }
  }
} finally {
  await rm(cacheStagingDirectory, { recursive: true, force: true });
}

npm(["run", "build:frontend"]);
