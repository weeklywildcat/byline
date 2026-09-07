export type SocialImage = string | {
  url: string;
  width?: number;
  height?: number;
  alt?: string;
};

export type RobotsPolicy = {
  index?: boolean;
  follow?: boolean;
  "max-snippet"?: number;
  "max-image-preview"?: "none" | "standard" | "large";
  "max-video-preview"?: number;
};

export type Metadata = {
  metadataBase?: URL;
  title?: string | { default: string; template: string };
  description?: string;
  alternates?: { canonical?: string; types?: Record<string, string> };
  robots?: RobotsPolicy & { googleBot?: RobotsPolicy };
  icons?: {
    icon?: Array<{ url: string; sizes?: string; type?: string }>;
    apple?: Array<{ url: string; sizes?: string; type?: string }>;
  };
  openGraph?: {
    title?: string;
    description?: string;
    url?: string;
    siteName?: string;
    locale?: string;
    type?: "website" | "article" | "profile";
    images?: SocialImage[];
    publishedTime?: string;
    modifiedTime?: string;
    authors?: string[];
    section?: string;
    tags?: string[];
  };
  twitter?: {
    card?: "summary" | "summary_large_image";
    title?: string;
    description?: string;
    images?: SocialImage[];
  };
};

export type SerializedMetadataTag = {
  kind: "name" | "property";
  key: string;
  content: string;
};

function cleanMetadataValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value !== "string") return undefined;

  const trimmed = value.trim();
  return trimmed || undefined;
}

function addMetadataTag(
  tags: SerializedMetadataTag[],
  kind: SerializedMetadataTag["kind"],
  key: string,
  value: unknown
) {
  const content = cleanMetadataValue(value);

  if (!content || tags.some((tag) => tag.kind === kind && tag.key === key && tag.content === content)) {
    return;
  }

  tags.push({ kind, key, content });
}

type NormalizedSocialImage = {
  url: string;
  width?: number;
  height?: number;
  alt?: string;
};

function normalizeSocialImage(image: SocialImage | undefined): NormalizedSocialImage | undefined {
  const candidate = typeof image === "string" ? { url: image } : image;
  const url = cleanMetadataValue(candidate?.url);

  if (!url) {
    return undefined;
  }

  const width = typeof candidate?.width === "number" && Number.isFinite(candidate.width) && candidate.width > 0
    ? candidate.width
    : undefined;
  const height = typeof candidate?.height === "number" && Number.isFinite(candidate.height) && candidate.height > 0
    ? candidate.height
    : undefined;
  const alt = cleanMetadataValue(candidate?.alt);

  return {
    url,
    ...(width === undefined ? {} : { width }),
    ...(height === undefined ? {} : { height }),
    ...(alt === undefined ? {} : { alt })
  };
}

function socialImageGroupKey(image: NormalizedSocialImage) {
  return JSON.stringify([image.url, image.width ?? null, image.height ?? null, image.alt ?? null]);
}

function addSocialImageTags(
  tags: SerializedMetadataTag[],
  prefix: "og" | "twitter",
  image: SocialImage | undefined,
  seenGroups: Set<string>
) {
  const normalized = normalizeSocialImage(image);

  if (!normalized) {
    return;
  }

  const groupKey = socialImageGroupKey(normalized);

  if (seenGroups.has(groupKey)) {
    return;
  }

  seenGroups.add(groupKey);

  const kind = prefix === "og" ? "property" : "name";
  tags.push({ kind, key: prefix + ":image", content: normalized.url });

  if (prefix === "og") {
    if (normalized.width !== undefined) {
      tags.push({ kind: "property", key: "og:image:width", content: String(normalized.width) });
    }

    if (normalized.height !== undefined) {
      tags.push({ kind: "property", key: "og:image:height", content: String(normalized.height) });
    }
  }

  if (normalized.alt !== undefined) {
    tags.push({ kind, key: prefix + ":image:alt", content: normalized.alt });
  }
}

/**
 * Convert the supported social/article fields in Metadata into HTML meta tags.
 * Empty values and exact duplicate tags are omitted while repeated, distinct
 * authors/tags remain separate as required by Open Graph article metadata.
 */
export function serializeMetadata(metadata: Metadata): SerializedMetadataTag[] {
  const tags: SerializedMetadataTag[] = [];
  const openGraph = metadata.openGraph;

  addMetadataTag(tags, "property", "og:title", openGraph?.title);
  addMetadataTag(tags, "property", "og:description", openGraph?.description);
  addMetadataTag(tags, "property", "og:url", openGraph?.url);
  addMetadataTag(tags, "property", "og:site_name", openGraph?.siteName);
  addMetadataTag(tags, "property", "og:locale", openGraph?.locale);
  addMetadataTag(tags, "property", "og:type", openGraph?.type);
  addMetadataTag(tags, "property", "article:section", openGraph?.section);
  addMetadataTag(tags, "property", "article:published_time", openGraph?.publishedTime);
  addMetadataTag(tags, "property", "article:modified_time", openGraph?.modifiedTime);
  openGraph?.authors?.forEach((author) => addMetadataTag(tags, "property", "article:author", author));
  openGraph?.tags?.forEach((tag) => addMetadataTag(tags, "property", "article:tag", tag));
  const openGraphImageGroups = new Set<string>();
  openGraph?.images?.forEach((image) => addSocialImageTags(tags, "og", image, openGraphImageGroups));

  const twitter = metadata.twitter;
  addMetadataTag(tags, "name", "twitter:card", twitter?.card);
  addMetadataTag(tags, "name", "twitter:title", twitter?.title);
  addMetadataTag(tags, "name", "twitter:description", twitter?.description);
  const twitterImageGroups = new Set<string>();
  twitter?.images?.forEach((image) => addSocialImageTags(tags, "twitter", image, twitterImageGroups));

  return tags;
}

export type SitemapEntry = {
  url: string;
  lastModified?: string | Date;
  changeFrequency?: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
  priority?: number;
};

export type RobotsDocument = {
  rules: { userAgent: string; allow?: string; disallow?: string } | Array<{ userAgent: string; allow?: string; disallow?: string }>;
  host?: string;
  sitemap?: string | string[];
};
