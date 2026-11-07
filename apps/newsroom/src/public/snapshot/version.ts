/**
 * Versions of the public snapshot, kept deliberately separate
 * (docs/payload-build-snapshots.md#producer-version):
 *
 * - `PUBLIC_SNAPSHOT_SCHEMA_VERSION`: the v1 envelope Astro consumes
 *   (`schemas/public-build-snapshot.schema.json`). Phase 9 adds v2.
 * - `PUBLIC_SNAPSHOT_V1_PRODUCER_VERSION`: the semantics of THIS code's
 *   projection and compatibility serialization. Bump it whenever the
 *   projection or its serialization changes. A completed pointer from another
 *   producer version is simply "not ready" for the current one; it never
 *   advances the public content revision (the same revision may then get a
 *   new artifact digest). It is not written into the v1 JSON envelope,
 *   whose top level is closed.
 * - The public content revision (`byline_publication_state`): content only.
 * - `PUBLICATION_MEDIA_RECIPE_VERSION` (Phase 5): how media files are made.
 */
export const PUBLIC_SNAPSHOT_SCHEMA_VERSION = 1 as const;
export const PUBLIC_SNAPSHOT_V1_PRODUCER_VERSION = 1;

/** The immutable artifact's name: content-addressed by the exact stored bytes. */
export function snapshotFilename(revision: number, sha256: string): string {
  return `snapshot-v${PUBLIC_SNAPSHOT_SCHEMA_VERSION}-r${revision}-${sha256}.json`;
}

export const SNAPSHOT_FILENAME_PATTERN = /^snapshot-v1-r(\d+)-([0-9a-f]{64})\.json$/;
