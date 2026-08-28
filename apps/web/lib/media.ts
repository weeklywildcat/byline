import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { stripHtml } from "@/lib/format";

const DEFAULT_WP_API_URL = "https://cms.weeklywildcat.com/wp-json/wp/v2";
const DEFAULT_SITE_URL = "https://weeklywildcat.com";
const WORDPRESS_MEDIA_PATH_PREFIX = "/wp-content/uploads/";
const WORDPRESS_MEDIA_PUBLIC_ROUTE = "/_wordpress-media";
const WORDPRESS_MEDIA_PUBLIC_DIR = path.join(process.cwd(), "public", WORDPRESS_MEDIA_PUBLIC_ROUTE);
const WORDPRESS_MEDIA_USER_AGENT = "Byline Static Site Builder";
const ABSOLUTE_URL_PATTERN = /https?:\/\/[^\s"'<>),]+/gi;
const downloadPromises = new Map<string, Promise<void>>();
const attachmentUrlPromises = new Map<string, Promise<string[]>>();
const missingMediaWarnings = new Set<string>();

type WordPressMediaResponse = {
  source_url?: string;
  media_details?: {
    sizes?: Record<string, { source_url?: string }>;
  };
};

/**
 * The public image renderers only need this small, serializable slice of a
 * WordPress attachment. Keeping it structural means the helper also works with
 * media returned by a compatible endpoint without coupling this server module
 * to the full WordPress response type.
 */
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
};

export type ResponsiveImageOptions = {
  alt?: string;
  sizes?: string;
  priority?: boolean;
  loading?: "eager" | "lazy";
  fetchPriority?: "high" | "low" | "auto";
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
};

export const DEFAULT_RESPONSIVE_IMAGE_SIZES = "(max-width: 900px) 100vw, 900px";

function positiveInteger(value: unknown) {
  const number = typeof value === "number" ? value : Number(value);

  return Number.isFinite(number) && number > 0 ? Math.round(number) : undefined;
}

/**
 * Build normal HTML image attributes from mirrored WordPress media metadata.
 *
 * The build pipeline mirrors every WordPress media URL before this helper is
 * called, so the helper deliberately preserves each URL exactly as supplied.
 * That keeps srcSet candidates on the same local mirror as src while still
 * allowing the CMS URL fallback when mirroring was unavailable.
 */
export function getResponsiveImageProps(
  image: ResponsiveWordPressMedia | null | undefined,
  options: ResponsiveImageOptions = {}
): ResponsiveImageProps | null {
  if (!image) {
    return null;
  }

  const src = image.source_url?.trim();

  if (!src) {
    return null;
  }

  const candidates = new Map<number, { sourceUrl: string; width: number; height?: number }>();

  for (const size of Object.values(image.media_details?.sizes ?? {})) {
    const sourceUrl = size.source_url?.trim();
    const width = positiveInteger(size.width);

    if (!sourceUrl || !width || candidates.has(width)) {
      continue;
    }

    candidates.set(width, {
      sourceUrl,
      width,
      height: positiveInteger(size.height)
    });
  }

  const intrinsicWidth = positiveInteger(image.media_details?.width);
  const intrinsicHeight = positiveInteger(image.media_details?.height);

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
    alt: options.alt ?? (image.alt_text?.trim() || stripHtml(image.title?.rendered ?? "")),
    loading: options.loading ?? (options.priority ? "eager" : "lazy"),
    decoding: "async",
    fetchPriority: options.fetchPriority ?? (options.priority ? "high" : "auto")
  };
}

function getWordPressApiUrl() {
  return (process.env.NEXT_PUBLIC_WP_API_URL || DEFAULT_WP_API_URL).replace(/\/$/, "");
}

function getWordPressMediaOrigin() {
  return new URL(process.env.NEXT_PUBLIC_WP_API_URL || DEFAULT_WP_API_URL).origin;
}

function getSiteOrigin() {
  return new URL(process.env.NEXT_PUBLIC_SITE_URL || DEFAULT_SITE_URL).origin;
}

