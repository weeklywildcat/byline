import { getPrimaryVisibleCategory } from "@/lib/content";
import { decodeHtml, stripHtml } from "@/lib/format";
import {
  getFeaturedMedia,
  getAuthorHref,
  getPostAuthor,
  getPostHref,
  getSiteUrl,
  type WordPressPost
} from "@/lib/wordpress";

export const SITE_NAME = "Weekly Wildcat";
export const ORGANIZATION_LOGO_PATH = "/OrganizationLogo.png";

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

export function getPublisherSchema() {
  return {
    "@type": "Organization",
    name: SITE_NAME,
    url: getSiteUrl(),
    logo: {
      "@type": "ImageObject",
      url: absoluteUrl(ORGANIZATION_LOGO_PATH),
      width: 2048,
      height: 2048
    }
  };
}

export function getOrganizationSchema() {
  return {
    "@context": "https://schema.org",
    ...getPublisherSchema()
  };
}

export function getNewsArticleSchema(post: WordPressPost) {
  const author = getPostAuthor(post);
  const category = getPrimaryVisibleCategory(post);
  const image = getFeaturedMedia(post);
  const articleUrl = absoluteUrl(getPostHref(post));
  const headline = stripHtml(post.title.rendered);
  const description = stripHtml(post.excerpt.rendered || post.content.rendered);
  const articleBody = stripHtml(post.content.rendered);

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
    image: image?.source_url ? [image.source_url] : undefined,
    isAccessibleForFree: true,
    articleBody: articleBody || undefined
  };
}
