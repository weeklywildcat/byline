/**
 * Why a public snapshot could not be prepared or served. Stale work is
 * normal coalescing (a newer revision exists); the rest needs a person or the
 * infrastructure. Messages identify records (Story/Media IDs, headlines,
 * filenames, issue paths) but never private bodies, notes or credentials.
 */
export type PublicSnapshotErrorCode =
  /** The public revision moved while collecting: a newer job prepares it. */
  | "stale-revision"
  /** A public input the projection needs is not available yet. */
  | "public-input-not-ready"
  /** A referenced Media asset has no current prepared generation (or a missing prepared file). */
  | "media-not-ready"
  /** The projection failed validation (a bug or bad data, never published). */
  | "invalid-projection"
  /** A published Story has content the normalizer cannot carry without losing it. */
  | "unsupported-story-content"
  /** Writing or reading the immutable artifact failed. */
  | "storage-failure"
  /** The conditional pointer promotion lost to a newer public revision. */
  | "promotion-lost";

export class PublicSnapshotError extends Error {
  readonly code: PublicSnapshotErrorCode;
  readonly details: string[];

  constructor(code: PublicSnapshotErrorCode, message: string, details: string[] = []) {
    super(message);
    this.name = "PublicSnapshotError";
    this.code = code;
    this.details = details;
  }

  /** Normal coalescing, not an incident. */
  get stale(): boolean {
    return this.code === "stale-revision" || this.code === "promotion-lost";
  }
}

export const isPublicSnapshotError = (error: unknown): error is PublicSnapshotError => error instanceof PublicSnapshotError;
