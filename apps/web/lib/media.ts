import { getMeaningfulImageAlt } from "@/lib/image-alt";
import { artDirectedSource, hasCustomFocalPoint, normalizeArtDirection, objectPosition, type ImageCropShape } from "@byline/core";

export type ResponsiveWordPressMedia = {
  source_url?: string;
  alt_text?: string;
  title?: {
    rendered?: string;
  };
  media_details?: {
    width?: number;
    height?: number;
    sizes?: Record<
      string,
      {
        source_url?: string;
        width?: number;
        height?: number;
      }
    >;
  };
  bylineImage?: { artDirection?: unknown };
  weeklyWildcatImage?: { artDirection?: unknown };
};

export type ImageSearchVisibility = "canonical" | "presentation";

export type ResponsiveImageOptions = {
  alt?: string;
  sizes?: string;
  priority?: boolean;
  loading?: "eager" | "lazy";
  fetchPriority?: "high" | "low" | "auto";
  /** Presentation-only copies stay visible in the UI without becoming canonical image-search URLs. */
  imageSearchVisibility?: ImageSearchVisibility;
  /**
   * The crop shape this placement shows. When an editor drew a crop for it, the
   * generated files replace the photo; otherwise the focal point positions it.
   */
  shape?: ImageCropShape;
};

export type ResponsiveImageProps = {
  src: string;
  srcSet?: string;
  sizes: string;
  width?: number;
  height?: number;
  alt: string;
  loading: "eager" | "lazy";
  decoding: "async";
  fetchPriority: "high" | "low" | "auto";
  /** CSS object-position from the editor's focal point; absent when centred or cropped. */
  objectPosition?: string;
};

// Candidates whose shape differs from the photo by more than this are hard crops
// (WordPress's 150×150 thumbnail, theme crops) and must never join a srcset.
const SRCSET_RATIO_TOLERANCE = 0.02;

export const DEFAULT_RESPONSIVE_IMAGE_SIZES = "(max-width: 900px) 100vw, 900px";

function positiveInteger(value: unknown) {
  const number = typeof value === "number" ? value : Number(value);

  return Number.isFinite(number) && number > 0 ? Math.round(number) : undefined;
}

/**
 * The files an editor cropped for `shape`, or null when that shape is shown by
 * positioning the normal photo at its focal point.
 */
export function getCroppedImageSource(
  image: ResponsiveWordPressMedia | null | undefined,
  shape: ImageCropShape,
  _imageSearchVisibility: ImageSearchVisibility = "canonical"
) {
  const art = normalizeArtDirection(image?.bylineImage?.artDirection ?? image?.weeklyWildcatImage?.artDirection);
  const source = artDirectedSource(art, shape);
  if (!source) return null;
  return {
    src: source.src,
    srcSet: art!.renditions[shape]!.map((file) => `${file.url} ${file.width}w`).join(", "),
    width: source.width,
    height: source.height
  };
}

/** Build responsive image attributes from the prepared media view. */
export function getResponsiveImageProps(
  image: ResponsiveWordPressMedia | null | undefined,
  options: ResponsiveImageOptions = {}
): ResponsiveImageProps | null {
  if (!image) {
    return null;
  }

  const canonicalSrc = image.source_url?.trim();
  const imageSearchVisibility = options.imageSearchVisibility ?? "canonical";
  const src = canonicalSrc;

  if (!src) {
    return null;
  }

  const alt = options.alt ?? getMeaningfulImageAlt(image);
  const loading = options.loading ?? (options.priority ? "eager" : "lazy");
  const fetchPriority = options.fetchPriority ?? (options.priority ? "high" : "auto");
  const art = normalizeArtDirection(image.bylineImage?.artDirection ?? image.weeklyWildcatImage?.artDirection);
  const cropped = options.shape ? getCroppedImageSource(image, options.shape, imageSearchVisibility) : null;

  if (cropped) {
    return {
      src: cropped.src,
      srcSet: cropped.srcSet,
      sizes: options.sizes ?? DEFAULT_RESPONSIVE_IMAGE_SIZES,
      width: cropped.width,
      height: cropped.height,
      alt,
      loading,
      decoding: "async",
      fetchPriority
    };
  }

  const candidates = new Map<number, { sourceUrl: string; width: number; height?: number }>();
  const intrinsicWidth = positiveInteger(image.media_details?.width);
  const intrinsicHeight = positiveInteger(image.media_details?.height);
  const intrinsicRatio = intrinsicWidth && intrinsicHeight ? intrinsicWidth / intrinsicHeight : null;

  for (const size of Object.values(image.media_details?.sizes ?? {})) {
    const canonicalSourceUrl = size.source_url?.trim();
    const sourceUrl = canonicalSourceUrl;
    const width = positiveInteger(size.width);
    const height = positiveInteger(size.height);

    if (!sourceUrl || !width || candidates.has(width)) {
      continue;
    }

    if (intrinsicRatio && height && Math.abs(width / height / intrinsicRatio - 1) > SRCSET_RATIO_TOLERANCE) {
      continue;
    }

    candidates.set(width, {
      sourceUrl,
      width,
      height: positiveInteger(size.height)
    });
  }

  // The original source is the safest candidate at its intrinsic width. If a
  // `full` size has the same width, prefer this URL so a cropped derivative
  // cannot replace the fallback image at the largest breakpoint.
  if (intrinsicWidth && candidates.size > 0) {
    const intrinsicCandidate = candidates.get(intrinsicWidth);

    candidates.set(intrinsicWidth, {
      sourceUrl: src,
      width: intrinsicWidth,
      height: intrinsicHeight ?? intrinsicCandidate?.height
    });
  }

  const sortedCandidates = [...candidates.values()].sort((left, right) => left.width - right.width);
  const largestCandidate = sortedCandidates.at(-1);
  const width = intrinsicWidth ?? largestCandidate?.width;
  const height = intrinsicHeight ?? largestCandidate?.height;

  return {
    src,
    srcSet:
      sortedCandidates.length > 0
        ? sortedCandidates.map((candidate) => `${candidate.sourceUrl} ${candidate.width}w`).join(", ")
        : undefined,
    sizes: options.sizes ?? DEFAULT_RESPONSIVE_IMAGE_SIZES,
    width,
    height,
    alt,
    loading,
    decoding: "async",
    fetchPriority,
    ...(art && hasCustomFocalPoint(art) ? { objectPosition: objectPosition(art.focalPoint) } : {})
  };
}
