import { MEDIA_CACHE_VERSION } from "./versions";
import { stableDigest } from "./digests";

export type MediaManifestItem = {
  sourceUrl: string;
  localPath: string;
  sourceDigest: string;
  transformVersion: number;
};

export type MediaManifest = { version: number; items: Record<string, MediaManifestItem> };

function safeBasename(sourceUrl: string) {
  const basename = decodeURIComponent(new URL(sourceUrl).pathname.split("/").pop() || "media")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "media";
  const extensionIndex = basename.lastIndexOf(".");
  const extension = extensionIndex > 0 ? basename.slice(extensionIndex) : "";
  const stem = extensionIndex > 0 ? basename.slice(0, extensionIndex) : basename;
  return `${stem.slice(0, 120)}${extension}`;
}
export function deterministicMediaPath(sourceUrl: string, transformVersion = MEDIA_CACHE_VERSION) {
  const digest = stableDigest([sourceUrl, transformVersion]);
  return `/_wordpress-media/${digest}-${safeBasename(sourceUrl)}`;
}

export function createMediaManifest(sourceUrls: Iterable<string>, transformVersion = MEDIA_CACHE_VERSION): MediaManifest {
  const items: Record<string, MediaManifestItem> = {};
  for (const sourceUrl of [...new Set(sourceUrls)].sort()) {
    items[sourceUrl] = {
      sourceUrl,
      localPath: deterministicMediaPath(sourceUrl, transformVersion),
      sourceDigest: stableDigest(sourceUrl),
      transformVersion
    };
  }
  return { version: transformVersion, items };
}
