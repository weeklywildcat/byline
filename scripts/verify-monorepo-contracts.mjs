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

const pluginSource = await readFile("wordpress-plugin/weekly-wildcat-headless.php", "utf8");
for (const legacyContract of [
  "const WWH_SPORTS_GAME_POST_TYPE = 'ww_sports_game'",
  "const WWH_SPORTS_ROSTER_POST_TYPE = 'ww_sports_roster'",
  "const WWH_SCHOOL_EVENT_POST_TYPE = 'ww_school_event'",
  "const WWH_REST_NAMESPACE = 'weekly-wildcat/v1'",
  "'_ww_sport_key'",
  "'_ww_start_datetime'"
]) {
  if (!pluginSource.includes(legacyContract)) throw new Error(`Legacy storage/API contract changed: ${legacyContract}`);
}

const studioSource = await readFile("wordpress-plugin/src/studio.tsx", "utf8");
if (/https?:\/\/|NEXT_PUBLIC_SITE_URL|NEXT_PUBLIC_WP_API_URL/.test(studioSource)) {
  throw new Error("Studio must not load or depend on the public frontend.");
}

const outputRoot = "apps/web/out";
const forbiddenPublicValues = [
  "BYLINE_TEST_SECRET_DO_NOT_EXPORT",
  "BYLINE_DEPLOYMENT_HOOK_URL",
  "BYLINE_DISCORD_BRIDGE_SECRET",
  "WWH_DISCORD_BRIDGE_SECRET",
  "BYLINE_DISCORD_CLIENT_SECRET",
  "deployHookUrl",
  "clientSecret",
  "wpNonce"
];
for (const file of await textFiles(outputRoot)) {
  const contents = await readFile(file, "utf8");
  for (const forbidden of forbiddenPublicValues) {
    if (contents.includes(forbidden)) throw new Error(`Protected admin value ${forbidden} leaked into ${file}`);
  }
}

console.log("Static-export, Studio independence, legacy storage, and public-secret contracts verified.");
