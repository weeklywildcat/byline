import type { Metadata } from "@/lib/metadata";
import { getPrimaryVisibleCategory } from "@/lib/content";
import { getWordPressIsoTimestamp } from "@/lib/dates";
import { decodeHtml, stripHtml } from "@/lib/format";
import { getMeaningfulImageAlt } from "@/lib/image-alt";
import { getPublicationConfig } from "@/lib/publication";
import {
  getFeaturedMedia,
  getContributorDescription,
  contributorHasProfilePage,
  getContributorHref,
  getContributorName,
  getContributorRole,
  getContributorSocialLinks,
  getPostContributors,
  getPostHref,
  getSiteUrl,
  type WordPressMedia,
  type WordPressPost
} from "@/lib/wordpress";

const publication = getPublicationConfig();

export const SITE_NAME = publication.identity.name;
export const SITE_DESCRIPTION = publication.seo.defaultDescription;
export const ORGANIZATION_LOGO_PATH = publication.branding.organizationLogo.url;
export const ORGANIZATION_LOGO_WIDTH = publication.branding.organizationLogo.width;
export const ORGANIZATION_LOGO_HEIGHT = publication.branding.organizationLogo.height;
export const DEFAULT_SOCIAL_IMAGE_PATH = publication.branding.defaultSocialImage.url;
export const DEFAULT_SOCIAL_IMAGE_WIDTH = publication.branding.defaultSocialImage.width;
export const DEFAULT_SOCIAL_IMAGE_HEIGHT = publication.branding.defaultSocialImage.height;
export const DEFAULT_IMAGE_LICENSE_PATH = publication.licensing.imageLicenseUrl;
export const DEFAULT_IMAGE_COPYRIGHT_NOTICE = publication.licensing.copyrightNotice;
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
  /** Use the title as written instead of appending " | Weekly Wildcat" (the homepage). */
  absoluteTitle?: boolean;
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

/** Resolve a site path (or protocol-relative URL) against the public origin; absolute URLs pass through untouched. */
export function absoluteUrl(path: string) {
  const siteUrl = getSiteUrl();

  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  if (path.startsWith("//")) {
    return `https:${path}`;
  }

  return `${siteUrl}${path.startsWith("/") ? path : `/${path}`}`;
}

export function serializeJsonLd(data: unknown) {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

/**
 * The homepage title says what the publication is, not just its name. A
 * title configured in the CMS (anything other than the bare name) wins;
 * otherwise it is built from the publication's own identity.
 */
export function getHomepageTitle() {
  const { defaultTitle } = publication.seo;
  const { shortName, tagline, organizationName } = publication.identity;

  if (defaultTitle && defaultTitle !== shortName) {
    return defaultTitle;
  }

  // "Weekly Wildcat, Ninety Six High School's Official Student Newspaper"
  if (tagline) {
    return `${shortName}, ${tagline}`;
  }

  return organizationName ? `${shortName}, the student newspaper of ${organizationName}` : defaultTitle || shortName;
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

  return getMeaningfulImageAlt(image) || undefined;
}

/**
 * Social crawlers fetch these URLs from outside the site, so they must be
 * absolute. Mirrored WordPress media is stored as /_wordpress-media/... and is
 * resolved against the public origin here; URLs that are already absolute
 * (including the CMS fallback when mirroring failed) are left alone.
 */
export function buildSocialImageMetadata(image?: SeoImage | null) {
  const imageUrl = getImageUrl(image)?.trim();

  if (image && imageUrl) {
    return [
      {
        url: absoluteUrl(imageUrl),
        width: getImageWidth(image) || undefined,
        height: getImageHeight(image) || undefined,
        alt: getMediaAlt(image)
      }
    ];
  }

  return [
    {
      url: absoluteUrl(DEFAULT_SOCIAL_IMAGE_PATH),
      width: DEFAULT_SOCIAL_IMAGE_WIDTH ?? undefined,
      height: DEFAULT_SOCIAL_IMAGE_HEIGHT ?? undefined,
      alt: publication.branding.defaultSocialImage.alt || SITE_NAME
    }
  ];
}

export function buildPageMetadata({
  title,
  absoluteTitle = false,
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
    title: absoluteTitle ? { absolute: title } : title,
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
      locale: publication.locale.replace(/-/g, "_"),
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

const ORGANIZATION_TYPE = "NewsMediaOrganization";

export function getOrganizationId() {
  return `${getSiteUrl()}/#organization`;
}

export function getWebsiteId() {
  return `${getSiteUrl()}/#website`;
}

function getOrganizationLogoSchema() {
  return {
    "@type": "ImageObject",
    url: absoluteUrl(ORGANIZATION_LOGO_PATH),
    width: ORGANIZATION_LOGO_WIDTH ?? undefined,
    height: ORGANIZATION_LOGO_HEIGHT ?? undefined
  };
}

/**
 * The compact form of the publication entity used inside other nodes (an
 * article's publisher). It carries the same @id as the full entity on the
 * homepage, so every page points at one logical organization, while still
 * including the name and logo that Google reads from a single page.
 */
export function getPublisherSchema() {
  return {
    "@type": ORGANIZATION_TYPE,
    "@id": getOrganizationId(),
    name: SITE_NAME,
    url: `${getSiteUrl()}/`,
    logo: getOrganizationLogoSchema()
  };
}

function getPostalAddress() {
  const { address, city, region, country } = publication.location;

  if (!address && !city) {
    return undefined;
  }

  // The configured address is one line ("640 South Cambridge Street, Ninety Six, SC").
  const cityIndex = city ? address.toLowerCase().indexOf(`, ${city.toLowerCase()}`) : -1;
  const streetAddress = cityIndex > 0 ? address.slice(0, cityIndex).trim() : undefined;

  return {
    "@type": "PostalAddress",
    streetAddress,
    addressLocality: city || undefined,
    addressRegion: region || undefined,
    addressCountry: country || undefined
  };
}

/** The full publication entity. Emitted once, on the homepage. */
export function getOrganizationSchema() {
  const sameAs = publication.social.map((profile) => profile.url.trim()).filter((url) => /^https:\/\//i.test(url));
  const parentName = publication.identity.organizationName.trim();

  return {
    "@context": "https://schema.org",
    ...getPublisherSchema(),
    description: publication.identity.description || SITE_DESCRIPTION,
    address: getPostalAddress(),
    sameAs: sameAs.length > 0 ? sameAs : undefined,
    contactPoint: publication.urls.contact
      ? {
          "@type": "ContactPoint",
          contactType: "editorial",
          url: absoluteUrl(publication.urls.contact)
        }
      : undefined,
    parentOrganization: parentName && parentName !== SITE_NAME
      ? { "@type": "Organization", name: parentName }
      : undefined,
    correctionsPolicy: absoluteUrl("/corrections/")
  };
}

export function getWebsiteSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": getWebsiteId(),
    name: SITE_NAME,
    url: `${getSiteUrl()}/`,
    inLanguage: publication.locale,
    publisher: { "@id": getOrganizationId() }
  };
}

export function getBreadcrumbSchema(items: BreadcrumbItem[]) {
  const breadcrumbItems = items
    .map((item) => ({
      name: item.name.trim(),
      path: item.path
    }))
    .filter((item) => item.name && item.path);

  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    name: "Breadcrumbs",
    itemListElement: breadcrumbItems.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: {
        "@type": "WebPage",
        "@id": absoluteUrl(item.path),
        name: item.name
      }
    }))
  };
}

