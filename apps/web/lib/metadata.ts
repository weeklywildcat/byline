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

function addSocialImageTags(
  tags: SerializedMetadataTag[],
  prefix: "og" | "twitter",
  image: SocialImage | undefined
) {
  const normalized = typeof image === "string" ? { url: image } : image;
  const url = cleanMetadataValue(normalized?.url);

  if (!url) {
    return;
  }

  const kind = prefix === "og" ? "property" : "name";
  addMetadataTag(tags, kind, prefix + ":image", url);

  if (prefix === "og") {
    if (typeof normalized?.width === "number" && Number.isFinite(normalized.width) && normalized.width > 0) {
      addMetadataTag(tags, "property", "og:image:width", normalized.width);
    }

    if (typeof normalized?.height === "number" && Number.isFinite(normalized.height) && normalized.height > 0) {
      addMetadataTag(tags, "property", "og:image:height", normalized.height);
    }
  }

  addMetadataTag(tags, kind, prefix + ":image:alt", normalized?.alt);
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
  openGraph?.images?.forEach((image) => addSocialImageTags(tags, "og", image));

  const twitter = metadata.twitter;
  addMetadataTag(tags, "name", "twitter:card", twitter?.card);
  addMetadataTag(tags, "name", "twitter:title", twitter?.title);
  addMetadataTag(tags, "name", "twitter:description", twitter?.description);
  twitter?.images?.forEach((image) => addSocialImageTags(tags, "twitter", image));

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
