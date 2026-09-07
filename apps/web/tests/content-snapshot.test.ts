import { describe, expect, it, vi } from "vitest";
import {
  buildContentIndexes,
  buildRouteManifest,
  buildSnapshot,
  createMediaManifest,
  deterministicMediaPath,
  memoizeBuildSnapshot,
  stableDigest,
  validateRedirects
} from "@byline/content";

type Post = { id: number; slug: string; categories: number[]; tags: number[]; contributors: string[] };
type Game = { id: string; sport: string; season: string; teams: string[]; date: string };
const post: Post = { id: 1, slug: "story", categories: [2, 2], tags: [3], contributors: ["student"] };
const game: Game = { id: "g1", sport: "football", season: "2025-26", teams: ["varsity"], date: "2025-09-01" };
const accessors = {
  postId: (value: Post) => value.id,
  postSlug: (value: Post) => value.slug,
  postCategoryIds: (value: Post) => value.categories,
  postTagIds: (value: Post) => value.tags,
  postContributorIds: (value: Post) => value.contributors,
  contributorId: (value: { id: string }) => value.id,
  categoryId: (value: { id: number }) => value.id,
  tagId: (value: { id: number }) => value.id,
  pageSlug: (value: { slug: string }) => value.slug,
  correctionPostId: (value: { postId: number }) => value.postId,
  gameSport: (value: Game) => value.sport,
  gameSeason: (value: Game) => value.season,
  gameTeamKeys: (value: Game) => value.teams,
  gameDate: (value: Game) => value.date,
  gameId: (value: Game) => value.id
};

describe("framework-independent content snapshot primitives", () => {
  it("digests equivalent object values deterministically and rejects cycles", () => {
    expect(stableDigest({ b: 2, a: 1 })).toBe(stableDigest({ a: 1, b: 2 }));
    expect(stableDigest({ a: 2 })).not.toBe(stableDigest({ a: 1 }));
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(() => stableDigest(cyclic)).toThrow(/cyclic/i);
    const cyclicArray: unknown[] = [];
    cyclicArray.push(cyclicArray);
    expect(() => stableDigest(cyclicArray)).toThrow(/cyclic/i);
    expect(stableDigest(new Set(["b", "a"]))).toBe(stableDigest(new Set(["a", "b"])));
  });

  it("builds direct relationship indexes without duplicate membership", () => {
    const indexes = buildContentIndexes({
      posts: [post], contributors: [{ id: "student" }], categories: [{ id: 2 }], tags: [{ id: 3 }],
      pages: [{ slug: "about" }], corrections: [{ postId: 1 }], games: [game]
    }, accessors);
    expect(indexes.postsBySlug.get("story")).toBe(post);
    expect(indexes.postsByCategory.get(2)).toEqual([post]);
    expect(indexes.gamesByTeam.get("varsity")).toEqual([game]);
    expect(indexes.correctionsByPost.get(1)).toHaveLength(1);
  });

  it("normalizes and validates route and redirect registries", () => {
    expect(buildRouteManifest([{ path: "/category//news", kind: "category" }])).toEqual([{ path: "/category/news/", kind: "category" }]);
    expect(() => buildRouteManifest([{ path: "/news", kind: "page" }, { path: "/news/", kind: "category" }])).toThrow(/Duplicate/);
    expect(validateRedirects([{ from: "/old", to: "/new", status: 301, reason: "legacy" }])).toEqual([{ from: "/old/", to: "/new/", status: 301, reason: "legacy" }]);
  });

  it("uses versioned, deterministic media paths", () => {
    const source = "https://cms.example.test/uploads/My Image.jpg";
    expect(deterministicMediaPath(source, 1)).toBe(deterministicMediaPath(source, 1));
    expect(deterministicMediaPath(source, 2)).not.toBe(deterministicMediaPath(source, 1));
    expect(createMediaManifest([source, source], 1).items[source].localPath).toContain("My-Image.jpg");
  });

  it("loads each source once, then builds indexes, digests, routes, and metrics", async () => {
    const loaders = {
      posts: vi.fn(async () => [post]), contributors: vi.fn(async () => [{ id: "student" }]),
      categories: vi.fn(async () => [{ id: 2 }]), tags: vi.fn(async () => [{ id: 3 }]),
      corrections: vi.fn(async () => [{ postId: 1 }]), pages: vi.fn(async () => [{ slug: "about" }]),
      sports: vi.fn(async () => ({ games: [game] })), games: (sports: { games: Game[] }) => sports.games
    };
    const snapshot = await buildSnapshot({
      loaders, accessors, globalDependencies: { theme: "weekly-wildcat" },
      routes: () => [{ path: "/story", kind: "article" }]
    });
    expect(snapshot.routes[0].path).toBe("/story/");
    expect(snapshot.indexes.postsById.get(1)).toBe(post);
    expect(snapshot.digests.posts.get(1)).toMatch(/^[a-f0-9]{16}$/);
    expect(snapshot.metrics.counts).toMatchObject({ posts: 1, games: 1, routes: 1 });
    expect(snapshot.metrics.phases).toEqual({
      indexingMs: expect.any(Number), digestMs: expect.any(Number), routeDiscoveryMs: expect.any(Number)
    });
    expect(loaders.posts).toHaveBeenCalledOnce();
  });

  it("memoizes a snapshot promise", async () => {
    const loader = vi.fn(async () => ({ ok: true }));
    const getSnapshot = memoizeBuildSnapshot(loader);
    expect(await getSnapshot()).toBe(await getSnapshot());
    expect(loader).toHaveBeenCalledOnce();
  });
});
