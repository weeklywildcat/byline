#!/usr/bin/env node
// Points node_modules/@byline/site at the site this checkout builds (BYLINE_SITE,
// a directory; default sites/default). Every tool then resolves `@byline/site/*`
// by ordinary package resolution: Node, tsx, tsc, Vite, Vitest and Next alike.
import { lstat, mkdir, readFile, readlink, rm, symlink } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = process.env.BYLINE_ROOT ? path.resolve(process.env.BYLINE_ROOT) : path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const site = path.resolve(root, process.argv[2] || process.env.BYLINE_SITE || "sites/default");
const manifest = JSON.parse(await readFile(path.join(site, "package.json"), "utf8"));
for (const entry of ["./config", "./web", "./preview", "./package.json"]) {
  if (!manifest.exports?.[entry]) throw new Error(`${site} is not a Byline site: its package.json has no "${entry}" export.`);
}
const link = path.join(root, "node_modules", "@byline", "site");
await mkdir(path.dirname(link), { recursive: true });
const current = await lstat(link).then(async (stats) => (stats.isSymbolicLink() ? path.resolve(path.dirname(link), await readlink(link)) : "other"), () => null);
if (current !== site) {
  await rm(link, { recursive: true, force: true });
  await symlink(path.relative(path.dirname(link), site), link, "dir");
}
console.log(`[byline] site: ${path.relative(root, site) || "."} (${manifest.name})`);