function shouldMirrorWordPressMedia() {
  return process.env.WORDPRESS_MEDIA_MIRROR !== "0" && process.env.NODE_ENV !== "development";
}

function normalizeWordPressMediaUrl(value: string) {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    return null;
  }

  const mediaOrigin = getWordPressMediaOrigin();
  const allowedOrigins = new Set([mediaOrigin, getSiteOrigin()]);

  if (!allowedOrigins.has(url.origin) || !url.pathname.startsWith(WORDPRESS_MEDIA_PATH_PREFIX)) {
    return null;
  }

  const originalUrl = new URL(url);

  if (url.origin !== mediaOrigin) {
    url = new URL(`${mediaOrigin}${url.pathname}${url.search}${url.hash}`);
  }

  originalUrl.hash = "";
  originalUrl.search = "";
  url.hash = "";
  url.search = "";

  const downloadUrls = [originalUrl.toString(), url.toString()].filter(
    (downloadUrl, index, urls) => urls.indexOf(downloadUrl) === index
  );

  return {
    cacheUrl: url.toString(),
    downloadUrls
  };
}

function sanitizeFilename(value: string) {
  const fallback = "media";
  let decoded = value || fallback;

  try {
    decoded = decodeURIComponent(decoded);
  } catch {
    decoded = fallback;
  }

  const sanitized = decoded.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || fallback;
  const extension = path.extname(sanitized);
  const basename = path.basename(sanitized, extension);

  if (sanitized.length <= 140) {
    return sanitized;
  }

  return `${basename.slice(0, 120)}${extension}`;
}

function getMirroredMediaPath(url: string) {
  const { pathname } = new URL(url);
  const basename = sanitizeFilename(path.posix.basename(pathname));
  const hash = createHash("sha256").update(url).digest("hex").slice(0, 16);
  const filename = `${hash}-${basename}`;

  return {
    filePath: path.join(WORDPRESS_MEDIA_PUBLIC_DIR, filename),
    publicPath: `${WORDPRESS_MEDIA_PUBLIC_ROUTE}/${filename}`
  };
}

async function hasDownloadedFile(filePath: string) {
  if (!existsSync(filePath)) {
    return false;
  }

  const file = await stat(filePath).catch(() => null);

  return Boolean(file?.isFile() && file.size > 0);
}

