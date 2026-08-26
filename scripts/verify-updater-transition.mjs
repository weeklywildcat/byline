import { readFile } from "node:fs/promises";

const pluginSource = await readFile("wordpress-plugin/weekly-wildcat-headless.php", "utf8");
const pluginPackage = JSON.parse(await readFile("wordpress-plugin/package.json", "utf8"));
const releaseWorkflow = await readFile(".github/workflows/release-plugin.yml", "utf8");

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

for (const expected of ['- "v*"', "wordpress-plugin/weekly-wildcat-headless.php", "weekly-wildcat-headless.zip"]) {
  if (!releaseWorkflow.includes(expected)) throw new Error(`Canonical release workflow is missing ${expected}`);
}

console.log(`Updater transition verified for installed slug weekly-wildcat-headless at version ${version}.`);
