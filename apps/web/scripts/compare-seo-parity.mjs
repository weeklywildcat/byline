import { readFile } from "node:fs/promises";
import path from "node:path";

const baseline = JSON.parse(await readFile(path.resolve(process.argv[2]), "utf8"));
const candidate = JSON.parse(await readFile(path.resolve(process.argv[3]), "utf8"));
const fields = [
  "title", "canonical", "description", "openGraphUrl", "openGraphImage", "openGraphImageWidths", "openGraphImageHeights",
  "openGraphImageAlts", "articleSection", "articlePublishedTime", "articleModifiedTime", "articleAuthors", "articleTags", "twitterImageAlts"
];
const entities = new Map([
  ["&#x27;", "'"],
  ["&#39;", "'"],
  ["&quot;", '"'],
  ["&amp;", "&"],
  ["&lt;", "<"],
  ["&gt;", ">"]
]);
const decode = (value = "") => {
  if (Array.isArray(value)) {
    return value.map((item) => decode(item));
  }

  return String(value).replace(/&#x27;|&#39;|&quot;|&amp;|&lt;|&gt;/gi, (entity) => entities.get(entity.toLowerCase()) ?? entity);
};
const byRoute = new Map(candidate.map((entry) => [entry.route, entry]));
const differences = [];
for (const before of baseline) {
  if (before.route.startsWith("/_") || before.route.includes("/__byline-empty__/")) continue;
  const after = byRoute.get(before.route);
  if (!after) {
    differences.push({ route: before.route, field: "route", before: "present", after: "missing" });
    continue;
  }
  for (const field of fields) {
    if (!(field in before) || !(field in after)) continue;
    const beforeValue = decode(before[field]);
    const afterValue = decode(after[field]);
    if (JSON.stringify(beforeValue) !== JSON.stringify(afterValue)) {
      differences.push({ route: before.route, field, before: beforeValue, after: afterValue });
    }
  }
}
console.log(JSON.stringify({ compared: baseline.length, differences }, null, 2));
if (differences.length) process.exitCode = 1;
