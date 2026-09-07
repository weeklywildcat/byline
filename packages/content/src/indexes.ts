export type ContentIdentity = number | string;

export type ContentIndexAccessors<Post, Contributor, Category, Tag, Page, Correction, Game> = {
  postId(post: Post): ContentIdentity;
  postSlug(post: Post): string;
  postCategoryIds(post: Post): ContentIdentity[];
  postTagIds(post: Post): ContentIdentity[];
  postContributorIds(post: Post): ContentIdentity[];
  contributorId(contributor: Contributor): ContentIdentity;
  categoryId(category: Category): ContentIdentity;
  tagId(tag: Tag): ContentIdentity;
  pageSlug(page: Page): string;
  correctionPostId(correction: Correction): ContentIdentity | null;
  gameSport(game: Game): string;
  gameSeason(game: Game): string;
  gameTeamKeys(game: Game): string[];
  gameDate(game: Game): string;
};

export type BylineIndexes<Post, Contributor, Category, Tag, Page, Correction, Game> = {
  postsById: Map<ContentIdentity, Post>;
  postsBySlug: Map<string, Post>;
  postsByCategory: Map<ContentIdentity, Post[]>;
  postsByTag: Map<ContentIdentity, Post[]>;
  postsByContributor: Map<ContentIdentity, Post[]>;
  contributorsById: Map<ContentIdentity, Contributor>;
  categoriesById: Map<ContentIdentity, Category>;
  tagsById: Map<ContentIdentity, Tag>;
  correctionsByPost: Map<ContentIdentity, Correction[]>;
  pagesBySlug: Map<string, Page>;
  gamesBySport: Map<string, Game[]>;
  gamesBySeason: Map<string, Game[]>;
  gamesByTeam: Map<string, Game[]>;
  gamesByDate: Map<string, Game[]>;
};

function append<Key, Value>(map: Map<Key, Value[]>, key: Key, value: Value) {
  const entries = map.get(key);
  if (entries) entries.push(value);
  else map.set(key, [value]);
}
export function buildContentIndexes<Post, Contributor, Category, Tag, Page, Correction, Game>(
  input: {
    posts: Post[];
    contributors: Contributor[];
    categories: Category[];
    tags: Tag[];
    pages: Page[];
    corrections: Correction[];
    games: Game[];
  },
  accessors: ContentIndexAccessors<Post, Contributor, Category, Tag, Page, Correction, Game>
): BylineIndexes<Post, Contributor, Category, Tag, Page, Correction, Game> {
  const indexes: BylineIndexes<Post, Contributor, Category, Tag, Page, Correction, Game> = {
    postsById: new Map(),
    postsBySlug: new Map(),
    postsByCategory: new Map(),
    postsByTag: new Map(),
    postsByContributor: new Map(),
    contributorsById: new Map(),
    categoriesById: new Map(),
    tagsById: new Map(),
    correctionsByPost: new Map(),
    pagesBySlug: new Map(),
    gamesBySport: new Map(),
    gamesBySeason: new Map(),
    gamesByTeam: new Map(),
    gamesByDate: new Map()
  };

  for (const post of input.posts) {
    indexes.postsById.set(accessors.postId(post), post);
    indexes.postsBySlug.set(accessors.postSlug(post), post);
    for (const id of new Set(accessors.postCategoryIds(post))) append(indexes.postsByCategory, id, post);
    for (const id of new Set(accessors.postTagIds(post))) append(indexes.postsByTag, id, post);
    for (const id of new Set(accessors.postContributorIds(post))) append(indexes.postsByContributor, id, post);
  }
  for (const contributor of input.contributors) indexes.contributorsById.set(accessors.contributorId(contributor), contributor);
  for (const category of input.categories) indexes.categoriesById.set(accessors.categoryId(category), category);
  for (const tag of input.tags) indexes.tagsById.set(accessors.tagId(tag), tag);
  for (const page of input.pages) indexes.pagesBySlug.set(accessors.pageSlug(page), page);
  for (const correction of input.corrections) {
    const id = accessors.correctionPostId(correction);
    if (id !== null) append(indexes.correctionsByPost, id, correction);
  }
  for (const game of input.games) {
    const sport = accessors.gameSport(game);
    const season = accessors.gameSeason(game);
    const date = accessors.gameDate(game);
    if (sport) append(indexes.gamesBySport, sport, game);
    if (season) append(indexes.gamesBySeason, season, game);
    if (date) append(indexes.gamesByDate, date, game);
    for (const team of new Set(accessors.gameTeamKeys(game).filter(Boolean))) append(indexes.gamesByTeam, team, game);
  }
  return indexes;
}
