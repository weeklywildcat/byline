import { buildContentIndexes, type BylineIndexes, type ContentIndexAccessors } from "./indexes";
import { stableDigest } from "./digests";
import { buildRouteManifest, type RouteManifestEntry } from "./routing";

export type BuildSnapshotMetrics = {
  startedAt: string;
  completedAt: string;
  durationMs: number;
  fetches: Record<string, { durationMs: number; count: number; required: boolean }>;
  phases: { indexingMs: number; digestMs: number; routeDiscoveryMs: number };
  counts: Record<string, number>;
};

export type BylineBuildSnapshot<Post, Contributor, Category, Tag, Page, Correction, Game, Sports> = {
  posts: Post[];
  contributors: Contributor[];
  categories: Category[];
  tags: Tag[];
  corrections: Correction[];
  pages: Page[];
  sports: Sports;
  games: Game[];
  indexes: BylineIndexes<Post, Contributor, Category, Tag, Page, Correction, Game>;
  digests: {
    posts: Map<string | number, string>;
    contributors: Map<string | number, string>;
    categories: Map<string | number, string>;
    pages: Map<string, string>;
    games: Map<string | number, string>;
    global: string;
  };
  routes: RouteManifestEntry[];
  metrics: BuildSnapshotMetrics;
};

export type BuildSnapshotLoaders<Post, Contributor, Category, Tag, Page, Correction, Game, Sports> = {
  posts(): Promise<Post[]>;
  contributors(): Promise<Contributor[]>;
  categories(): Promise<Category[]>;
  tags(): Promise<Tag[]>;
  corrections(): Promise<Correction[]>;
  pages(): Promise<Page[]>;
  sports(): Promise<Sports>;
  games(sports: Sports): Game[];
};

export type BuildSnapshotOptions<Post, Contributor, Category, Tag, Page, Correction, Game, Sports> = {
  loaders: BuildSnapshotLoaders<Post, Contributor, Category, Tag, Page, Correction, Game, Sports>;
  accessors: ContentIndexAccessors<Post, Contributor, Category, Tag, Page, Correction, Game> & {
    gameId(game: Game): string | number;
  };
  routes(input: {
    posts: Post[]; contributors: Contributor[]; categories: Category[]; tags: Tag[];
    corrections: Correction[]; pages: Page[]; sports: Sports; games: Game[];
  }): Iterable<RouteManifestEntry>;
  globalDependencies: unknown;
  required?: {
    corrections?: boolean;
    sports?: boolean;
  };
};

export async function buildSnapshot<Post, Contributor, Category, Tag, Page, Correction, Game, Sports>(
  options: BuildSnapshotOptions<Post, Contributor, Category, Tag, Page, Correction, Game, Sports>
): Promise<BylineBuildSnapshot<Post, Contributor, Category, Tag, Page, Correction, Game, Sports>> {
  const started = performance.now();
  const startedAt = new Date().toISOString();
  const fetches: BuildSnapshotMetrics["fetches"] = {};
  const timed = async <T>(name: string, load: () => Promise<T>, required = true) => {
    const fetchStarted = performance.now();
    const value = await load();
    fetches[name] = {
      durationMs: Math.round((performance.now() - fetchStarted) * 100) / 100,
      count: Array.isArray(value) ? value.length : 1,
      required
    };
    return value;
  };
  const [posts, contributors, categories, tags, corrections, pages, sports] = await Promise.all([
    timed("posts", options.loaders.posts), timed("contributors", options.loaders.contributors),
    timed("categories", options.loaders.categories), timed("tags", options.loaders.tags),
    timed("corrections", options.loaders.corrections, options.required?.corrections ?? false),
    timed("pages", options.loaders.pages),
    timed("sports", options.loaders.sports, options.required?.sports ?? false)
  ]);
  const games = options.loaders.games(sports);
  const input = { posts, contributors, categories, tags, corrections, pages, sports, games };
  const indexingStarted = performance.now();
  const indexes = buildContentIndexes(input, options.accessors);
  const indexingMs = Math.round((performance.now() - indexingStarted) * 100) / 100;
  const digestStarted = performance.now();
  const digests = {
    posts: new Map(posts.map((post) => [options.accessors.postId(post), stableDigest(post)])),
    contributors: new Map(contributors.map((entry) => [options.accessors.contributorId(entry), stableDigest(entry)])),
    categories: new Map(categories.map((entry) => [options.accessors.categoryId(entry), stableDigest(entry)])),
    pages: new Map(pages.map((entry) => [options.accessors.pageSlug(entry), stableDigest(entry)])),
    games: new Map(games.map((entry) => [options.accessors.gameId(entry), stableDigest(entry)])),
    global: stableDigest(options.globalDependencies)
  };
  const digestMs = Math.round((performance.now() - digestStarted) * 100) / 100;
  const routeStarted = performance.now();
  const routes = buildRouteManifest(options.routes(input));
  const routeDiscoveryMs = Math.round((performance.now() - routeStarted) * 100) / 100;
  const completedAt = new Date().toISOString();
  return {
    ...input,
    indexes,
    digests,
    routes,
    metrics: {
      startedAt,
      completedAt,
      durationMs: Math.round((performance.now() - started) * 100) / 100,
      fetches,
      phases: { indexingMs, digestMs, routeDiscoveryMs },
      counts: {
        posts: posts.length, contributors: contributors.length, categories: categories.length,
        tags: tags.length, corrections: corrections.length, pages: pages.length, games: games.length,
        routes: routes.length
      }
    }
  };
}

export function memoizeBuildSnapshot<T>(loader: () => Promise<T>) {
  let promise: Promise<T> | undefined;
  return () => (promise ??= loader());
}
