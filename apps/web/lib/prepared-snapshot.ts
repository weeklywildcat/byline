import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type { BylinePublicationConfig } from "@byline/core";
import { validatePublicBuildSnapshotV1 } from "@byline/content";
import type { WordPressPost, WordPressAuthor, WordPressCategory, WordPressTag, WordPressPage, WordPressMedia } from "./wordpress";
import type { SchoolEvent } from "./headless";

export const BUILD_SNAPSHOT_SCHEMA_VERSION = 1;
export type PublicBuildDatasets = {
  posts: WordPressPost[];
  authors: WordPressAuthor[];
  guests: Array<{ id: number | string; type: "guest"; name: string; slug: string; bio?: string; role?: string; hasProfilePage?: boolean; profilePhoto?: { id?: number; url: string; alt?: string; width?: number | null; height?: number | null }; links?: Record<string, string> | Array<{ label: string; url: string }> }>;
  categories: WordPressCategory[];
  tags: WordPressTag[];
  pages: WordPressPage[];
  corrections: Array<{ id: number | string; type: string; text: string; date: string; storyId: number; story: { id: number; title: string; url: string; slug: string } }>;
  coverages: Array<{ id: number | string; slug: string; title: string; format?: string; description: string; overview: string; startAt?: string; endAt?: string; status: string; artwork: { id?: number; url: string; alt: string } | null; stories: Array<{ id: number; slug: string; title: string; url: string; excerpt: string; publishedAt: string; modifiedAt: string }> }>;
  schoolEvents: SchoolEvent[];
  attachments: WordPressMedia[];
};
export type PublicBuildSnapshot = {
  schemaVersion: 1;
  revision: number;
  generatedAt: string;
  sourceTimezone: string;
  publication: BylinePublicationConfig;
  datasets: PublicBuildDatasets;
  counts: Record<keyof PublicBuildDatasets, number>;
};
export type BuildSnapshotPointer = {
  schemaVersion: 1; revision: number; generatedAt: string; digest: string; bytes: number; url: string;
};
function requireCondition(condition: unknown, detail: string): asserts condition {
  if (!condition) throw new Error(`Invalid Byline build snapshot: ${detail}`);
}
/** The separate WordPress build contract. Payload acquisition uses native-snapshot. */
export function validateBuildSnapshot(value: unknown): PublicBuildSnapshot {
  return validatePublicBuildSnapshotV1<PublicBuildSnapshot>(value);
}
export function parseBuildSnapshot(bytes: Uint8Array, pointer?: BuildSnapshotPointer, minimumRevision = 0): PublicBuildSnapshot {
  if (pointer) {
    requireCondition(pointer.schemaVersion === 1, "unsupported pointer schemaVersion");
    requireCondition(bytes.byteLength === pointer.bytes, "artifact byte length mismatch");
    requireCondition(createHash("sha256").update(bytes).digest("hex") === pointer.digest, "SHA-256 digest mismatch");
  }
  const snapshot = validateBuildSnapshot(JSON.parse(Buffer.from(bytes).toString("utf8")));
  requireCondition(!pointer || snapshot.revision === pointer.revision, "pointer/artifact revision mismatch");
  requireCondition(snapshot.revision >= minimumRevision, "snapshot is stale for the expected revision");
  return snapshot;
}
let localSnapshot: PublicBuildSnapshot | undefined;
export function getLocalBuildSnapshot(): PublicBuildSnapshot | undefined {
  const file = process.env.BYLINE_PREPARED_SNAPSHOT_FILE;
  if (!file) return undefined;
  return localSnapshot ??= parseBuildSnapshot(readFileSync(file));
}
