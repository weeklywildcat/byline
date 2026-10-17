import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { getLocalBuildSnapshot, type PublicBuildDatasets } from "./prepared-snapshot";
import { materializeSnapshotMedia } from "./media";
let prepared: Promise<PublicBuildDatasets> | undefined;
export function assertPreparedBuildMode() {
  const fixture = process.env.BYLINE_CONTENT_MODE?.endsWith("-fixture") || process.env.BYLINE_CONTENT_MODE === "empty";
  if (process.env.NODE_ENV === "production" && !fixture && !hasPreparedSnapshot() && process.env.BYLINE_LEGACY_REST_BUILD !== "1") throw new Error("Production requires the prepared snapshot build wrapper; legacy REST acquisition is disabled.");
}
export function hasPreparedSnapshot() { return Boolean(process.env.BYLINE_PREPARED_SNAPSHOT_FILE); }
export function getPreparedDatasets(): Promise<PublicBuildDatasets> {
  return prepared ??= (async () => {
    const snapshot = getLocalBuildSnapshot();
    if (!snapshot) throw new Error("Production requires a prepared Byline build snapshot.");
    const started = performance.now();
    // The attachment catalog is fallback metadata, not a list of images to
    // download. Rendered embeds/body/profile URLs discover the required set;
    // a missing source can materialize its catalog alternative on demand.
    const { attachments, ...renderInputs } = snapshot.datasets;
    const { value, metrics } = await materializeSnapshotMedia(renderInputs);
    const directory = path.join(process.cwd(), ".byline-build");
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, "media-phases.json"), JSON.stringify({ ...metrics, totalMs: performance.now() - started }));
    return { ...value, attachments };
  })();
}
