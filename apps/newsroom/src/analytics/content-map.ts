import { storyIdFromContentId } from "./model";

/**
 * Joins Google's rows to Byline's Stories. GA knows events and URLs; Byline knows Story IDs,
 * canonical paths, redirect history, headlines, sections, authors and topics. Every GA row maps to
 * exactly one Byline record, by this order:
 *
 *   1. `content_id` = `story:<id>` and that Story exists
 *   2. the page path is a Story's current canonical path
 *   3. the page path is a known redirect into a Story's current path
 *   4. otherwise it is a page that isn't a Story
 *
 * One report is mapped row by row (never a content-ID report plus a path report, which would count
 * the same events twice).
 */
export type CatalogStory = {
  id: number;
  title: string;
  /** The title the public page puts in `<title>` (and so what Google's Realtime reports). */
  documentTitle: string;
  path: string;
  section: { name: string; slug: string } | null;
  publishedAt: string | null;
  authors: number[];
  topics: number[];
};

export type Catalog = {
  stories: Map<number, CatalogStory>;
  paths: Map<string, number>;
  redirects: Map<string, number>;
  sections: Array<{ slug: string; name: string }>;
  authors: Array<{ id: number; name: string }>;
  topics: Array<{ id: number; name: string }>;
  siteHost: string;
};

/** A page path as Byline compares it: no query or hash, no index file, one trailing slash. */
export function normalizePath(value: string): string {
  let path = value.split(/[?#]/)[0] ?? "";
  try { path = decodeURI(path); } catch { /* keep the raw path */ }
  if (!path.startsWith("/")) path = `/${path}`;
  path = path.replace(/\/index\.html?$/i, "/").replace(/\/{2,}/g, "/");
  return path.endsWith("/") ? path : `${path}/`;
}

export type RowIdentity = { contentId?: string; pagePath?: string };
export type Mapped = { kind: "story"; story: CatalogStory; via: "content-id" | "path" | "redirect" } | { kind: "page"; path: string };

export function mapRow(row: RowIdentity, catalog: Catalog): Mapped {
  const id = row.contentId ? storyIdFromContentId(row.contentId) : null;
  const byId = id === null ? undefined : catalog.stories.get(id);
  if (byId) return { kind: "story", story: byId, via: "content-id" };
  const path = normalizePath(row.pagePath ?? "/");
  const current = catalog.paths.get(path);
  if (current !== undefined) return { kind: "story", story: catalog.stories.get(current)!, via: "path" };
  const moved = catalog.redirects.get(path);
  if (moved !== undefined && catalog.stories.has(moved)) return { kind: "story", story: catalog.stories.get(moved)!, via: "redirect" };
  return { kind: "page", path };
}

/** Every path a Story has answered at: its canonical path and the redirects that lead to it. */
export function pathsFor(storyId: number, catalog: Catalog): string[] {
  const story = catalog.stories.get(storyId);
  if (!story) return [];
  const moved = [...catalog.redirects].filter(([, target]) => target === storyId).map(([from]) => from);
  return [...new Set([story.path, ...moved])];
}

/**
 * Builds the catalog's lookups. A path claimed by two Stories belongs to neither (a Story is never
 * guessed); a redirect only counts when its destination is a Story's current path.
 */
export function buildCatalog(input: {
  stories: Array<Omit<CatalogStory, "documentTitle"> & { documentTitle?: string }>;
  redirects: Array<{ from: string; to: string }>;
  sections?: Catalog["sections"]; authors?: Catalog["authors"]; topics?: Catalog["topics"];
  shortName: string; siteHost: string;
}): Catalog {
  const stories = new Map<number, CatalogStory>();
  const claims = new Map<string, number[]>();
  for (const row of input.stories) {
    const path = normalizePath(row.path);
    stories.set(row.id, { ...row, path, documentTitle: row.documentTitle ?? documentTitle(row.title, input.shortName) });
    claims.set(path, [...(claims.get(path) ?? []), row.id]);
  }
  const paths = new Map<string, number>();
  for (const [path, ids] of claims) if (ids.length === 1) paths.set(path, ids[0]!);
  const redirects = new Map<string, number>();
  for (const { from, to } of input.redirects) {
    const target = paths.get(normalizePath(to));
    const source = normalizePath(from);
    if (target !== undefined && !paths.has(source)) redirects.set(source, target);
  }
  return { stories, paths, redirects, sections: input.sections ?? [], authors: input.authors ?? [], topics: input.topics ?? [], siteHost: input.siteHost };
}

/** The page title the public layout writes: `<headline> | <short name>` (apps/web BaseLayout). */
export const documentTitle = (headline: string, shortName: string) => `${headline.trim()} | ${shortName}`;

/**
 * Realtime reports a page by its title, so a title can only name a Story when exactly one Story
 * has that title. Two Stories with the same headline stay generic pages rather than be confused.
 */
export function storyForTitle(title: string, catalog: Catalog): CatalogStory | null {
  const matches = [...catalog.stories.values()].filter((story) => story.documentTitle === title);
  return matches.length === 1 ? matches[0]! : null;
}

export const matchesFilters = (story: CatalogStory, filters: { section?: string; author?: number; topic?: number; story?: number }) =>
  (!filters.section || story.section?.slug === filters.section) &&
  (!filters.author || story.authors.includes(filters.author)) &&
  (!filters.topic || story.topics.includes(filters.topic)) &&
  (!filters.story || story.id === filters.story);
