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
  validatePublicBuildSnapshotV2,
  validateSnapshotFacts,
  type PublicBuildSnapshotV2,
  type SnapshotRegistryOptions
} from "./public-snapshot-v2";

/**
 * Public Snapshot v3: v2's closed content plus Byline Data
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
export const PUBLIC_SNAPSHOT_SCHEMA_VERSION = 3 as const;
/** Every wire version a build accepts. */
export const SUPPORTED_PUBLIC_SNAPSHOT_SCHEMA_VERSIONS = [PUBLIC_SNAPSHOT_V2_SCHEMA_VERSION, PUBLIC_SNAPSHOT_SCHEMA_VERSION] as const;
export type SupportedSnapshotSchemaVersion = (typeof SUPPORTED_PUBLIC_SNAPSHOT_SCHEMA_VERSIONS)[number];

const { publication, datasets, frontPage, instant, count } = snapshotSchemaParts;

export const publicBuildSnapshotV3Schema = z.strictObject({
  schemaVersion: z.literal(PUBLIC_SNAPSHOT_SCHEMA_VERSION), revision: count, generatedAt: instant, publication, datasets,
  counts: z.record(datasets.keyof(), count),
  frontPage: frontPage.optional(),
  data: publicDataSectionSchema
});

export type PublicBuildSnapshotV3 = Omit<PublicBuildSnapshotV2, "schemaVersion"> & { schemaVersion: typeof PUBLIC_SNAPSHOT_SCHEMA_VERSION; data: PublicDataSection };
/** The current snapshot, whatever version it arrived as. */
export type PublicBuildSnapshot = PublicBuildSnapshotV3;

export type SnapshotValidationOptions = SnapshotRegistryOptions & {
  /** The registered Data presentation for a key; an unknown key fails closed. */
  dataPresentation?: (key: string) => DataPresentationDescriptor | undefined;
};

export function validatePublicBuildSnapshotV3(value: unknown, options: SnapshotValidationOptions = {}): PublicBuildSnapshotV3 {
  const result = publicBuildSnapshotV3Schema.safeParse(value);
  if (!result.success) throw new Error(`Invalid Byline build snapshot: ${result.error.issues.slice(0, 6).map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")}`);
  const snapshot = value as PublicBuildSnapshotV3;
  validateSnapshotFacts(snapshot, options, {
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
  return snapshot;
}

/** A v2 snapshot read as the current contract: it simply has no Data. */
export function upgradePublicSnapshotV2(snapshot: PublicBuildSnapshotV2): PublicBuildSnapshotV3 {
  return { ...snapshot, schemaVersion: PUBLIC_SNAPSHOT_SCHEMA_VERSION, data: emptyPublicDataSection() };
}

/** Validates any supported version and returns the current contract. Unsupported versions fail closed. */
export function validatePublicBuildSnapshot(value: unknown, options: SnapshotValidationOptions = {}): PublicBuildSnapshot {
  const version = value && typeof value === "object" ? (value as { schemaVersion?: unknown }).schemaVersion : undefined;
  if (version === PUBLIC_SNAPSHOT_SCHEMA_VERSION) return validatePublicBuildSnapshotV3(value, options);
  if (version === PUBLIC_SNAPSHOT_V2_SCHEMA_VERSION) return upgradePublicSnapshotV2(validatePublicBuildSnapshotV2(value, options));
  throw new Error(`Invalid Byline build snapshot: unsupported schemaVersion ${String(version)}.`);
}

