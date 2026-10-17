import { CODE_ROUTED_PAGE_SLUGS } from "@/lib/code-routes";
import { getWordPressInstant } from "@/lib/dates";
import { getPostSitemapImages } from "@/lib/sitemap-images";
import type { SitemapEntry } from "@/lib/metadata";
import {
  contributorHasProfilePage,
  getContributorHref,
  getCoverageHref,
  getPageIndexing,
  getPostContributors,
  getPostHref,
  getPostRouteParts,
  isGuestContributor,
  type WordPressCategory,
  type WordPressContributor,
  type WordPressCoverage,
  type WordPressPage,
  type WordPressPost
} from "@/lib/wordpress";

export type SitemapInput = {
  /** Public origin without a trailing slash. */
  siteUrl: string;
  timeZone: string;
  /** Only stories that are publicly visible (the caller applies the visibility filter). */
  posts: WordPressPost[];
  categories: WordPressCategory[];
  /** Section slugs in display order; categories outside this list are appended. */
  sectionSlugs: string[];
  pages: WordPressPage[];
  contributors: WordPressContributor[];
  coverages: WordPressCoverage[];
  features: { sports: boolean };
};

/**
 * Pages that exist as routes and belong in search results but are not CMS
 * Pages (or are Pages whose route is owned by the application). Sports
 * redirect sources, search, 404 and internal CMS pages are deliberately absent.
 */
const APPLICATION_PAGES: Array<{ path: string; changeFrequency: SitemapEntry["changeFrequency"]; priority: number }> = [
  { path: "/staff/", changeFrequency: "weekly", priority: 0.6 },
  { path: "/stories/", changeFrequency: "daily", priority: 0.7 },
  { path: "/corrections/", changeFrequency: "weekly", priority: 0.5 },
  { path: "/media-kit/", changeFrequency: "monthly", priority: 0.5 },
  { path: "/open-source/", changeFrequency: "monthly", priority: 0.4 },
  ...CODE_ROUTED_PAGE_SLUGS.map((slug) => ({ path: `/${slug}/`, changeFrequency: "monthly" as const, priority: 0.5 }))
];

function modifiedAt(item: { modified?: string; modified_gmt?: string }, timeZone: string) {
  return getWordPressInstant({ gmt: item.modified_gmt, local: item.modified }, timeZone) ?? undefined;
}

function latest(dates: Array<Date | undefined>) {
  return dates.reduce<Date | undefined>((current, date) => (date && (!current || date > current) ? date : current), undefined);
}

function contributorKey(contributor: WordPressContributor) {
  return `${isGuestContributor(contributor) ? "guest" : "user"}:${contributor.id}`;
}

/** Whether an author page has anything to show. Pages without stories are marked noindex, so they are not listed. */
export function contributorIsIndexable(contributor: WordPressContributor, posts: WordPressPost[]) {
  const key = contributorKey(contributor);

  return contributorHasProfilePage(contributor) && posts.some((post) => getPostContributors(post).some((candidate) => contributorKey(candidate) === key));
}

export function buildSitemapEntries(input: SitemapInput): SitemapEntry[] {
  const { siteUrl, timeZone, posts } = input;
  const url = (path: string) => `${siteUrl}${path}`;
  const seen = new Set<string>();
  const entries: SitemapEntry[] = [];
  const add = (entry: SitemapEntry) => {
    if (seen.has(entry.url)) return;
    seen.add(entry.url);
    entries.push(entry);
  };

  const postDates = new Map(posts.map((post) => [post.id, modifiedAt(post, timeZone)]));
  const latestModified = latest([...postDates.values()]);

  add({ url: url("/"), lastModified: latestModified, changeFrequency: "daily", priority: 1 });

  // Sections: configured order first, then any other category that has stories.
  const orderedCategories = [
    ...input.sectionSlugs.flatMap((slug) => input.categories.filter((category) => category.slug === slug)),
    ...input.categories.filter((category) => !input.sectionSlugs.includes(category.slug))
  ];
  for (const category of orderedCategories) {
    if (category.slug === "sports" && !input.features.sports) continue;
    const categoryPosts = posts.filter((post) => post.categories.includes(category.id));
    if (categoryPosts.length === 0) continue;
    add({
      url: url(`/category/${category.slug}/`),
      lastModified: latest(categoryPosts.map((post) => postDates.get(post.id))),
      changeFrequency: "daily",
      priority: 0.7
    });
  }

  for (const page of APPLICATION_PAGES) {
    add({ url: url(page.path), lastModified: latestModified, changeFrequency: page.changeFrequency, priority: page.priority });
  }

  if (input.coverages.length > 0) {
    add({ url: url("/coverage/"), lastModified: latestModified, changeFrequency: "weekly", priority: 0.6 });
  }

  for (const page of input.pages) {
    if (getPageIndexing(page) !== "public") continue;
    add({ url: url(`/${page.slug}/`), lastModified: modifiedAt(page, timeZone), changeFrequency: "monthly", priority: 0.5 });
  }

  for (const post of posts) {
    if (!getPostRouteParts(post)) continue;
    const images = getPostSitemapImages(post, siteUrl);
    add({ url: url(getPostHref(post)), lastModified: postDates.get(post.id), changeFrequency: "weekly", priority: 0.8, ...(images.length ? { images } : {}) });
  }

  for (const contributor of input.contributors) {
    if (!contributorIsIndexable(contributor, posts)) continue;
    const key = contributorKey(contributor);
    const contributorPosts = posts.filter((post) => getPostContributors(post).some((candidate) => contributorKey(candidate) === key));
    add({
      url: url(getContributorHref(contributor)),
      lastModified: latest(contributorPosts.map((post) => postDates.get(post.id))),
      changeFrequency: "weekly",
      priority: 0.6
    });
  }

  for (const coverage of input.coverages) {
    add({
      url: url(getCoverageHref(coverage)),
      lastModified: getWordPressInstant({ local: coverage.modified }, timeZone) ?? undefined,
      changeFrequency: "weekly",
      priority: 0.6
    });
  }

  return entries;
}
