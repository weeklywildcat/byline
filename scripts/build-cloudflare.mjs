#!/usr/bin/env node
// Cloudflare Workers Builds installs the whole monorepo by default. With
// SKIP_DEPENDENCY_INSTALL=1, install only the public site and its dependencies.
//
// Byline's Workers Builds Root directory is apps/web, so Astro's real cache is
// apps/web/node_modules/.astro. npm ci recreates node_modules, therefore this
// wrapper stages the restored cache outside the dependency tree and restores it
// before Astro runs. A repository-root invocation remains supported for local
// CI/older Workers settings; only that compatibility path mirrors the cache.
import { spawnSync } from "node:child_process";
import { copyFile, link, lstat, mkdir, mkdtemp, readdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const webRoot = path.join(root, "apps/web");
const cache = path.join(webRoot, "node_modules/.astro");
const invocationRoot = path.resolve(process.cwd());
const invocationCache = path.join(invocationRoot, "node_modules/.astro");
const shouldMirrorInvocationCache = invocationCache !== cache;

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
  const restoredFrom = (await exists(cache)) ? cache
    : shouldMirrorInvocationCache && (await exists(invocationCache)) ? invocationCache
    : null;
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
      console.log("[byline] Restored the Astro cache to apps/web/node_modules/.astro");
    }
  }
} finally {
  await rm(stagingDirectory, { recursive: true, force: true });
}

npm(["run", "build:frontend"]);

if (await exists(cache)) {
  if (shouldMirrorInvocationCache) {
    await rm(invocationCache, { recursive: true, force: true });
    await mirror(cache, invocationCache);
    console.log(`[byline] Mirrored Astro cache for ${path.relative(root, invocationRoot) || "repository-root"} invocation compatibility`);
  }
  console.log(`[byline] Astro cache ready for Workers Builds to save (${await describe(cache)})`);
}
