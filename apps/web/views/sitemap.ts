import { optionalBuildData, requireBuildData } from "@/lib/build-data";
import type { SitemapEntry } from "@/lib/metadata";
import { filterVisibleContentPosts } from "@/lib/content";
import { PUBLIC_SECTIONS } from "@/lib/sections";
import { absoluteUrl } from "@/lib/seo";
import { getPublicationConfig } from "@/lib/publication";
import {
  getAllAuthors,
  getAllPages,
  getAllPosts,
  getAllPublicContributors,
  getAllPublicCoverages,
  getCoverageHref,
  getPostHref,
  type WordPressPost
} from "@/lib/wordpress";

function parseSitemapDate(value: string | undefined) {
  if (!value || value.startsWith("0000-00-00")) {
    return undefined;
  }

  const hasTimezone = /(?:z|[+-]\d{2}:?\d{2})$/i.test(value);
  const date = new Date(hasTimezone ? value : `${value}Z`);

  return Number.isFinite(date.getTime()) ? date : undefined;
}

function getPostSitemapDate(post: Pick<WordPressPost, "modified" | "modified_gmt">) {
  return parseSitemapDate(post.modified_gmt) ?? parseSitemapDate(post.modified);
}

function getPageSitemapDate(page: { modified?: string; modified_gmt?: string }) {
  return parseSitemapDate(page.modified_gmt) ?? parseSitemapDate(page.modified);
}

export default async function sitemap(): Promise<SitemapEntry[]> {
  const publication = getPublicationConfig();
  const [allPosts, authors, wordpressPages, coverages] = await Promise.all([
    requireBuildData("/wp-json/wp/v2/posts", getAllPosts),
    requireBuildData("/wp-json/wp/v2/users", getAllAuthors),
    requireBuildData("/wp-json/wp/v2/pages", getAllPages),
    optionalBuildData("/wp-json/byline/v1/coverage", getAllPublicCoverages, [])
  ]);
  const publicContributors = await optionalBuildData(
    "/wp-json/byline/v1/contributors",
    getAllPublicContributors,
    authors
  );
  const posts = filterVisibleContentPosts(allPosts);
  const latestModifiedPost = posts.reduce<(typeof posts)[number] | undefined>((latestPost, post) => {
    if (!latestPost) {
      return post;
    }

    const postModified = getPostSitemapDate(post)?.getTime() ?? 0;
    const latestModified = getPostSitemapDate(latestPost)?.getTime() ?? 0;

    return postModified > latestModified ? post : latestPost;
  }, undefined);
  const latestModified = latestModifiedPost ? getPostSitemapDate(latestModifiedPost) : undefined;

  const applicationPages: SitemapEntry[] = [
    {
      url: absoluteUrl("/"),
      lastModified: latestModified,
      changeFrequency: "daily" as const,
      priority: 1
    },
    ...PUBLIC_SECTIONS.filter((section) => section.slug !== "sports" || publication.features.sports).map((section) => ({
      url: absoluteUrl((section.slug === "sports" ? "/category/sports/" : section.href)),
      lastModified: latestModified,
      changeFrequency: "daily" as const,
      priority: 0.7
    })),
    {
      url: absoluteUrl("/authors/"),
      lastModified: latestModified,
      changeFrequency: "weekly" as const,
      priority: 0.6
    },
    {
      url: absoluteUrl("/stories/"),
      lastModified: latestModified,
      changeFrequency: "daily" as const,
      priority: 0.7
    },
    {
      url: absoluteUrl("/corrections/"),
      lastModified: latestModified,
      changeFrequency: "weekly" as const,
      priority: 0.5
    },
    {
      url: absoluteUrl("/media-kit/"),
      lastModified: latestModified,
      changeFrequency: "monthly" as const,
      priority: 0.5
    },
    {
      url: absoluteUrl("/open-source/"),
      lastModified: latestModified,
      changeFrequency: "monthly" as const,
      priority: 0.4
    },
  ];

  const applicationUrls = new Set(applicationPages.map((page) => page.url));
  const authoredPages: SitemapEntry[] = wordpressPages
    .map((page) => ({
      url: absoluteUrl(`/${page.slug}/`),
      lastModified: getPageSitemapDate(page),
      changeFrequency: "monthly" as const,
      priority: 0.5
    }))
    .filter((page) => !applicationUrls.has(page.url));

  const articlePages: SitemapEntry[] = posts.map((post) => ({
    url: absoluteUrl(getPostHref(post)),
    lastModified: getPostSitemapDate(post),
    changeFrequency: "weekly" as const,
    priority: 0.8
  }));

  const authorPages: SitemapEntry[] = publicContributors.map((contributor) => ({
    url: absoluteUrl(`/author/${contributor.slug}/`),
    lastModified: latestModified,
    changeFrequency: "weekly" as const,
    priority: 0.6
  }));

  const coveragePages: SitemapEntry[] = coverages.map((coverage) => ({
    url: absoluteUrl(getCoverageHref(coverage)),
    lastModified: parseSitemapDate(coverage.modified),
    changeFrequency: "weekly" as const,
    priority: 0.6
  }));

  return [...applicationPages, ...authoredPages, ...articlePages, ...authorPages, ...coveragePages];
}
