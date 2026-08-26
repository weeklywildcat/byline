import { access, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(projectRoot, "out");

async function exists(target) {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

for (const required of ["index.html", "_byline/manifest.json", "_byline/publication.json", "_byline/designs.json"]) {
  if (!(await exists(path.join(output, required)))) throw new Error(`Static export is missing ${required}.`);
}

if (await exists(path.join(output, "api"))) {
  const apiStat = await stat(path.join(output, "api"));
  if (apiStat.isDirectory()) throw new Error("Static export unexpectedly contains a server API directory.");
}

const manifest = JSON.parse(await readFile(path.join(output, "_byline", "manifest.json"), "utf8"));
if (manifest.protocolVersion !== 1 || manifest.publicationSchemaVersion !== 1) {
  throw new Error("Static export manifest uses unsupported Byline compatibility versions.");
}

const publication = JSON.parse(await readFile(path.join(output, "_byline", "publication.json"), "utf8"));
const allowedPublicationKeys = [
  "schemaVersion", "revision", "identity", "location", "locale", "timezone", "urls", "branding",
  "appearance", "sections", "navigation", "social", "features", "licensing", "seo"
];
for (const key of Object.keys(publication)) {
  if (!allowedPublicationKeys.includes(key)) throw new Error(`Public export contains unexpected publication field ${key}.`);
}

function assertNoSecretKeys(value, pathParts = []) {
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    const nextPath = [...pathParts, key];
    const isSafeSemanticTokenMap = nextPath.join(".") === "appearance.tokenOverrides";
    if (!isSafeSemanticTokenMap && /(?:secret|password|token|privateKey|deployHook|accessKey|apiKey)/i.test(key)) {
      throw new Error(`Public export contains secret-like field ${nextPath.join(".")}.`);
    }
    assertNoSecretKeys(child, nextPath);
  }
}
assertNoSecretKeys(publication);

console.log("Verified static-only Byline export and public configuration boundary.");
