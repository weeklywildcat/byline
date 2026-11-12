import siteConfig from "@byline/site/config";
import { getNativeSnapshot } from "./native-snapshot";
import { publicDataProjects } from "./public-data";
import { publicPageHref } from "./native-archive-views";
import { routeCacheDependency } from "./route-cache";
import {
  FIXED_PUBLIC_CONTENT_ROUTES,
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
import { BEHIND_THE_SCENES } from "@/lib/behind-the-scenes";
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
  type ArchiveCategory,
  type ArchiveContributor,
  type ArchiveCorrection,
  type ArchiveCoverage,
  type ArchivePage,
  type ArchivePost,
  type ArchiveTag
} from "@/lib/public-content";

const publication = getPublicationConfig();

export type BylineSportsSnapshot = {
  games: SportsGame[];
  rosters: SportsRoster[];
  teamMedia: SportsTeamMedia[];
  teams: TeamSummary[];
  coverages: ArchiveCoverage[];
};

export type WebBuildSnapshot = BylineBuildSnapshot<
  ArchivePost,
  ArchiveContributor,
  ArchiveCategory,
  ArchiveTag,
  ArchivePage,
  ArchiveCorrection,
  SportsGame,
  BylineSportsSnapshot
>;

function contributorIdentity(contributor: ArchiveContributor) {
  return `${isGuestContributor(contributor) ? "guest" : "user"}:${contributor.id}`;
}

function postContributorIdentities(post: ArchivePost) {
  return getPostContributors(post).map(contributorIdentity);
}

