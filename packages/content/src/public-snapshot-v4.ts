import { z } from "zod";
import {
  ANALYTICS_CONSENT_MODES,
  BYLINE_PUBLICATION_SCHEMA_VERSION,
  GOOGLE_MEASUREMENT_ID,
  upgradePublicationConfigV1,
  type BylinePublicationConfig
} from "@byline/core";
import { PUBLIC_SNAPSHOT_V2_SCHEMA_VERSION, snapshotSchemaParts, withoutRetiredPolls, validatePublicBuildSnapshotV2 } from "./public-snapshot-v2";
import {
  PUBLIC_SNAPSHOT_V3_SCHEMA_VERSION,
  upgradePublicSnapshotV2,
  validatePublicBuildSnapshotV3,
  validateSnapshotV3Facts,
  type PublicBuildSnapshotV3,
  type SnapshotValidationOptions
} from "./public-snapshot-v3";
import { publicDataSectionSchema } from "@byline/data";

/**
 * Public Snapshot v4: v3's content with publication contract version 2, which adds
 * `publication.analytics` (docs/google-analytics.md). A genuine wire change, so a new
 * version instead of quietly widening v3's strict publication.
 *
 *   publication.analytics  null, or { provider, measurementId, installTag, consentMode }
 *
 * Nothing about the connection (property, account, Google identity, scopes, tokens,
 * errors, timestamps) is ever part of it. v2 and v3 snapshots still load and upgrade
 * with `analytics: null`.
 */
export const PUBLIC_SNAPSHOT_SCHEMA_VERSION = 4 as const;
/** Every wire version a build accepts. */
export const SUPPORTED_PUBLIC_SNAPSHOT_SCHEMA_VERSIONS = [PUBLIC_SNAPSHOT_V2_SCHEMA_VERSION, PUBLIC_SNAPSHOT_V3_SCHEMA_VERSION, PUBLIC_SNAPSHOT_SCHEMA_VERSION] as const;
export type SupportedSnapshotSchemaVersion = (typeof SUPPORTED_PUBLIC_SNAPSHOT_SCHEMA_VERSIONS)[number];

const { publication: publicationV1, datasets, frontPage, instant, count } = snapshotSchemaParts;

const analytics = z.strictObject({
  provider: z.literal("google"),
  measurementId: z.string().regex(GOOGLE_MEASUREMENT_ID),
  installTag: z.literal(true),
  consentMode: z.enum(ANALYTICS_CONSENT_MODES)
}).nullable();

const publication = publicationV1.extend({ schemaVersion: z.literal(BYLINE_PUBLICATION_SCHEMA_VERSION), analytics });

export const publicBuildSnapshotV4Schema = z.strictObject({
  schemaVersion: z.literal(PUBLIC_SNAPSHOT_SCHEMA_VERSION), revision: count, generatedAt: instant, publication, datasets,
  counts: z.record(datasets.keyof(), count),
  frontPage: frontPage.optional(),
  data: publicDataSectionSchema
});

export type PublicBuildSnapshotV4 = Omit<PublicBuildSnapshotV3, "schemaVersion" | "publication"> & {
  schemaVersion: typeof PUBLIC_SNAPSHOT_SCHEMA_VERSION;
  publication: BylinePublicationConfig;
};
/** The current snapshot, whatever version it arrived as. */
export type PublicBuildSnapshot = PublicBuildSnapshotV4;

export function validatePublicBuildSnapshotV4(input: unknown, options: SnapshotValidationOptions = {}): PublicBuildSnapshotV4 {
  const value = withoutRetiredPolls(input);
  const result = publicBuildSnapshotV4Schema.safeParse(value);
  if (!result.success) throw new Error(`Invalid Byline build snapshot: ${result.error.issues.slice(0, 6).map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")}`);
  const snapshot = value as PublicBuildSnapshotV4;
  validateSnapshotV3Facts(snapshot, options);
  return snapshot;
}

/** A v3 snapshot read as the current contract: its publication measures nothing. */
export function upgradePublicSnapshotV3(snapshot: PublicBuildSnapshotV3): PublicBuildSnapshotV4 {
  return { ...snapshot, schemaVersion: PUBLIC_SNAPSHOT_SCHEMA_VERSION, publication: upgradePublicationConfigV1(snapshot.publication) };
}

/** Validates any supported version and returns the current contract. Unsupported versions fail closed. */
export function validatePublicBuildSnapshot(value: unknown, options: SnapshotValidationOptions = {}): PublicBuildSnapshot {
  const version = value && typeof value === "object" ? (value as { schemaVersion?: unknown }).schemaVersion : undefined;
  if (version === PUBLIC_SNAPSHOT_SCHEMA_VERSION) return validatePublicBuildSnapshotV4(value, options);
  if (version === PUBLIC_SNAPSHOT_V3_SCHEMA_VERSION) return upgradePublicSnapshotV3(validatePublicBuildSnapshotV3(value, options));
  if (version === PUBLIC_SNAPSHOT_V2_SCHEMA_VERSION) return upgradePublicSnapshotV3(upgradePublicSnapshotV2(validatePublicBuildSnapshotV2(value, options)));
  throw new Error(`Invalid Byline build snapshot: unsupported schemaVersion ${String(version)}.`);
}
