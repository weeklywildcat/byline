import { getNativeSnapshot } from "./native-snapshot";
import { nativeArchiveViews } from "./native-archive-views";

export function assertPreparedBuildMode() {
  const fixture = process.env.BYLINE_CONTENT_MODE?.endsWith("-fixture") || process.env.BYLINE_CONTENT_MODE === "empty";
  if (process.env.NODE_ENV === "production" && !fixture && !hasPreparedSnapshot()) {
    throw new Error("Production requires the Payload snapshot build wrapper.");
  }
}

export function hasPreparedSnapshot() {
  return Boolean(process.env.BYLINE_PREPARED_SNAPSHOT_FILE);
}

let prepared: ReturnType<typeof nativeArchiveViews> | undefined;

export function getPreparedDatasets() {
  const snapshot = getNativeSnapshot();
  if (!snapshot) throw new Error("No prepared Payload snapshot is available.");
  return prepared ??= nativeArchiveViews(snapshot);
}
