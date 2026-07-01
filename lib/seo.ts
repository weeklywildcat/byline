import type { Metadata } from "next";
import { getPrimaryVisibleCategory } from "@/lib/content";
import { decodeHtml, stripHtml } from "@/lib/format";
import {
  getFeaturedMedia,
  getAuthorHref,
  getPostAuthor,
  getPostHref,
  getSiteUrl,
  type WordPressMedia,
  type WordPressPost
} from "@/lib/wordpress";

export const SITE_NAME = "Weekly Wildcat";
export const SITE_DESCRIPTION = "Student journalism from the Weekly Wildcat newsroom in Ninety Six, South Carolina.";
export const ORGANIZATION_LOGO_PATH = "/organization-logo.png";
export const ORGANIZATION_LOGO_WIDTH = 1024;
export const ORGANIZATION_LOGO_HEIGHT = 1024;
export const DEFAULT_SOCIAL_IMAGE_PATH = "/social-default.png";
export const DEFAULT_SOCIAL_IMAGE_WIDTH = 1200;
export const DEFAULT_SOCIAL_IMAGE_HEIGHT = 630;
export const SEO_ROBOTS_PREVIEW: Metadata["robots"] = {
  googleBot: {
    index: true,
    follow: true,
    "max-snippet": -1,
    "max-image-preview": "large",
    "max-video-preview": -1
  }
};

type BreadcrumbItem = {
  name: string;
  path: string;
};

type PageMetadataOptions = {
  title: string;
  description: string;
  path: string;
  type?: "website" | "article" | "profile";
  image?: SeoImage | null;
  noIndex?: boolean;
};

type BasicSeoImage = {
  url: string;
  width?: number | null;
  height?: number | null;
  alt?: string;
};

type SeoImage = WordPressMedia | BasicSeoImage;

export function absoluteUrl(path: string) {
  const siteUrl = getSiteUrl();

  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  return `${siteUrl}${path.startsWith("/") ? path : `/${path}`}`;
}

export function serializeJsonLd(data: unknown) {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

export function getSeoDescription(value: string, fallback = SITE_DESCRIPTION) {
  const text = stripHtml(value || fallback).replace(/\s+/g, " ").trim();

  if (text.length <= 155) {
    return text;
  }

  const trimmed = text.slice(0, 155);
  const lastSpace = trimmed.lastIndexOf(" ");

  return `${trimmed.slice(0, lastSpace > 0 ? lastSpace : trimmed.length).trim()}...`;
}

function isWordPressMedia(image: SeoImage): image is WordPressMedia {
  return "source_url" in image;
}

function getImageUrl(image: SeoImage | null | undefined) {
  if (!image) {
    return undefined;
  }

  return isWordPressMedia(image) ? image.source_url : image.url;
}

function getImageWidth(image: SeoImage) {
  return isWordPressMedia(image) ? image.media_details?.width : image.width ?? undefined;
}

function getImageHeight(image: SeoImage) {
  return isWordPressMedia(image) ? image.media_details?.height : image.height ?? undefined;
}

function getMediaAlt(image: SeoImage | null | undefined) {
  if (!image) {
    return undefined;
  }

  if (!isWordPressMedia(image)) {
    return image.alt || undefined;
  }

  return image.alt_text || stripHtml(image.title?.rendered ?? "") || undefined;
}

export function buildSocialImageMetadata(image?: SeoImage | null) {
  const imageUrl = getImageUrl(image);

  if (image && imageUrl) {
    return [
      {
        url: imageUrl,
        width: getImageWidth(image),
        height: getImageHeight(image),
        alt: getMediaAlt(image)
      }
    ];
  }

  return [
    {
      url: absoluteUrl(DEFAULT_SOCIAL_IMAGE_PATH),
      width: DEFAULT_SOCIAL_IMAGE_WIDTH,
      height: DEFAULT_SOCIAL_IMAGE_HEIGHT,
      alt: SITE_NAME
    }
  ];
}

export function buildPageMetadata({
  title,
  description,
  path,
  type = "website",
  image,
  noIndex = false
}: PageMetadataOptions): Metadata {
  const trimmedDescription = getSeoDescription(description);
  const url = absoluteUrl(path);
  const images = buildSocialImageMetadata(image);

  return {
    title,
    description: trimmedDescription,
    alternates: {
      canonical: path
    },
    robots: noIndex
      ? {
          index: false,
          follow: true,
          googleBot: {
            index: false,
            follow: true,
            "max-snippet": -1,
            "max-image-preview": "large",
            "max-video-preview": -1
          }
        }
      : SEO_ROBOTS_PREVIEW,
    openGraph: {
      title,
      description: trimmedDescription,
      url,
      siteName: SITE_NAME,
      locale: "en_US",
      type,
      images
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: trimmedDescription,
      images
    }
  };
}

export function getPublisherSchema() {
  return {
    "@type": "Organization",
    name: SITE_NAME,
    url: getSiteUrl(),
    logo: {
      "@type": "ImageObject",
      url: absoluteUrl(ORGANIZATION_LOGO_PATH),
      width: ORGANIZATION_LOGO_WIDTH,
      height: ORGANIZATION_LOGO_HEIGHT
    }
  };
}

export function getOrganizationSchema() {
  return {
    "@context": "https://schema.org",
    ...getPublisherSchema()
  };
}

export function getWebsiteSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    url: getSiteUrl()
  };
}

export function getBreadcrumbSchema(items: BreadcrumbItem[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.path)
    }))
  };
}

function getArticleImageSchema(image: WordPressMedia | null) {
  if (!image?.source_url) {
    return [
      {
        "@type": "ImageObject",
        url: absoluteUrl(DEFAULT_SOCIAL_IMAGE_PATH),
        width: DEFAULT_SOCIAL_IMAGE_WIDTH,
        height: DEFAULT_SOCIAL_IMAGE_HEIGHT
      }
    ];
  }

  return [
    {
      "@type": "ImageObject",
      url: image.source_url,
      width: image.media_details?.width,
      height: image.media_details?.height,
      caption: stripHtml(image.caption?.rendered ?? image.media_details?.image_meta?.caption ?? "") || undefined
    }
  ];
}

export function getNewsArticleSchema(post: WordPressPost) {
  const author = getPostAuthor(post);
  const category = getPrimaryVisibleCategory(post);
  const image = getFeaturedMedia(post);
  const articleUrl = absoluteUrl(getPostHref(post));
  const headline = stripHtml(post.title.rendered);
  const description = getSeoDescription(post.excerpt.rendered || post.content.rendered);
  const articleBody = stripHtml(post.content.rendered);
  const keywords = post._embedded?.["wp:term"]
    ?.flat()
    .filter((term): term is { name: string; taxonomy: string } => "name" in term && term.taxonomy === "post_tag")
    .map((tag) => decodeHtml(tag.name));

  return {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": articleUrl
    },
    headline,
    description,
    url: articleUrl,
    datePublished: post.date,
    dateModified: post.modified,
    author: {
      "@type": "Person",
      name: author?.name ?? "Weekly Wildcat Staff",
      url: author ? absoluteUrl(getAuthorHref(author)) : undefined
    },
    publisher: getPublisherSchema(),
    articleSection: category ? decodeHtml(category.name) : undefined,
    keywords: keywords?.length ? keywords.join(", ") : undefined,
    image: getArticleImageSchema(image),
    isAccessibleForFree: true,
    articleBody: articleBody || undefined
  };
}
