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
} from "@/lib/public-content";

export default async function sitemap(): Promise<SitemapEntry[]> {
  const publication = getPublicationConfig();
  const [allPosts, authors, categories, archivePages, coverages] = await Promise.all([
    requireBuildData("public snapshot: posts", getAllPosts),
    requireBuildData("public snapshot: users", getAllAuthors),
    requireBuildData("public snapshot: categories", getAllCategories),
    requireBuildData("public snapshot: pages", getAllPages),
    optionalBuildData("public snapshot: coverage", getAllPublicCoverages, [])
  ]);
  const contributors = await optionalBuildData("public snapshot: contributors", getAllPublicContributors, authors);

  return buildSitemapEntries({
    siteUrl: getSiteUrl(),
    timeZone: publication.timezone,
    posts: filterVisibleContentPosts(allPosts),
    categories: categories.filter((category) => !isHiddenCategory(category)),
    sectionSlugs: PUBLIC_SECTIONS.map((section) => section.slug),
    pages: archivePages,
    contributors,
    coverages,
    features: { sports: publication.features.sports }
  });
}
