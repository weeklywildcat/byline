import type { ArticleMediaAsset, ArticleMediaKind } from "./types";

/**
 * The credit printed for an asset: its creator, then its credit line, without
 * a "Photo by" style lead-in (the renderer adds "Photo:"). The same order as
 * WordPress (`byline_photo_credit_for_attachment`), so a photograph is never
 * credited two ways.
 */
export function mediaCredit(asset: { creator?: unknown; credit?: unknown }): string {
  for (const value of [asset.creator, asset.credit]) {
    const text = typeof value === "string" ? value.trim() : "";
    if (text) return text.replace(/^(?:photos?|photograph|photography|image|credit)(?:\s+by\s+|\s*[:\-–—]\s*)/iu, "").trim();
  }
  return "";
}

export function mediaKindOf(mimeType: string): ArticleMediaKind {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType === "application/pdf") return "document";
  if (mimeType.startsWith("audio/")) return "audio";
  if (mimeType.startsWith("video/")) return "video";
  return "other";
}

/** A Photo or Gallery item needs an image; a Document needs a PDF. */
export function isImageAsset(asset: Pick<ArticleMediaAsset, "kind"> | null | undefined): boolean {
  return asset?.kind === "image";
}

export function isDocumentAsset(asset: Pick<ArticleMediaAsset, "kind" | "mimeType"> | null | undefined): boolean {
  return asset?.kind === "document" && asset.mimeType === "application/pdf";
}

/** Alt text for one use of an asset: the block's override, else the asset's own. */
export function altFor(asset: Pick<ArticleMediaAsset, "alt"> | null | undefined, altOverride?: string): string {
  const override = altOverride?.trim();
  return override ? override : (asset?.alt ?? "").trim();
}

export const mediaKey = (id: string | number): string => String(id);
