#!/usr/bin/env node
// Cloudflare Workers Builds installs the whole monorepo by default. With
// SKIP_DEPENDENCY_INSTALL=1, install only the public site and its dependencies.
//
// Astro is configured to keep its incremental-build cache and Byline's
// content-addressed publication-media cache in the repository-root
// node_modules/.astro directory that Workers Builds persists natively. npm ci
// recreates node_modules, so preserve the restored cache briefly outside that
// tree during installation and put it straight back afterward.
import { spawnSync } from "node:child_process";
import { lstat, mkdir, mkdtemp, readdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cache = path.join(root, "node_modules/.astro");
// One-build compatibility with the old workspace-local cache layout.
const legacyCache = path.join(root, "apps/web/node_modules/.astro");

async function inventory(directory) {
  let files = 0;
  let bytes = 0;
  let entries;
  try { entries = await readdir(directory, { withFileTypes: true }); } catch { return { files, bytes }; }
  for (const entry of entries) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      const inner = await inventory(file);
      files += inner.files;
      bytes += inner.bytes;
    } else if (entry.isFile()) {
      files++;
      bytes += (await stat(file)).size;
    }
  }
  return { files, bytes };
}

const describe = async (directory) => {
  const { files, bytes } = await inventory(directory);
  return `${files} files, ${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

const exists = (directory) => lstat(directory).then((info) => info.isDirectory(), () => false);

const stagingDirectory = await mkdtemp(path.join(root, ".byline-astro-cache-"));
const stagedCache = path.join(stagingDirectory, "astro");
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
  const restoredFrom = (await exists(cache)) ? cache : (await exists(legacyCache)) ? legacyCache : null;
  if (restoredFrom) {
    await rename(restoredFrom, stagedCache);
    cacheSaved = true;
    console.log(`[byline] Preserved the restored Astro cache from ${path.relative(root, restoredFrom)} (${await describe(stagedCache)})`);
  } else {
    console.log("[byline] No Astro cache was restored (cold build)");
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
    if (cacheSaved) {
      await mkdir(path.dirname(cache), { recursive: true });
      await rm(cache, { recursive: true, force: true });
      await rename(stagedCache, cache);
      console.log("[byline] Restored the Astro cache directly to node_modules/.astro");
    }
  }
} finally {
  await rm(stagingDirectory, { recursive: true, force: true });
}

npm(["run", "build:frontend"]);

if (await exists(cache)) {
  console.log(`[byline] Astro cache ready for Workers Builds to save (${await describe(cache)})`);
}
