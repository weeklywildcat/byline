import { optionalBuildData, requireBuildData } from "@/lib/build-data";
import type { SitemapEntry } from "@/lib/metadata";
import { filterVisibleContentPosts, isHiddenCategory } from "@/lib/content";
import { PUBLIC_SECTIONS } from "@/lib/sections";
import { getPublicationConfig } from "@/lib/publication";
import { buildSitemapEntries } from "@/lib/sitemap";
import {
  getAllAuthors,
  getAllCategories,
  getAllPages,
  getAllPosts,
  getAllPublicContributors,
  getAllPublicCoverages,
  getSiteUrl
} from "@/lib/wordpress";

export default async function sitemap(): Promise<SitemapEntry[]> {
  const publication = getPublicationConfig();
  const [allPosts, authors, categories, wordpressPages, coverages] = await Promise.all([
    requireBuildData("/wp-json/wp/v2/posts", getAllPosts),
    requireBuildData("/wp-json/wp/v2/users", getAllAuthors),
    requireBuildData("/wp-json/wp/v2/categories", getAllCategories),
    requireBuildData("/wp-json/wp/v2/pages", getAllPages),
    optionalBuildData("/wp-json/byline/v1/coverage", getAllPublicCoverages, [])
  ]);
  const contributors = await optionalBuildData("/wp-json/byline/v1/contributors", getAllPublicContributors, authors);

  return buildSitemapEntries({
    siteUrl: getSiteUrl(),
    timeZone: publication.timezone,
    posts: filterVisibleContentPosts(allPosts),
    categories: categories.filter((category) => !isHiddenCategory(category)),
    sectionSlugs: PUBLIC_SECTIONS.map((section) => section.slug),
    pages: wordpressPages,
    contributors,
    coverages,
    features: { sports: publication.features.sports }
  });
}
