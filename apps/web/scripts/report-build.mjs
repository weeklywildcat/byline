import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadOutputInventory } from "./output-inventory.mjs";

const projectRoot = path.resolve(".");
const directory = path.resolve(".byline-build");
if (process.argv[2] === "start") {
  await writeFile(path.join(directory, "postbuild-start.json"), JSON.stringify({ startedAt: Date.now() }));
} else {
  const load = async (name) => JSON.parse(await readFile(path.join(directory, name), "utf8"));
  const forbidden = await readFile(path.join(directory, "forbidden-cms-requests.ndjson"), "utf8").catch(() => "");
  if (forbidden.trim()) throw new Error(`Snapshot build attempted forbidden CMS requests, including a potentially swallowed failure: ${forbidden}`);
  const phases = await load("frontend-phases.json");
  const postbuild = await load("postbuild-start.json");
  const inventory = await loadOutputInventory(projectRoot, path.join(projectRoot, "out"));
  const report = {
    ...phases,
    postbuildMs: Date.now() - postbuild.startedAt,
    totalFrontendMs: Date.now() - phases.totalStartedAt,
    outputBytes: inventory.totalBytes
  };
  await writeFile(path.join(directory, "performance.json"), JSON.stringify(report, null, 2) + "\n");
  console.log(`[byline] ${report.dataMode}: ${report.totalFrontendMs}ms, ${report.cmsRequests ?? "unmeasured"} CMS requests, ${report.routes.rendered} rendered / ${report.routes.restored} restored, ${report.outputBytes} output bytes`);
}
