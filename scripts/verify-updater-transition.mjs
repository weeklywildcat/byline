import { lstat, readFile, readlink, realpath } from "node:fs/promises";
import path from "node:path";

const pluginSource = await readFile("wordpress-plugin/weekly-wildcat-headless.php", "utf8");
const pluginPackage = JSON.parse(await readFile("wordpress-plugin/package.json", "utf8"));
const releaseWorkflow = await readFile(".github/workflows/release-plugin.yml", "utf8");
const remoteEntrypoint = "weekly-wildcat-headless.php";
const canonicalEntrypoint = "wordpress-plugin/weekly-wildcat-headless.php";

const version = pluginSource.match(/^\s*\* Version:\s*([^\s]+)\s*$/m)?.[1];
if (!version || version !== pluginPackage.version) {
  throw new Error(`Plugin header version ${version ?? "<missing>"} does not match package version ${pluginPackage.version}`);
}

const updater = pluginSource.match(/function wwh_register_update_checker\(\): void\s*\{(?<body>.*?)\n\}/s)?.groups?.body;
if (!updater) throw new Error("Could not locate the Plugin Update Checker registration.");

for (const expected of [
  "'https://github.com/weeklywildcat/byline/'",
  "'weekly-wildcat-headless'",
  "weekly-wildcat-headless\\.zip"
]) {
  if (!updater.includes(expected)) throw new Error(`Updater is missing ${expected}`);
}
if (updater.includes("weeklywildcat/byline-plugin")) {
  throw new Error("Future update checks still point at the standalone compatibility repository.");
}

const remoteEntrypointStats = await lstat(remoteEntrypoint);
if (!remoteEntrypointStats.isSymbolicLink()) {
  throw new Error(`${remoteEntrypoint} must be a symlink that exposes the monorepo plugin source to PUC.`);
}
if ((await readlink(remoteEntrypoint)) !== canonicalEntrypoint) {
  throw new Error(`${remoteEntrypoint} must target ${canonicalEntrypoint}.`);
}
if ((await realpath(remoteEntrypoint)) !== path.resolve(canonicalEntrypoint)) {
  throw new Error("The PUC remote entrypoint does not resolve to the canonical plugin source.");
}
if ((await readFile(remoteEntrypoint, "utf8")) !== pluginSource) {
  throw new Error("The PUC remote entrypoint does not expose the canonical plugin contents.");
}

for (const expected of ['- "v*"', "wordpress-plugin/weekly-wildcat-headless.php", "weekly-wildcat-headless.zip"]) {
  if (!releaseWorkflow.includes(expected)) throw new Error(`Canonical release workflow is missing ${expected}`);
}

console.log(`Updater transition verified for installed slug weekly-wildcat-headless at version ${version}; PUC remote source path ${remoteEntrypoint} resolves to ${canonicalEntrypoint}.`);
