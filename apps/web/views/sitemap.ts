import { optionalBuildData, requireBuildData } from "@/lib/build-data";
import type { SitemapEntry } from "@/lib/metadata";
import { filterVisibleContentPosts, isHiddenCategory } from "@/lib/content";
import { PUBLIC_SECTIONS } from "@/lib/sections";
import { getPublicationConfig } from "@/lib/publication";
import { buildSitemapEntries } from "@/lib/sitemap";
import { publicDataProjects } from "@/lib/public-data";
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

  const entries = buildSitemapEntries({
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
  // Byline Data: indexable projects, dated by their newest release (never a draft or a noindex project).
  const data = publicDataProjects().filter((project) => project.indexing === "public");
  if (!data.length) return entries;
  const latest = (dates: string[]) => new Date(dates.sort().at(-1)!);
  return [
    ...entries,
    { url: `${getSiteUrl()}/data/`, lastModified: latest(data.map((project) => project.dataUpdatedAt)), changeFrequency: "daily", priority: 0.6 },
    ...data.map((project) => ({ url: `${getSiteUrl()}${project.href}`, lastModified: latest([project.dataUpdatedAt, project.modifiedAt]), changeFrequency: "daily" as const, priority: 0.7 }))
  ];
}
