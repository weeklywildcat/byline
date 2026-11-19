import { z } from "zod";
import {
  emptyPublicDataSection,
  PUBLIC_DATA_ROUTE,
  publicDataSectionSchema,
  validatePublicDataSection,
  type DataPresentationDescriptor,
  type PublicDataSection
} from "@byline/data";
import {
  PUBLIC_SNAPSHOT_V2_SCHEMA_VERSION,
  snapshotSchemaParts,
  withoutRetiredPolls,
  validatePublicBuildSnapshotV2,
  validateSnapshotFacts,
  type PublicBuildSnapshotV2,
  type SnapshotFactsInput,
  type SnapshotRegistryOptions
} from "./public-snapshot-v2";

/**
 * Public Snapshot v3 (still read; the producer writes v4, `public-snapshot-v4.ts`): v2's closed content plus Byline Data
 * (docs/byline-data.md#snapshot-v3). A genuine wire change, so a new version
 * instead of quietly widening v2's strict records.
 *
 *   data.projects  published Data Projects: route, presentation, settings,
 *                  bindings to exact releases, source and methodology
 *   data.releases  the descriptors ({ sha256, bytes, dataset, fields, … }) of
 *                  exactly the releases those projects use
 *
 * Row data never enters the snapshot: the build acquires each release's
 * content-addressed bytes separately and verifies them against its
 * descriptor before rendering.
 */
export const PUBLIC_SNAPSHOT_V3_SCHEMA_VERSION = 3 as const;

const { publication, datasets, frontPage, instant, count } = snapshotSchemaParts;

export const publicBuildSnapshotV3Schema = z.strictObject({
  schemaVersion: z.literal(PUBLIC_SNAPSHOT_V3_SCHEMA_VERSION), revision: count, generatedAt: instant, publication, datasets,
  counts: z.record(datasets.keyof(), count),
  frontPage: frontPage.optional(),
  data: publicDataSectionSchema
});

export type PublicBuildSnapshotV3 = Omit<PublicBuildSnapshotV2, "schemaVersion"> & { schemaVersion: typeof PUBLIC_SNAPSHOT_V3_SCHEMA_VERSION; data: PublicDataSection };
export type SnapshotValidationOptions = SnapshotRegistryOptions & {
  /** The registered Data presentation for a key; an unknown key fails closed. */
  dataPresentation?: (key: string) => DataPresentationDescriptor | undefined;
};

export function validatePublicBuildSnapshotV3(input: unknown, options: SnapshotValidationOptions = {}): PublicBuildSnapshotV3 {
  const value = withoutRetiredPolls(input);
  const result = publicBuildSnapshotV3Schema.safeParse(value);
  if (!result.success) throw new Error(`Invalid Byline build snapshot: ${result.error.issues.slice(0, 6).map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")}`);
  const snapshot = value as PublicBuildSnapshotV3;
  validateSnapshotV3Facts(snapshot, options);
  return snapshot;
}

/** The invariants v3 and v4 share: v2's facts plus Byline Data's routes, releases and Story references. */
export function validateSnapshotV3Facts(snapshot: SnapshotFactsInput & { data: PublicDataSection }, options: SnapshotValidationOptions = {}): void {
  validateSnapshotFacts(snapshot, options, {
    dataProjects: new Set(snapshot.data.projects.map((project) => project.id)),
    beforeRedirects: (claim, stories) => {
      // The Data index is code-owned; a Page or redirect may never take it, nor any Project's route.
      claim(PUBLIC_DATA_ROUTE);
      try {
        validatePublicDataSection(snapshot.data, { presentation: options.dataPresentation, story: (id) => stories.has(id), claim });
      } catch (error) {
        throw new Error(`Invalid Byline build snapshot: ${(error as Error).message}`);
      }
    }
  });
}

/** A v2 snapshot read as the current contract: it simply has no Data. */
export function upgradePublicSnapshotV2(snapshot: PublicBuildSnapshotV2): PublicBuildSnapshotV3 {
  return { ...snapshot, schemaVersion: PUBLIC_SNAPSHOT_V3_SCHEMA_VERSION, data: emptyPublicDataSection() };
}
