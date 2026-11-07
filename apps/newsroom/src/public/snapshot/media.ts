import { escapeHtml } from "@byline/content/story";
import type { ArticleMediaAsset } from "@byline/article-body";
import { mediaCredit, mediaKindOf } from "@byline/article-body";
import {
  largestNaturalImage,
  legacyRenditionsFromManifest,
  publicationManifestBlobs,
  publicationMediaReadiness,
  publicationMediaStem,
  type PublicationImageFile,
  type PublicationImageManifest,
  type PublicationMediaManifest
} from "@byline/content";
import type { Payload } from "payload";
import { publicationStore, type PublicationStore } from "../../publication-media/blob-store";
import { PublicSnapshotError } from "./errors";

/**
 * Referenced Media → prepared public media, for the v1 snapshot.
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
  mimeType?: string | null;
  alt?: string | null;
  creator?: string | null;
  credit?: string | null;
  copyright?: string | null;
  license?: string | null;
  publicationRevision?: number | null;
  publicationAssets?: { status?: string | null; preparedRevision?: number | null; recipeVersion?: number | null; manifest?: unknown } | null;
};

export type PreparedMedia = {
  id: number;
  filename: string;
  alt: string;
  creator: string;
  credit: string;
  copyright: string;
  license: string;
  manifest: PublicationMediaManifest;
};

/** A v1 attachment record (WordPress-compatible) plus the prepared-media build extension. */
export type SnapshotAttachment = Record<string, unknown> & { id: number; source_url: string };

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");
const isUrl = (value: string) => /^https?:\/\/\S+$/i.test(value) || (value.startsWith("/") && !value.startsWith("//"));

/** The natural file at or above `width` (or the largest): a sensible single file for a fixed-size use. */
export function naturalAtLeast(manifest: PublicationImageManifest, width: number): PublicationImageFile {
  return manifest.natural.find((file) => file.width >= width) ?? largestNaturalImage(manifest);
}

export const focalPosition = (manifest: PublicationImageManifest): string | undefined =>
  Math.abs(manifest.focalPoint.x - 50) > 0.5 || Math.abs(manifest.focalPoint.y - 50) > 0.5 ? `${manifest.focalPoint.x}% ${manifest.focalPoint.y}%` : undefined;

export class PreparedMediaCatalog {
  private readonly prepared = new Map<number, PreparedMedia>();
  private readonly problems: string[] = [];

  private constructor(private readonly store: PublicationStore) {}

  /**
   * Loads and checks every referenced asset. `usage` names why each is
   * referenced, for an actionable not-ready message. Throws `media-not-ready`
   * listing every problem at once.
   */
  static async load(payload: Payload, references: Map<number, { usage: string; kind: "image" | "document" | "any" }>, options: { store?: PublicationStore } = {}): Promise<PreparedMediaCatalog> {
    const catalog = new PreparedMediaCatalog(options.store ?? publicationStore());
    const ids = [...references.keys()].sort((a, b) => a - b);
    const found = ids.length
      ? await payload.find({
          collection: "media",
          where: { id: { in: ids } },
          select: { filename: true, mimeType: true, alt: true, creator: true, credit: true, copyright: true, license: true, publicationRevision: true, publicationAssets: true },
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
      if (reference.kind === "document" && manifest.kind !== "document") {
        catalog.problems.push(`${name}, used by ${reference.usage}: a PDF document is required.`);
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

  get(id: number): PreparedMedia | null {
    return this.prepared.get(id) ?? null;
  }

  require(id: number): PreparedMedia {
    const media = this.prepared.get(id);
    if (!media) throw new PublicSnapshotError("invalid-projection", `Media ${id} was used without being referenced first.`);
    return media;
  }

  image(id: number): { media: PreparedMedia; manifest: PublicationImageManifest } {
    const media = this.require(id);
    if (media.manifest.kind !== "image") throw new PublicSnapshotError("invalid-projection", `Media ${id} is not an image.`);
    return { media, manifest: media.manifest };
  }

  ids(): number[] {
    return [...this.prepared.keys()].sort((a, b) => a - b);
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

  /** The v1 attachment record: WordPress-compatible fields from prepared files only, plus `bylinePublication`. */
  attachment(id: number, options: { caption?: string } = {}): SnapshotAttachment {
    const media = this.require(id);
    const { manifest } = media;
    const caption = options.caption ? `<p>${escapeHtml(options.caption)}</p>\n` : "";
    const credit = {
      creator: media.creator,
      creditText: media.credit,
      copyrightNotice: media.copyright,
      licenseUrl: isUrl(media.license) ? media.license : "",
      acquireLicensePage: ""
    };
    const common = {
      id,
      slug: publicationMediaStem(media.filename || `media-${id}`),
      type: "attachment",
      title: { rendered: "" },
      caption: { rendered: caption },
      alt_text: media.alt
    };
    if (manifest.kind === "image") {
      const largest = largestNaturalImage(manifest);
      const sizes = Object.fromEntries(manifest.natural.map((file) => [`byline-natural-${file.width}`, {
        file: file.publicPath.split("/").pop()!,
        width: file.width,
        height: file.height,
        mime_type: file.mimeType,
        source_url: file.publicPath
      }]));
      const crops = Object.fromEntries(Object.entries(manifest.crops).map(([shape, family]) => [shape, family!.rect]));
      const artDirection = { focalPoint: { ...manifest.focalPoint }, crops, renditions: legacyRenditionsFromManifest(manifest) };
      return {
        ...common,
        media_type: "image",
        mime_type: largest.mimeType,
        source_url: largest.publicPath,
        media_details: {
          width: largest.width,
          height: largest.height,
          sizes,
          image_meta: { caption: "", copyright: media.copyright, credit: media.credit }
        },
        bylineImage: { ...credit, artDirection },
        weeklyWildcatImage: { ...credit, artDirection },
        bylinePublication: { manifest }
      };
    }
    return {
      ...common,
      media_type: "file",
      mime_type: manifest.file.mimeType,
      source_url: manifest.file.publicPath,
      media_details: { filesize: manifest.file.bytes },
      bylinePublication: { manifest }
    };
  }

  /** A public photo record (`{ id, url, alt, width, height, objectPosition? }`) for portraits and artwork. */
  photo(id: number, options: { shape?: "square"; minWidth: number }): { id: number; url: string; alt: string; width: number; height: number; objectPosition?: string } {
    const { media, manifest } = this.image(id);
    const crop = options.shape ? manifest.crops[options.shape] : undefined;
    if (crop) {
      const file = crop.renditions.find((candidate) => candidate.width >= options.minWidth) ?? crop.renditions[crop.renditions.length - 1];
      return { id, url: file.publicPath, alt: media.alt, width: file.width, height: file.height };
    }
    const file = naturalAtLeast(manifest, options.minWidth);
    const position = focalPosition(manifest);
    return { id, url: file.publicPath, alt: media.alt, width: file.width, height: file.height, ...(position ? { objectPosition: position } : {}) };
  }

  /** Every attachment record, by Media ID. */
  attachments(): SnapshotAttachment[] {
    return this.ids().map((id) => this.attachment(id));
  }
}