// Google asks for article images in several aspect ratios, each at least 50K pixels.
const GOOGLE_IMAGE_RATIOS = [16 / 9, 4 / 3, 1];
const GOOGLE_IMAGE_RATIO_TOLERANCE = 0.02;
const GOOGLE_IMAGE_MIN_PIXELS = 50_000;

type ImageCandidate = { url: string; width: number; height: number };

/**
 * The original plus the largest registered WordPress size in each of Google's
 * preferred ratios (16:9, 4:3, 1:1) that the upload already has. WordPress sizes
 * keep the photo's own proportions, so a 16:9 photo yields 16:9 variants, a 4:3
 * photo 4:3 variants, and so on. No crops are generated here.
 */
export function getArticleImageCandidates(image: WordPressMedia): ImageCandidate[] {
  const original: ImageCandidate | null = image.source_url && image.media_details?.width && image.media_details?.height
    ? { url: image.source_url, width: image.media_details.width, height: image.media_details.height }
    : null;
  const sized = Object.values(image.media_details?.sizes ?? {})
    .filter((size) => size.source_url && size.width > 0 && size.height > 0)
    .map((size) => ({ url: size.source_url, width: size.width, height: size.height }));
  const best = new Map<number, ImageCandidate>();

  for (const candidate of [...(original ? [original] : []), ...sized]) {
    if (candidate.width * candidate.height < GOOGLE_IMAGE_MIN_PIXELS) continue;
    const ratio = GOOGLE_IMAGE_RATIOS.find((target) => Math.abs(candidate.width / candidate.height - target) / target <= GOOGLE_IMAGE_RATIO_TOLERANCE);
    if (ratio === undefined) continue;
    const current = best.get(ratio);
    if (!current || candidate.width > current.width) best.set(ratio, candidate);
  }

  // The original always leads, whatever its ratio.
  const candidates = original ? [original] : [];
  for (const candidate of best.values()) {
    if (!candidates.some((existing) => existing.url === candidate.url)) candidates.push(candidate);
  }

  return candidates.length > 0 ? candidates : [{ url: image.source_url, width: 0, height: 0 }];
}

