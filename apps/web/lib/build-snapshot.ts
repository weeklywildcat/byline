import {
  archiveRouteDigest,
  articleRouteDigest,
  buildSnapshot,
  memoizeBuildSnapshot,
  type BylineBuildSnapshot,
  type RouteManifestEntry
} from "@byline/content";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { optionalBuildData, requireBuildData } from "@/lib/build-data";
import { isHiddenCategory, isVisibleContentPost } from "@/lib/content";
import { type SportsGame, type SportsRoster, type SportsTeamMedia } from "@/lib/headless";
import { CODE_ROUTED_PAGE_SLUGS, REDIRECTED_PAGE_SLUGS } from "@/lib/code-routes";
import { getPublicationConfig } from "@/lib/publication";
import { getGameSeason } from "@/lib/sports-season";
import { getSportsArchiveRedirects, getSportsArchiveHref } from "@/lib/sports-archive";
import { type TeamSummary } from "@/lib/sports";
import {
  getAllCategories,
  getAllPages,
  getAllPosts,
  getAllPublicContributors,
  getAllPublicCorrections,
  getAllPublicCoverages,
  getContributorHref,
  getPostContributors,
  getPostHref,
  getPostRouteParts,
  isGuestContributor,
  type WordPressCategory,
  type WordPressContributor,
  type WordPressCorrection,
  type WordPressCoverage,
  type WordPressPage,
  type WordPressPost,
  type WordPressTag
} from "@/lib/wordpress";

const publication = getPublicationConfig();

export type BylineSportsSnapshot = {
  games: SportsGame[];
  rosters: SportsRoster[];
  teamMedia: SportsTeamMedia[];
  teams: TeamSummary[];
  coverages: WordPressCoverage[];
};

export type WebBuildSnapshot = BylineBuildSnapshot<
  WordPressPost,
  WordPressContributor,
  WordPressCategory,
  WordPressTag,
  WordPressPage,
  WordPressCorrection,
  SportsGame,
  BylineSportsSnapshot
>;

function contributorIdentity(contributor: WordPressContributor) {
  return `${isGuestContributor(contributor) ? "guest" : "user"}:${contributor.id}`;
}

function postContributorIdentities(post: WordPressPost) {
  return getPostContributors(post).map(contributorIdentity);
}

function routeEntries(input: {
  posts: WordPressPost[];
  contributors: WordPressContributor[];
  categories: WordPressCategory[];
  pages: WordPressPage[];
  sports: BylineSportsSnapshot;
}): RouteManifestEntry[] {
  const archiveHref = getSportsArchiveHref(input.pages);
  const fixed: RouteManifestEntry[] = [
    { path: "/", kind: "home" },
    { path: "/authors/", kind: "author" },
    { path: "/corrections/", kind: "other" },
    { path: "/coverage/", kind: "coverage" },
    ...CODE_ROUTED_PAGE_SLUGS.map((slug): RouteManifestEntry => ({ path: `/${slug}/`, kind: "page" })),
    { path: "/media-kit/", kind: "page" },
    { path: "/open-source/", kind: "page" },
    { path: "/search/", kind: "search" },
    { path: "/sports/", kind: "redirect", redirectTo: archiveHref, delivery: "edge" },
    { path: "/sports/schedule/", kind: "redirect", redirectTo: archiveHref, delivery: "edge" },
    { path: "/stories/", kind: "other" },
    ...Object.entries(REDIRECTED_PAGE_SLUGS).map(([slug, target]): RouteManifestEntry => ({ path: `/${slug}/`, kind: "redirect", redirectTo: target })),
    { path: "/feed.xml", kind: "feed" },
    { path: "/news-sitemap.xml", kind: "feed" },
    { path: "/sitemap.xml", kind: "sitemap" },
    { path: "/robots.txt", kind: "robots" },
    { path: "/404.html", kind: "not-found" },
    { path: "/404/", kind: "not-found" }
  ];
  const articles = input.posts.filter(isVisibleContentPost).flatMap((post) => {
    const route = getPostRouteParts(post);
    return route ? [{ path: getPostHref(post), kind: "article" as const, digest: articleRouteDigest(post) }] : [];
  });
  const pages = input.pages.filter((page) => !CODE_ROUTED_PAGE_SLUGS.includes(page.slug)).map((page) => ({ path: `/${page.slug}/`, kind: "page" as const, digest: archiveRouteDigest(page) }));
  const categories = input.categories.filter((category) => !isHiddenCategory(category)).map((category) => ({
    path: `/category/${category.slug}/`,
    kind: "category" as const,
    digest: archiveRouteDigest([category, input.posts.filter((post) => post.categories.includes(category.id)).map((post) => post.id)])
  }));
  const authors = input.contributors.map((contributor) => ({
    path: getContributorHref(contributor),
    kind: "author" as const,
    digest: archiveRouteDigest([contributor, input.posts.filter((post) => postContributorIdentities(post).includes(contributorIdentity(contributor))).map((post) => post.id)])
  }));
  const coverages = input.sports.coverages.map((coverage) => ({ path: `/coverage/${coverage.slug}/`, kind: "coverage" as const, digest: archiveRouteDigest(coverage) }));
  const sports: RouteManifestEntry[] = getSportsArchiveRedirects(input.pages)
    .filter(({ path }) => path !== "/sports/" && path !== "/sports/schedule/")
    .map(({ path, target }) => ({ path, kind: "redirect" as const, redirectTo: target, delivery: "edge" as const }));
  return [...fixed, ...articles, ...pages, ...categories, ...authors, ...coverages, ...sports];
}

