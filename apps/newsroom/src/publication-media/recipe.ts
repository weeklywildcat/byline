import { IMAGE_CROP_SHAPE_DETAILS, type ImageCropShape } from "@byline/core";
import { PUBLICATION_MEDIA_RECIPE_VERSION, PUBLICATION_STATIC_ASSET_MAX_BYTES } from "@byline/content";

/**
 * How publication files are prepared: every number that shapes their bytes,
 * in one place, under `PUBLICATION_MEDIA_RECIPE_VERSION`. Change any value
 * here and bump that version (in @byline/content) so every older generation
 * becomes stale and is prepared again; never scatter quality settings.
 *
 * The v1 quality values are conservative defaults, not a measured optimum:
 * the repository has no representative newsroom set (R7 and iPhone originals,
 * dark stadium, gym and stage light). `scripts/benchmark-publication-media.ts`
 * measures size and SSIM-style error for any folder of real photographs, so a
 * fixture set can retune these without touching the pipeline
 * (docs/publication-media.md#tuning-the-recipe).
 */
export const PUBLICATION_RECIPE = {
  version: PUBLICATION_MEDIA_RECIPE_VERSION,
  /** The whole photo, never upscaled. The largest made becomes the public fallback/source. */
  naturalWidths: [320, 640, 960, 1440, 1920, 2560],
  /** Photographs. */
  webp: { quality: 80, effort: 5, smartSubsample: true },
  /** Graphics with transparency (PNG, WebP or GIF with alpha): lossless keeps edges and text exact. */
  webpLossless: { lossless: true, effort: 5 },
  /** Social cards: JPEG is understood by every platform that unfurls links. */
  socialJpeg: { quality: 84, mozjpeg: true, chromaSubsampling: "4:2:0" as const },
  social: { width: 1200, height: 630 },
  /** Crawlable Article/NewsArticle candidates; Google recommends at least 1200px wide. */
  seo: { width: 2560, preferredMinWidth: 1200 },
  /** Explicit editor crops use the shape's own widths (the same table the editor and site use). */
  cropWidths: (shape: ImageCropShape) => IMAGE_CROP_SHAPE_DETAILS[shape].widths,
  animation: {
    /** Longest edge of the public animated file. */
    maxEdge: 960,
    maxFrames: 300,
    /** Decoded pixels across all frames (width × height × frames) before refusing. */
    maxDecodedPixels: 120_000_000,
    webp: { quality: 70, effort: 4 }
  },
  /** Sharp's own decompression-bomb guard for a single image, kept on (its default is 268 megapixels). */
  limitInputPixels: 268_402_689,
  /** Cloudflare Workers Static Assets' per-file limit. Every output is checked against it. */
  maxOutputBytes: PUBLICATION_STATIC_ASSET_MAX_BYTES
} as const;
