import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_WP_API_URL = "https://cms.weeklywildcat.com/wp-json/wp/v2";
const DEFAULT_SITE_URL = "https://weeklywildcat.com";
const WORDPRESS_MEDIA_PATH_PREFIX = "/wp-content/uploads/";
const WORDPRESS_MEDIA_PUBLIC_ROUTE = "/_wordpress-media";
const WORDPRESS_MEDIA_PUBLIC_DIR = path.join(process.cwd(), "public", WORDPRESS_MEDIA_PUBLIC_ROUTE);
const WORDPRESS_MEDIA_USER_AGENT = "Weekly Wildcat Static Site Builder (https://weeklywildcat.com)";
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