async function loadSnapshot(): Promise<WebBuildSnapshot> {
  return buildSnapshot({
    loaders: {
      posts: () => requireBuildData("/wp-json/wp/v2/posts", getAllPosts),
      contributors: () => requireBuildData("/wp-json/byline/v1/contributors", getAllPublicContributors),
      categories: () => requireBuildData("/wp-json/wp/v2/categories", getAllCategories),
      tags: async () => {
        const posts = await requireBuildData("/wp-json/wp/v2/posts", getAllPosts);
        const tags = new Map<number, WordPressTag>();
        for (const post of posts) {
          for (const termGroup of post._embedded?.["wp:term"] ?? []) {
            for (const term of termGroup) {
              if (term.taxonomy === "post_tag" && "id" in term) tags.set(term.id, term as WordPressTag);
            }
          }
        }
        return [...tags.values()];
      },
      corrections: () => optionalBuildData("/wp-json/byline/v1/corrections", getAllPublicCorrections, []),
      pages: () => requireBuildData("/wp-json/wp/v2/pages", getAllPages),
      sports: async () => {
        const coverages = await optionalBuildData("/wp-json/byline/v1/coverage", getAllPublicCoverages, []);
        return { games: [], rosters: [], teamMedia: [], teams: [], coverages };
      },
      games: (sports) => sports.games
    },
    accessors: {
      postId: (post) => post.id,
      postSlug: (post) => post.slug,
      postCategoryIds: (post) => post.categories,
      postTagIds: (post) => post.tags,
      postContributorIds: postContributorIdentities,
      contributorId: contributorIdentity,
      categoryId: (category) => category.id,
      tagId: (tag) => tag.id,
      pageSlug: (page) => page.slug,
      correctionPostId: (correction) => correction.postId ?? null,
      gameId: (game) => game.id,
      gameSport: (game) => game.sportKey || game.sport,
      gameSeason: (game: SportsGame) => getGameSeason(game),
      gameTeamKeys: (game) => [game.teamKey, game.teamSlug, game.sportKey].filter((value): value is string => Boolean(value)),
      gameDate: (game) => game.startDate.split("T")[0]
    },
    routes: routeEntries,
    required: { sports: false },
    globalDependencies: { publication }
  });
}

export const getBuildSnapshot = memoizeBuildSnapshot(async () => {
  const snapshot = await loadSnapshot();
  const buildDirectory = path.join(process.cwd(), ".byline-build");
  await mkdir(buildDirectory, { recursive: true });
  await Promise.all([
    writeFile(path.join(buildDirectory, "expected-routes.json"), `${JSON.stringify(snapshot.routes, null, 2)}\n`),
    writeFile(path.join(buildDirectory, "snapshot-metrics.json"), `${JSON.stringify(snapshot.metrics, null, 2)}\n`)
  ]);
  return snapshot;
});
