import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(projectRoot, "out");

async function filesUnder(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? filesUnder(target) : [target];
  }));
  return nested.flat();
}

const publication = JSON.parse(await readFile(path.join(output, "_byline", "publication.json"), "utf8"));
const manifest = JSON.parse(await readFile(path.join(output, "_byline", "manifest.json"), "utf8"));
if (publication.identity.name !== "North Star News" || manifest.theme !== "byline-modern") {
  throw new Error("The second-publication build did not use the North Star identity and Modern theme.");
}
if (publication.features.sports || publication.features.discord || publication.features.polls) {
  throw new Error("The second-publication fixture unexpectedly enabled an optional module.");
}

const textFiles = (await filesUnder(output)).filter((file) => /\.(?:html|json|xml)$/i.test(file));
const forbidden = /Weekly Wildcat|weeklywildcat|Ninety Six|Wildcats/i;
for (const file of textFiles) {
  const content = await readFile(file, "utf8");
  if (forbidden.test(content)) {
    throw new Error(`Weekly Wildcat identity leaked into ${path.relative(output, file)}.`);
  }
}

const home = await readFile(path.join(output, "index.html"), "utf8");
if (!home.includes("North Star") || home.includes("use.typekit.net") || home.includes("weekly-wildcat.kit.com") || home.includes("clarity.ms")) {
  throw new Error("The second-publication homepage did not apply its independent identity/font/integration boundary.");
}
const sitemap = await readFile(path.join(output, "sitemap.xml"), "utf8");
if (sitemap.includes("/sports/")) {
  throw new Error("Disabled sports routes leaked into the second-publication sitemap.");
}

console.log(`Verified second publication across ${textFiles.length} public text artifacts with no Weekly Wildcat identity leakage.`);
