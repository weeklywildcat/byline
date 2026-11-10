import path from "node:path";
import { publicationMediaDir } from "../publication-media/paths";
import { ImmutableArtifactStore } from "../public/artifacts/store";
import { DataError } from "./errors";

/**
 * Immutable Data Release artifacts, content-addressed by the SHA-256 of their
 * exact canonical bytes, beside the snapshots on the publication volume:
 *
 *   <BYLINE_PUBLICATION_MEDIA_DIR>/data/v1/<sha256>.json
 *
 * The shared immutable artifact store writes them (never overwritten). They
 * are small and few, and an old one may still be named by a build that is
 * running, so they are never eagerly deleted.
 */
export const DATA_RELEASE_FILENAME = /^([0-9a-f]{64})\.json$/;

export function dataReleaseDirectory(env: Record<string, string | undefined> = process.env): string {
  return path.join(publicationMediaDir(env), "data", "v1");
}

export class DataReleaseStore extends ImmutableArtifactStore<void> {
  constructor(directory = dataReleaseDirectory()) {
    super(directory, {
      filename: (sha256) => `${sha256}.json`,
      pattern: DATA_RELEASE_FILENAME,
      digestOf: (match) => match[1],
      failure: (message) => new DataError("storage-failure", message, 500)
    });
  }

  write(bytes: Uint8Array) {
    return this.writeArtifact(bytes, undefined);
  }

  /** The verified bytes of a release by digest, or null. */
  read(sha256: string, bytes: number) {
    return this.readVerified(`${sha256}.json`, sha256, bytes);
  }
}
