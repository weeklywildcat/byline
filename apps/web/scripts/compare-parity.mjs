import { readFile } from "node:fs/promises";
import path from "node:path";
const baseline = JSON.parse(await readFile(path.resolve(process.argv[2]), "utf8"));
const candidate = JSON.parse(await readFile(path.resolve(process.argv[3]), "utf8"));
const candidateRoutes = Array.isArray(candidate) ? candidate.map((entry) => typeof entry === "string" ? entry : entry.path) : [];
const removed = baseline.filter((route) => !candidateRoutes.includes(route));
const added = candidateRoutes.filter((route) => !baseline.includes(route));
console.log(JSON.stringify({ baseline: baseline.length, candidate: candidateRoutes.length, removed, added }, null, 2));
if (removed.length || added.length) process.exitCode = 1;
