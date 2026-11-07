import type { ArticleMediaAsset } from "@byline/article-body";
import { mediaCredit, mediaKindOf } from "@byline/article-body";
import {
  largestNaturalImage,
  publicationManifestBlobs,
  publicationMediaReadiness,
  type PublicMediaSnapshot
} from "@byline/content";
import type { Payload } from "payload";
import { publicationStore, type PublicationStore } from "../../publication-media/blob-store";
import { PublicSnapshotError } from "./errors";

/**
 * Referenced Media → prepared public media, for the native snapshot.
 *
 * The catalog is a closed set built from public inputs only (Story lead and
 * body media, public portraits, public Collection artwork). Every asset must
 * have a CURRENT Phase 5 prepared generation (`publicationMediaReadiness`:
 * ready, current revision, current recipe, valid manifest) whose files are all
 * in the store; otherwise preparation fails as `media-not-ready`, naming the
 * asset. There is no fallback to an original, a Library preview, an older
 * generation or any other URL.
 *
 * Only allowlisted metadata leaves this file: alt, creator/credit,
 * copyright, a license URL, the focal point/crop intent embodied in the
 * manifest, and the manifest itself (public-safe by construction).
 */

type MediaRow = {
  id: number;
  filename?: string | null;
  alt?: string | null;
  creator?: string | null;
  credit?: string | null;
  copyright?: string | null;
  license?: string | null;
  publicationRevision?: number | null;
  publicationAssets?: { status?: string | null; preparedRevision?: number | null; recipeVersion?: number | null; manifest?: unknown } | null;
};

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");

export class PreparedMediaCatalog {
  private readonly prepared = new Map<number, PublicMediaSnapshot>();
  private readonly problems: string[] = [];

  private constructor(private readonly store: PublicationStore) {}

  /**
   * Loads and checks every referenced asset. `usage` names why each is
   * referenced, for an actionable not-ready message. Throws `media-not-ready`
   * listing every problem at once.
   */
  static async load(payload: Payload, references: Map<number, { usage: string; kind: "image" | "any" }>, options: { store?: PublicationStore } = {}): Promise<PreparedMediaCatalog> {
    const catalog = new PreparedMediaCatalog(options.store ?? publicationStore());
    const ids = [...references.keys()].sort((a, b) => a - b);
    const found = ids.length
      ? await payload.find({
          collection: "media",
          where: { id: { in: ids } },
          select: { filename: true, alt: true, creator: true, credit: true, copyright: true, license: true, publicationRevision: true, publicationAssets: true },
          depth: 0,
          pagination: false,
          overrideAccess: true,
          // Machine fields (the manifest) are system reads.
          context: { bylineSystem: true }
        })
      : { docs: [] };
    const rows = new Map((found.docs as unknown as MediaRow[]).map((row) => [row.id, row]));
    for (const id of ids) {
      const reference = references.get(id)!;
      const row = rows.get(id);
      const name = row?.filename ? `${row.filename} (Media ${id})` : `Media ${id}`;
      if (!row) {
        catalog.problems.push(`${name}, used by ${reference.usage}: the asset no longer exists.`);
        continue;
      }
      const readiness = publicationMediaReadiness(row.publicationAssets ?? null, row.publicationRevision ?? null);
      if (!readiness.ready) {
        catalog.problems.push(`${name}, used by ${reference.usage}: no current prepared publication files (${readiness.reason}).`);
        continue;
      }
      const manifest = readiness.manifest;
      if (reference.kind === "image" && manifest.kind !== "image") {
        catalog.problems.push(`${name}, used by ${reference.usage}: an image is required.`);
        continue;
      }
      const missing: string[] = [];
      for (const blob of publicationManifestBlobs(manifest)) if (!(await catalog.store.has(blob.sha256, blob.bytes))) missing.push(blob.publicPath);
      if (missing.length) {
        catalog.problems.push(`${name}, used by ${reference.usage}: ${missing.length} prepared file(s) are missing from the publication store.`);
        continue;
      }
      catalog.prepared.set(id, {
        id,
        kind: manifest.kind,
        filename: text(row.filename),
        alt: text(row.alt),
        creator: text(row.creator),
        credit: text(row.credit),
        copyright: text(row.copyright),
        license: text(row.license),
        manifest
      });
    }
    if (catalog.problems.length) {
      throw new PublicSnapshotError("media-not-ready", `${catalog.problems.length} referenced Media asset(s) are not ready for publication.`, catalog.problems);
    }
    return catalog;
  }

  records(): PublicMediaSnapshot[] {
    return [...this.prepared.values()];
  }

  /**
   * The renderer's media record for the canonical ArticleBody, with the
   * prepared public file as its source (never a newsroom URL).
   */
  articleAsset(id: number): ArticleMediaAsset | null {
    const media = this.prepared.get(id);
    if (!media) return null;
    const { manifest } = media;
    const base = { id, filename: media.filename, alt: media.alt, credit: mediaCredit({ creator: media.creator, credit: media.credit }) };
    if (manifest.kind === "image") {
      const file = largestNaturalImage(manifest);
      const focal = manifest.focalPoint;
      return {
        ...base,
        kind: "image",
        src: file.publicPath,
        width: file.width,
        height: file.height,
        mimeType: file.mimeType,
        filesize: file.bytes,
        ...(focal.x !== 50 || focal.y !== 50 ? { focalPoint: { x: focal.x, y: focal.y } } : {})
      };
    }
    return { ...base, kind: mediaKindOf(manifest.file.mimeType), src: manifest.file.publicPath, width: null, height: null, mimeType: manifest.file.mimeType, filesize: manifest.file.bytes };
  }
}
