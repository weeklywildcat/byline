import { readFile } from "node:fs/promises";
import path from "node:path";

const baseline = JSON.parse(await readFile(path.resolve(process.argv[2]), "utf8"));
const candidate = JSON.parse(await readFile(path.resolve(process.argv[3]), "utf8"));
const fields = ["title", "canonical", "description", "openGraphUrl"];
const decode = (value = "") => value
  .replace(/&#x27;|&#39;/gi, "'")
  .replace(/&quot;/gi, '"')
  .replace(/&amp;/gi, "&")
  .replace(/&lt;/gi, "<")
  .replace(/&gt;/gi, ">");
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
    if (decode(before[field]) !== decode(after[field])) differences.push({ route: before.route, field, before: decode(before[field]), after: decode(after[field]) });
  }
}
console.log(JSON.stringify({ compared: baseline.length, differences }, null, 2));
if (differences.length) process.exitCode = 1;
