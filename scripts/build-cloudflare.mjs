#!/usr/bin/env node
// Cloudflare Workers Builds installs the whole monorepo by default. With
// SKIP_DEPENDENCY_INSTALL=1, install only the public site and its dependencies.
//
// Astro keeps its incremental-build cache (and Byline's content-addressed
// publication media cache) in apps/web/node_modules/.astro. Workers Builds
// saves and restores the framework cache at `node_modules/.astro` relative to
// the build's root directory, which is the repository root unless the project
// sets a root directory. So the cache is looked for in both places, kept
// outside node_modules while `npm ci` recreates the dependency tree, and,
// after a successful build, mirrored (hardlinks, no extra disk) to both places
// so that whichever one Workers Builds saves carries the whole cache.
import { spawnSync } from "node:child_process";
import { link, copyFile, lstat, mkdir, mkdtemp, readdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// Where Astro and the media cache actually read and write.
const cache = path.join(root, "apps/web/node_modules/.astro");
// Where Workers Builds saves and restores it when the root directory is the repository root.
const rootCache = path.join(root, "node_modules/.astro");

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

/** Recreates `source` at `target`, hardlinking every file (copying across devices). */
async function mirror(source, target) {
  await mkdir(target, { recursive: true });
  for (const entry of await readdir(source, { withFileTypes: true })) {
    const from = path.join(source, entry.name);
    const to = path.join(target, entry.name);
    if (entry.isDirectory()) await mirror(from, to);
    else if (entry.isFile()) {
      await link(from, to).catch((error) => {
        if (error.code === "EXDEV" || error.code === "EPERM" || error.code === "EMLINK") return copyFile(from, to);
        throw error;
      });
    }
  }
}

const exists = (directory) => lstat(directory).then((info) => info.isDirectory(), () => false);

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
  // Say plainly what the platform restored, so the next build log shows whether caching works.
  const restoredFrom = (await exists(cache)) ? cache : (await exists(rootCache)) ? rootCache : null;
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
    // Restoring in finally also protects the cache if npm fails.
    if (cacheSaved) {
      await mkdir(path.dirname(cache), { recursive: true });
      await rm(cache, { recursive: true, force: true });
      await rename(stagedCache, cache);
      console.log("[byline] Restored the Astro cache");
    }
  }
} finally {
  await rm(cacheStagingDirectory, { recursive: true, force: true });
}

npm(["run", "build:frontend"]);

// Hand the cache to the platform: it saves node_modules/.astro under the root directory.
if (await exists(cache)) {
  await rm(rootCache, { recursive: true, force: true });
  await mirror(cache, rootCache);
  console.log(`[byline] Astro cache ready to save at ${path.relative(root, rootCache)} (${await describe(rootCache)})`);
}
