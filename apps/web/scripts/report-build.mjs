import { readFile, writeFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
const directory = path.resolve(".byline-build");
if (process.argv[2] === "start") {
  await writeFile(path.join(directory, "postbuild-start.json"), JSON.stringify({ startedAt: Date.now() }));
} else {
  const load = async (name) => JSON.parse(await readFile(path.join(directory, name), "utf8"));
  const forbidden = await readFile(path.join(directory, "forbidden-cms-requests.ndjson"), "utf8").catch(() => "");
  if (forbidden.trim()) throw new Error(`Snapshot build attempted forbidden CMS requests, including a potentially swallowed failure: ${forbidden}`);
  const phases = await load("frontend-phases.json");
  const media = await load("media-phases.json").catch(() => null);
  const postbuild = await load("postbuild-start.json");
  async function size(directory) {
    let bytes = 0;
    for (const name of await readdir(directory)) {
      const file = path.join(directory, name);
      const info = await stat(file);
      bytes += info.isDirectory() ? await size(file) : info.size;
    }
    return bytes;
  }
  const report = { ...phases, media, astroExcludingMediaMs: phases.astroMs - (media?.totalMs ?? 0), postbuildMs: Date.now() - postbuild.startedAt, totalFrontendMs: Date.now() - phases.totalStartedAt, outputBytes: await size("out") };
  await writeFile(path.join(directory, "performance.json"), JSON.stringify(report, null, 2) + "\n");
  console.log(`[byline] ${report.dataMode}: ${report.totalFrontendMs}ms, ${report.cmsRequests ?? "unmeasured"} CMS requests, ${report.routes.rendered} rendered / ${report.routes.restored} restored, ${report.outputBytes} output bytes`);
}