function routeEntries(input: {
  posts: ArchivePost[];
  contributors: ArchiveContributor[];
  categories: ArchiveCategory[];
  pages: ArchivePage[];
  sports: BylineSportsSnapshot;
}): RouteManifestEntry[] {
  const archiveHref = getSportsArchiveHref(input.pages);
  const fixed: RouteManifestEntry[] = [
    ...FIXED_PUBLIC_CONTENT_ROUTES,
    { path: "/authors/", kind: "redirect", redirectTo: "/staff/", delivery: "edge" },
    { path: "/sports/", kind: "redirect", redirectTo: archiveHref, delivery: "edge" },
    { path: "/sports/schedule/", kind: "redirect", redirectTo: archiveHref, delivery: "edge" },
    ...Object.entries(REDIRECTED_PAGE_SLUGS).map(([slug, target]): RouteManifestEntry => ({ path: `/${slug}/`, kind: "redirect", redirectTo: target })),
    { path: "/404.html", kind: "not-found" },
    { path: "/404/", kind: "not-found" },
    // Phase 0 spike: pages the selected site owns join the route manifest.
    // A page that replaces an engine route keeps that route's own manifest entry.
    ...siteConfig.pages.filter((page) => !FIXED_PUBLIC_CONTENT_ROUTES.some((route) => route.path === page.pattern)).map((page): RouteManifestEntry => ({ path: page.pattern, kind: "page" }))
  ];
  const articles = input.posts.filter(isVisibleContentPost).flatMap((post) => {
    const route = getPostRouteParts(post);
    return route ? [{ path: getPostHref(post), kind: "article" as const, digest: articleRouteDigest(post) }] : [];
  });
  const pages = input.pages.filter((page) => !CODE_ROUTED_PAGE_SLUGS.includes(page.slug)).map((page) => ({ path: publicPageHref(page), kind: "page" as const, digest: archiveRouteDigest(page) }));
  const categories = input.categories.filter((category) => !isHiddenCategory(category)).map((category) => ({
    path: `/category/${category.slug}/`,
    ...(category.slug === BEHIND_THE_SCENES.slug
      ? { kind: "redirect" as const, redirectTo: BEHIND_THE_SCENES.path }
      : { kind: "category" as const }),
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
  const redirects = getNativeSnapshot()?.datasets.redirects.map(({ from, to }): RouteManifestEntry => ({ path: from, redirectTo: to, kind: "redirect", delivery: "edge" })) ?? [];
  const data = publicDataProjects().map((project): RouteManifestEntry => ({ path: project.href, kind: "data", digest: archiveRouteDigest([project, project.bindings.map((binding) => binding.release)]) }));
  return [...fixed, ...articles, ...pages, ...categories, ...authors, ...coverages, ...sports, ...redirects, ...data];
}

async function loadSnapshot(): Promise<WebBuildSnapshot> {
  return buildSnapshot({
    loaders: {
      posts: () => requireBuildData("public snapshot: posts", getAllPosts),
      contributors: () => requireBuildData("public snapshot: contributors", getAllPublicContributors),
      categories: () => requireBuildData("public snapshot: categories", getAllCategories),
      tags: async () => {
        const posts = await requireBuildData("public snapshot: posts", getAllPosts);
        const tags = new Map<number, ArchiveTag>();
        for (const post of posts) {
          for (const termGroup of post._embedded?.["wp:term"] ?? []) {
            for (const term of termGroup) {
              if (term.taxonomy === "post_tag" && "id" in term) tags.set(term.id, term as ArchiveTag);
            }
          }
        }
        return [...tags.values()];
      },
      corrections: () => optionalBuildData("public snapshot: corrections", getAllPublicCorrections, []),
      pages: () => requireBuildData("public snapshot: pages", getAllPages),
      sports: async () => {
        const coverages = await optionalBuildData("public snapshot: coverage", getAllPublicCoverages, []);
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

function withNativeRouteDigests(snapshot: WebBuildSnapshot, cacheKeys: Array<{ path: string; key: string }>) {
  if (!getNativeSnapshot()) return snapshot.routes;
  const digests = new Map(cacheKeys.map(({ path, key }) => [path, key]));
  return snapshot.routes.map((route) => route.kind === "article" ? { ...route, digest: digests.get(route.path) ?? route.digest } : route);
}

export const getBuildSnapshot = memoizeBuildSnapshot(async () => {
  const snapshot = await loadSnapshot();
  const buildDirectory = path.join(process.cwd(), ".byline-build");
  await mkdir(buildDirectory, { recursive: true });
  const cacheKeys = [
    ...snapshot.posts.filter(isVisibleContentPost).map((post) => ({ path: getPostHref(post), ...routeCacheDependency(snapshot, "article", post.id) })),
    ...snapshot.categories.filter((category) => !isHiddenCategory(category)).map((category) => ({ path: `/category/${category.slug}/`, ...routeCacheDependency(snapshot, "category", category.id) })),
    ...snapshot.contributors.map((person) => ({ path: getContributorHref(person), ...routeCacheDependency(snapshot, "author", contributorIdentity(person)) })),
    ...snapshot.pages.filter((page) => !CODE_ROUTED_PAGE_SLUGS.includes(page.slug)).map((page) => ({ path: publicPageHref(page), ...routeCacheDependency(snapshot, "page", page.slug) })),
    ...snapshot.sports.coverages.map((coverage) => ({ path: `/coverage/${coverage.slug}/`, ...routeCacheDependency(snapshot, "coverage", coverage.slug) })),
    ...publicDataProjects().map((project) => ({ path: project.href, ...routeCacheDependency(snapshot, "data", project.slug) }))
  ];
  await Promise.all([
    writeFile(path.join(buildDirectory, "route-cache-keys.json"), `${JSON.stringify(cacheKeys, null, 2)}\n`),
    writeFile(path.join(buildDirectory, "expected-routes.json"), `${JSON.stringify(withNativeRouteDigests(snapshot, cacheKeys), null, 2)}\n`),
    writeFile(path.join(buildDirectory, "snapshot-metrics.json"), `${JSON.stringify(snapshot.metrics, null, 2)}\n`)
  ]);
  return snapshot;
});
