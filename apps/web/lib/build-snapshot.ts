import {
  archiveRouteDigest,
  articleRouteDigest,
  buildSnapshot,
  memoizeBuildSnapshot,
  sportsRouteDigest,
  type BylineBuildSnapshot,
  type RouteManifestEntry
} from "@byline/content";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { optionalBuildData, requireBuildData } from "@/lib/build-data";
import { isHiddenCategory, isVisibleContentPost } from "@/lib/content";
import { getAllSportsGames, getAllSportsRosters, getSportsTeams, type SportsGame, type SportsRoster, type SportsTeamMedia } from "@/lib/headless";
import { mirrorWordPressMediaUrl } from "@/lib/media";
import { getPublicationConfig } from "@/lib/publication";
import { getGameSeason } from "@/lib/sports-season";
import { buildTeams, getSeasonHref, getTeamHubHref, type TeamSummary } from "@/lib/sports";
import { WEEKLY_WILDCAT_SOCCER_HERO_SOURCE } from "@/lib/sports-fallback-media";
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
  const sportsRouteKind = publication.features.sports ? "sports" as const : "not-found" as const;
  const fixed: RouteManifestEntry[] = [
    { path: "/", kind: "home" },
    { path: "/authors/", kind: "author" },
    { path: "/corrections/", kind: "other" },
    { path: "/coverage/", kind: "coverage" },
    { path: "/media-kit/", kind: "page" },
    { path: "/search/", kind: "search" },
    { path: "/sports/", kind: sportsRouteKind },
    { path: "/sports/schedule/", kind: sportsRouteKind },
    { path: "/stories/", kind: "other" },
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
  const pages = input.pages.map((page) => ({ path: `/${page.slug}/`, kind: "page" as const, digest: archiveRouteDigest(page) }));
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
  const sports: RouteManifestEntry[] = publication.features.sports ? [
    ...input.sports.teams.flatMap((team) => [
      { path: getTeamHubHref(team), kind: "sports" as const, digest: sportsRouteDigest(team) },
      ...team.seasons.map((year) => ({ path: getSeasonHref(team, year), kind: "sports" as const, digest: sportsRouteDigest([team.teamKey, year, team.games.filter((game) => getGameSeason(game) === year)] ) }))
    ])
  ] : [];
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
        const [games, rosters, teamMedia, coverages] = await Promise.all([
          publication.features.sports ? requireBuildData("/wp-json/weekly-wildcat/v1/sports-games", getAllSportsGames) : [],
          publication.features.sports ? requireBuildData("/wp-json/weekly-wildcat/v1/sports-rosters", getAllSportsRosters) : [],
          publication.features.sports ? requireBuildData("/wp-json/weekly-wildcat/v1/sports-teams", getSportsTeams) : [],
          optionalBuildData("/wp-json/byline/v1/coverage", getAllPublicCoverages, [])
        ]);
        if (publication.features.sports && publication.appearance.theme === "weekly-wildcat" && !process.env.BYLINE_CONTENT_MODE?.endsWith("-fixture")) {
          await mirrorWordPressMediaUrl(WEEKLY_WILDCAT_SOCCER_HERO_SOURCE);
        }
        return { games, rosters, teamMedia, teams: buildTeams(games, rosters, teamMedia), coverages };
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
    required: { sports: publication.features.sports },
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