function getArticleImageSchema(image: WordPressMedia | null) {
  if (!image?.source_url) {
    return [
      {
        "@type": "ImageObject",
        contentUrl: absoluteUrl(DEFAULT_SOCIAL_IMAGE_PATH),
        url: absoluteUrl(DEFAULT_SOCIAL_IMAGE_PATH),
        width: DEFAULT_SOCIAL_IMAGE_WIDTH ?? undefined,
        height: DEFAULT_SOCIAL_IMAGE_HEIGHT ?? undefined,
        copyrightNotice: DEFAULT_IMAGE_COPYRIGHT_NOTICE,
        license: absoluteUrl(DEFAULT_IMAGE_LICENSE_PATH),
        acquireLicensePage: absoluteUrl(DEFAULT_IMAGE_LICENSE_PATH)
      }
    ];
  }

  const imageCredit = image.bylineImage ?? image.weeklyWildcatImage;
  const creator = imageCredit?.creator;
  // The file's own EXIF credit and copyright name the camera's owner, who is not
  // always the photographer, so they only stand in when no creator is recorded.
  const copyrightNotice =
    imageCredit?.copyrightNotice ||
    (creator ? "" : stripHtml(image.media_details?.image_meta?.copyright ?? "")) ||
    DEFAULT_IMAGE_COPYRIGHT_NOTICE;
  const creditText =
    imageCredit?.creditText ||
    creator ||
    stripHtml(image.media_details?.image_meta?.credit || image.media_details?.image_meta?.copyright || "");
  const caption = stripHtml(image.caption?.rendered ?? image.media_details?.image_meta?.caption ?? "") || undefined;

  return getArticleImageCandidates(image).map((candidate) => {
    const imageUrl = absoluteUrl(candidate.url);

    return {
      "@type": "ImageObject",
      contentUrl: imageUrl,
      url: imageUrl,
      width: candidate.width || undefined,
      height: candidate.height || undefined,
      caption,
      creator: creator
        ? {
            "@type": "Person",
            name: creator
          }
        : undefined,
      creditText: creditText || undefined,
      copyrightNotice,
      license: imageCredit?.licenseUrl || absoluteUrl(DEFAULT_IMAGE_LICENSE_PATH),
      acquireLicensePage: imageCredit?.acquireLicensePage || absoluteUrl(DEFAULT_IMAGE_LICENSE_PATH)
    };
  });
}

/** Timezone-aware ISO timestamps for a post, for JSON-LD and Open Graph. */
export function getPostTimestamps(post: Pick<WordPressPost, "date" | "date_gmt" | "modified" | "modified_gmt">) {
  const published = getWordPressIsoTimestamp({ gmt: post.date_gmt, local: post.date }, publication.timezone);
  const modified = getWordPressIsoTimestamp({ gmt: post.modified_gmt, local: post.modified }, publication.timezone);

  return { published, modified: modified ?? published };
}

/** Canonical profile URLs for the contributors who have a public profile page. One-off guests have none. */
export function getArticleAuthorProfileUrls(post: WordPressPost) {
  return getPostContributors(post)
    .filter(contributorHasProfilePage)
    .map((contributor) => absoluteUrl(getContributorHref(contributor)));
}

export function getNewsArticleSchema(post: WordPressPost) {
  const contributors = getPostContributors(post);
  const category = getPrimaryVisibleCategory(post);
  const image = getFeaturedMedia(post);
  const articleUrl = absoluteUrl(getPostHref(post));
  const headline = stripHtml(post.title.rendered);
  const description = getSeoDescription(post.excerpt.rendered || post.content.rendered);
  const articleBody = stripHtml(post.content.rendered);
  const timestamps = getPostTimestamps(post);
  const keywords = post._embedded?.["wp:term"]
    ?.flat()
    .filter((term): term is { name: string; taxonomy: string } => "name" in term && term.taxonomy === "post_tag")
    .map((tag) => decodeHtml(tag.name));
  const authorEntities = contributors.map((contributor) => {
    const socialLinks = getContributorSocialLinks(contributor)
      .map((link) => link.href.trim())
      .filter((href) => !href.toLowerCase().startsWith("mailto:") && (/^https?:\/\//i.test(href) || (href.startsWith("/") && !href.startsWith("//"))))
      .map((href) => absoluteUrl(href));

    return {
      "@type": "Person",
      name: decodeHtml(getContributorName(contributor)),
      url: contributorHasProfilePage(contributor) ? absoluteUrl(getContributorHref(contributor)) : undefined,
      jobTitle: getContributorRole(contributor) || undefined,
      description: getContributorDescription(contributor) || undefined,
      sameAs: socialLinks.length > 0 ? socialLinks : undefined
    };
  });
  const authors = authorEntities.length > 0
    ? authorEntities
    : [{
        "@type": "Person",
        name: `${publication.identity.shortName} Staff`
      }];

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
    datePublished: timestamps.published,
    dateModified: timestamps.modified,
    author: authors.length === 1 ? authors[0] : authors,
    publisher: getPublisherSchema(),
    articleSection: category ? decodeHtml(category.name) : undefined,
    keywords: keywords?.length ? keywords.join(", ") : undefined,
    image: getArticleImageSchema(image),
    isAccessibleForFree: true,
    articleBody: articleBody || undefined
  };
}
