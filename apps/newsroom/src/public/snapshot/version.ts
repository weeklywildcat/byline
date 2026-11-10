import { PUBLIC_SNAPSHOT_SCHEMA_VERSION } from "@byline/content";

export { PUBLIC_SNAPSHOT_SCHEMA_VERSION };
/** Projection semantics, independent of the schema, content revision and Media recipe. */
// 3: adds the optional `frontPage` placements (docs/front-page.md).
// 4: Snapshot v3 with Byline Data (published Data Projects and their release descriptors).
export const PUBLIC_SNAPSHOT_PRODUCER_VERSION = 4;

/** The immutable artifact's name: content-addressed by the exact stored bytes. */
export function snapshotFilename(revision: number, sha256: string): string {
  return `snapshot-v${PUBLIC_SNAPSHOT_SCHEMA_VERSION}-r${revision}-${sha256}.json`;
}

export const SNAPSHOT_FILENAME_PATTERN = new RegExp(`^snapshot-v${PUBLIC_SNAPSHOT_SCHEMA_VERSION}-r(\\d+)-([0-9a-f]{64})\\.json$`);
