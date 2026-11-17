import { readFile, stat, writeFile } from "node:fs/promises";
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
  const outputRoot = path.join(projectRoot, "out");
  const inventory = await loadOutputInventory(projectRoot, outputRoot);
  // verify-build writes four small public diagnostics after the inventory is
  // created. Count those directly instead of walking the whole export again.
  const lateReports = ["routes.json", "seo.json", "media-manifest.json", "build-metrics.json"];
  let lateReportBytes = 0;
  for (const name of lateReports) {
    const info = await stat(path.join(outputRoot, "_byline", name)).catch(() => null);
    if (info?.isFile()) lateReportBytes += info.size;
  }
  const report = {
    ...phases,
    postbuildMs: Date.now() - postbuild.startedAt,
    totalFrontendMs: Date.now() - phases.totalStartedAt,
    outputBytes: inventory.totalBytes + lateReportBytes
  };
  await writeFile(path.join(directory, "performance.json"), JSON.stringify(report, null, 2) + "\n");
  console.log(`[byline] ${report.dataMode}: ${report.totalFrontendMs}ms, ${report.cmsRequests ?? "unmeasured"} CMS requests, ${report.routes.rendered} rendered / ${report.routes.restored} restored, ${report.outputBytes} output bytes`);
}
