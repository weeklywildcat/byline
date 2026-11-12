// Phase 0 spike: every third-party package the engine's lock pins must be in the
// publication's lock at the same version. Hoisting moves are allowed.
import { readFileSync } from "node:fs";
const [enginePath, pubPath] = process.argv.slice(2);
const versions = (file) => {
  const set = new Map();
  for (const [key, value] of Object.entries(JSON.parse(readFileSync(file, "utf8")).packages)) {
    if (!key.includes("node_modules/") || value.link) continue;
    const name = key.slice(key.lastIndexOf("node_modules/") + "node_modules/".length);
    if (!set.has(name)) set.set(name, new Set());
    set.get(name).add(value.version);
  }
  return set;
};
const engine = versions(enginePath), pub = versions(pubPath);
const problems = [];
for (const [name, wanted] of engine) for (const version of wanted) if (!pub.get(name)?.has(version)) problems.push(`${name}@${version}`);
if (problems.length) { console.error(`Publication lock is missing engine versions:\n  ${problems.join("\n  ")}`); process.exit(1); }
console.log(`Publication lock has all ${[...engine.values()].reduce((n, s) => n + s.size, 0)} engine package versions.`);