async function downloadWordPressMedia(urls: string[], filePath: string) {
  if (await hasDownloadedFile(filePath)) {
    return;
  }

  await mkdir(path.dirname(filePath), { recursive: true });

  const errors: string[] = [];

  for (const url of urls) {
    const response = await fetch(url, {
      headers: {
        "User-Agent": WORDPRESS_MEDIA_USER_AGENT
      }
    });

    if (!response.ok) {
      errors.push(`${response.status} ${response.statusText} (${url})`);
      continue;
    }

    // WordPress serves a themed HTML "not found" page with HTTP 200 for a missing
    // upload, so response.ok alone is not proof that an image came back. Without
    // this check the error page is written to disk under the image's filename and
    // ships to the static export as a silently corrupt asset.
    const contentType = response.headers.get("content-type") || "";

    if (!contentType.startsWith("image/")) {
      errors.push(`unexpected content-type "${contentType || "unknown"}" (${url})`);
      continue;
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const tempFilePath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;

    await writeFile(tempFilePath, buffer);
    await rename(tempFilePath, filePath);
    return;
  }

  throw new Error(`WordPress media download failed: ${errors.join("; ")}`);
}

async function getAttachmentMediaUrls(attachmentId: string) {
  let request = attachmentUrlPromises.get(attachmentId);

  if (!request) {
    request = fetch(`${getWordPressApiUrl()}/media/${attachmentId}`, {
      headers: {
        Accept: "application/json",
        "User-Agent": WORDPRESS_MEDIA_USER_AGENT
      },
      cache: process.env.NODE_ENV === "development" ? "no-store" : "force-cache"
    }).then(async (response) => {
      if (!response.ok) {
        return [];
      }

      const media = (await response.json()) as WordPressMediaResponse;
      const sizeUrls = Object.values(media.media_details?.sizes ?? {})
        .map((size) => size.source_url)
        .filter((url): url is string => Boolean(url));

      return [...sizeUrls, media.source_url]
        .filter((url): url is string => Boolean(url))
        .filter((url) => Boolean(normalizeWordPressMediaUrl(url)));
    });
    attachmentUrlPromises.set(attachmentId, request);
  }

  return request;
}

async function mirrorAttachmentMediaUrl(value: string, attachmentId: string, originalError: unknown): Promise<string> {
  const attachmentUrls = await getAttachmentMediaUrls(attachmentId);

  for (const attachmentUrl of attachmentUrls) {
    if (attachmentUrl === value) {
      continue;
    }

    try {
      return await mirrorWordPressMediaUrl(attachmentUrl);
    } catch {
      continue;
    }
  }

  throw originalError;
}

function warnMissingWordPressMedia(value: string, fallbackUrl: string, error: unknown) {
  if (missingMediaWarnings.has(value)) {
    return;
  }

  missingMediaWarnings.add(value);
  console.warn(
    `WordPress media could not be mirrored and will use the CMS URL instead: ${fallbackUrl}`,
    error instanceof Error ? error.message : error
  );
}

export async function mirrorWordPressMediaUrl(value: string, attachmentId?: string): Promise<string> {
  const media = normalizeWordPressMediaUrl(value);

  if (!media || !shouldMirrorWordPressMedia()) {
    return value;
  }

  const mirrored = getMirroredMediaPath(media.cacheUrl);
  let download = downloadPromises.get(media.cacheUrl);

  if (!download) {
    download = downloadWordPressMedia(media.downloadUrls, mirrored.filePath);
    downloadPromises.set(media.cacheUrl, download);
  }

  try {
    await download;
  } catch (error) {
    if (attachmentId) {
      try {
        return await mirrorAttachmentMediaUrl(value, attachmentId, error);
      } catch (attachmentError) {
        warnMissingWordPressMedia(value, media.cacheUrl, attachmentError);

        return media.cacheUrl;
      }
    }

    warnMissingWordPressMedia(value, media.cacheUrl, error);

    return media.cacheUrl;
  }

  return mirrored.publicPath;
}

function getAttachmentIdForUrlMatch(value: string, index: number) {
  const tagStart = value.lastIndexOf("<img", index);
  const tagEnd = value.indexOf(">", index);

  if (tagStart === -1 || tagEnd === -1 || tagEnd < index) {
    return undefined;
  }

  const tag = value.slice(tagStart, tagEnd + 1);
  const match = tag.match(/\bwp-image-(\d+)\b/);

  return match?.[1];
}

async function rewriteWordPressMediaString(value: string) {
  const matches = [...value.matchAll(ABSOLUTE_URL_PATTERN)];

  if (matches.length === 0) {
    return value;
  }

  let rewritten = value;
  const replacements = new Map<string, string>();

  for (const match of matches) {
    const url = match[0];

    if (replacements.has(url)) {
      continue;
    }

    const replacement = await mirrorWordPressMediaUrl(url, getAttachmentIdForUrlMatch(value, match.index ?? 0));

    replacements.set(url, replacement);
  }

  for (const [url, replacement] of replacements) {
    if (replacement !== url) {
      rewritten = rewritten.split(url).join(replacement);
    }
  }

  return rewritten;
}

export async function mirrorWordPressMediaInValue<T>(value: T): Promise<T> {
  if (!shouldMirrorWordPressMedia()) {
    return value;
  }

  if (typeof value === "string") {
    return (await rewriteWordPressMediaString(value)) as T;
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  if (Array.isArray(value)) {
    return (await Promise.all(value.map((item) => mirrorWordPressMediaInValue(item)))) as T;
  }

  const entries = await Promise.all(
    Object.entries(value).map(async ([key, entryValue]) => [key, await mirrorWordPressMediaInValue(entryValue)] as const)
  );

  return Object.fromEntries(entries) as T;
}
