#!/usr/bin/env node

import { constants } from "node:fs";
import { copyFile, mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = path.join(repoRoot, "apps", "newsroom");
const nextRoot = path.join(appRoot, ".next");
const releasesRoot = path.join(nextRoot, "releases");
const activePointer = path.join(nextRoot, "active-release");
const RELEASE_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,95}$/;

function releaseName(value) {
  const name = String(value ?? "").trim();
  if (!RELEASE_PATTERN.test(name)) throw new Error(`Invalid newsroom release name: ${name || "(empty)"}`);
  return name;
}

async function exists(target) {
  try {
    const info = await stat(target);
    return info.isDirectory() || info.isFile();
  } catch {
    return false;
  }
}

async function cloneTree(source, target) {
  await mkdir(target, { recursive: true });
  for (const entry of await readdir(source, { withFileTypes: true })) {
    const from = path.join(source, entry.name);
    const to = path.join(target, entry.name);
    if (entry.isDirectory()) {
      await cloneTree(from, to);
    } else if (entry.isFile()) {
      // Ask the filesystem for a copy-on-write clone where it supports one.
      // COPYFILE_FICLONE falls back to a normal copy, unlike hardlinks which
      // would let the new build mutate cache bytes visible to the live release.
      await copyFile(from, to, constants.COPYFILE_FICLONE);
    }
  }
}

async function currentRelease() {
  const value = await readFile(activePointer, "utf8").catch((error) => {
    if (error.code === "ENOENT") return "";
    throw error;
  });
  const name = value.trim();
  return name ? releaseName(name) : null;
}

function releaseDirectory(name) {
  return path.join(releasesRoot, releaseName(name));
}

async function copyWarmCache(target, release) {
  const active = await currentRelease();
  if (active === release) throw new Error("Refusing to rebuild the active newsroom release in place.");
  const source = active ? path.join(releaseDirectory(active), "cache") : path.join(nextRoot, "cache");
  if (!(await exists(source))) return false;

  await cloneTree(source, target);
  return true;
}

async function buildRelease(name) {
  const release = releaseName(name);
  const directory = releaseDirectory(release);
  await mkdir(releasesRoot, { recursive: true });
  await rm(directory, { recursive: true, force: true });
  await mkdir(directory, { recursive: true });

  const warm = await copyWarmCache(path.join(directory, "cache"), release);
  console.log(`[byline] Building newsroom release ${release}${warm ? " with the previous Turbopack cache" : ""}...`);

  const child = spawn(
    process.platform === "win32" ? "npm.cmd" : "npm",
    ["run", "build", "--workspace", "@byline/newsroom"],
    {
      cwd: repoRoot,
      env: { ...process.env, BYLINE_NEXT_DIST_DIR: path.posix.join(".next", "releases", release) },
      stdio: "inherit"
    }
  );
  const status = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", resolve);
  });

  if (status !== 0) {
    await rm(directory, { recursive: true, force: true });
    process.exitCode = Number(status) || 1;
    return;
  }

  const buildId = path.join(directory, "BUILD_ID");
  if (!(await exists(buildId))) {
    await rm(directory, { recursive: true, force: true });
    throw new Error(`Next build for ${release} finished without BUILD_ID; refusing to activate it.`);
  }
  console.log(`[byline] Newsroom release ${release} is ready. The active release has not changed.`);
}

async function activateRelease(name) {
  const release = releaseName(name);
  const directory = releaseDirectory(release);
  if (!(await exists(path.join(directory, "BUILD_ID")))) {
    throw new Error(`Newsroom release ${release} is incomplete; BUILD_ID is missing.`);
  }

  await mkdir(nextRoot, { recursive: true });
  const temporary = `${activePointer}.${process.pid}.tmp`;
  await writeFile(temporary, `${release}\n`, "utf8");
  await rename(temporary, activePointer);
  console.log(release);
}

async function rollbackRelease(value) {
  const previous = String(value ?? "").trim();
  if (!previous || previous === "legacy") {
    await rm(activePointer, { force: true });
    console.log("legacy");
    return;
  }
  await activateRelease(previous);
}

async function pruneReleases(previousValue) {
  const active = await currentRelease();
  const previous = previousValue && previousValue !== "legacy" ? releaseName(previousValue) : null;
  const keep = new Set([active, previous].filter(Boolean));
  const entries = await readdir(releasesRoot, { withFileTypes: true }).catch((error) => {
    if (error.code === "ENOENT") return [];
    throw error;
  });

  for (const entry of entries) {
    if (!entry.isDirectory() || keep.has(entry.name)) continue;
    await rm(path.join(releasesRoot, entry.name), { recursive: true, force: true });
  }
}

const [command, argument] = process.argv.slice(2);

switch (command) {
  case "build":
    await buildRelease(argument);
    break;
  case "activate":
    await activateRelease(argument);
    break;
  case "current":
    console.log((await currentRelease()) ?? "legacy");
    break;
  case "rollback":
    await rollbackRelease(argument);
    break;
  case "prune":
    await pruneReleases(argument);
    break;
  default:
    throw new Error("Usage: newsroom-release.mjs <build|activate|current|rollback|prune> [release]");
}
