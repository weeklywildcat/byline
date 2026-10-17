import { describe, expect, it, vi } from "vitest";
import { buildSnapshot } from "@byline/content";
import { routeCacheDependency } from "@/lib/route-cache";
import { WEEKLY_WILDCAT_PUBLICATION } from "@/lib/publication";
import { getPostContributors, isGuestContributor, type WordPressPost } from "@/lib/wordpress";
import type { WebBuildSnapshot } from "@/lib/build-snapshot";
import fixture from "./fixtures/weekly-wildcat-content.json";
const personKey = (p: { id: number | string; type?: string }) => `${p.type === "guest" ? "guest" : "user"}:${p.id}`;
async function snapshot(posts = structuredClone(fixture.posts) as WordPressPost[], contributors = structuredClone(fixture.authors), coverages: any[] = []): Promise<WebBuildSnapshot> {
  return buildSnapshot({
    loaders: { posts: async () => posts, contributors: async () => contributors, categories: async () => structuredClone(fixture.categories) as any, tags: async () => [], corrections: async () => [], pages: async () => structuredClone(fixture.pages), sports: async () => ({ games: [], teams: [], rosters: [], teamMedia: [], coverages }), games: (sports) => sports.games },
    accessors: { postId: (p) => p.id, postSlug: (p) => p.slug, postCategoryIds: (p) => p.categories, postTagIds: (p) => p.tags, postContributorIds: (p) => getPostContributors(p).map(personKey), contributorId: personKey, categoryId: (c: any) => c.id, tagId: (t: any) => t.id, pageSlug: (p) => p.slug, correctionPostId: () => null, gameId: () => 0, gameSport: () => "", gameSeason: () => "", gameTeamKeys: () => [], gameDate: () => "" },
    routes: () => [], globalDependencies: {}
  }) as Promise<WebBuildSnapshot>;
}
const key = (s: WebBuildSnapshot, kind: Parameters<typeof routeCacheDependency>[1], id: string | number, publication = WEEKLY_WILDCAT_PUBLICATION) => routeCacheDependency(s, kind, id, publication).key;

describe("incremental keys follow actual render dependencies", () => {
  it("keeps all keys stable when inputs are equivalent, including a revision-only bump", async () => {
    const a = await snapshot(); const b = await snapshot();
    for (const p of a.posts) expect(key(a, "article", p.id)).toBe(key(b, "article", p.id, { ...WEEKLY_WILDCAT_PUBLICATION, revision: 100 }));
  });
  it.each(["title", "excerpt", "content", "media"])("invalidates a story and its archives after a %s change, preserving an unrelated article", async (field) => {
    const a = await snapshot();
    const unrelated = structuredClone(a.posts[0]);
    unrelated.id = 999; unrelated.slug = "unrelated"; unrelated.author = 999; unrelated.categories = [999]; unrelated.tags = [];
    unrelated._embedded = { author: [{ id: 999, name: "Unrelated writer", slug: "unrelated" }], "wp:term": [[{ ...fixture.categories[0], id: 999, slug: "other", taxonomy: "category" }]] };
    delete unrelated.contributors;
    const posts = [...a.posts, unrelated]; const before = await snapshot(posts);
    const edited = structuredClone(posts);
    if (field === "media") edited[0]._embedded!["wp:featuredmedia"] = [{ id: 88, source_url: "/test-assets/changed.jpg", media_details: {} } as any];
    else edited[0][field as "title" | "excerpt" | "content"].rendered += " Changed";
    const after = await snapshot(edited);
    expect(key(before, "article", posts[0].id)).not.toBe(key(after, "article", posts[0].id));
    expect(key(before, "category", 2)).not.toBe(key(after, "category", 2));
    expect(key(before, "author", "user:1")).not.toBe(key(after, "author", "user:1"));
    expect(key(before, "article", 999)).toBe(key(after, "article", 999));
  });
  it("invalidates articles showing a changed selected related card, but ignores an unrelated candidate body edit", async () => {
    const before = await snapshot();
    const selected = routeCacheDependency(before, "article", before.posts[0].id).dependencies as any;
    const relatedId = selected.related[0]; expect(relatedId).toBeDefined();
    const edited = structuredClone(before.posts);
    edited.find((p) => p.id === relatedId)!.title.rendered += " revised";
    expect(key(before, "article", before.posts[0].id)).not.toBe(key(await snapshot(edited), "article", before.posts[0].id));
    const bodyEdit = structuredClone(before.posts);
    bodyEdit.find((p) => p.id === relatedId)!.content.rendered += " invisible body change";
    expect(key(before, "article", before.posts[0].id)).toBe(key(await snapshot(bodyEdit), "article", before.posts[0].id));
  });
  it("invalidates articles and profiles displaying changed contributor information", async () => {
    const before = await snapshot(); const people = structuredClone(fixture.authors); people[0].description += " Updated bio";
    const after = await snapshot(before.posts, people);
    for (const p of before.posts.filter((p) => getPostContributors(p).some((c) => !isGuestContributor(c) && c.id === 1))) expect(key(before, "article", p.id)).not.toBe(key(after, "article", p.id));
    expect(key(before, "author", "user:1")).not.toBe(key(after, "author", "user:1"));
  });
  it("invalidates old and new categories on reassignment", async () => {
    const before = await snapshot(); const posts = structuredClone(before.posts); posts[0].categories = [999];
    const after = await snapshot(posts);
    for (const id of [2, 999]) expect(key(before, "category", id)).not.toBe(key(after, "category", id));
  });
  it("includes coverage contents and page contents", async () => {
    const coverage = { id: 1, slug: "election", title: "Election", stories: [] };
    const before = await snapshot(undefined, undefined, [coverage]);
    const after = await snapshot(undefined, undefined, [{ ...coverage, title: "Election updated" }]);
    expect(key(before, "coverage", "election")).not.toBe(key(after, "coverage", "election"));
    after.pages[0].content.rendered += " New page text";
    expect(key(before, "page", before.pages[0].slug)).not.toBe(key(after, "page", before.pages[0].slug));
  });
  it.each(["navigation", "seo", "branding", "appearance"])("invalidates every affected kind when global %s changes", async (field) => {
    const s = await snapshot(); const publication = structuredClone(WEEKLY_WILDCAT_PUBLICATION);
    (publication as any)[field] = { changed: true };
    for (const [kind, id] of [["article", s.posts[0].id], ["author", "user:1"], ["category", 2], ["page", s.pages[0].slug], ["coverage", "election"]] as const) expect(key(s, kind, id)).not.toBe(key(s, kind, id, publication));
  });
  it("invalidates canonical/form URLs when an effective public environment override changes", async () => {
    const s = await snapshot();
    const before = key(s, "article", s.posts[0].id);
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://changed.example.test");
    expect(key(s, "article", s.posts[0].id)).not.toBe(before);
    vi.unstubAllEnvs();
    const category = key(s, "category", 2);
    vi.stubEnv("NEXT_PUBLIC_WP_API_URL", "https://cms.changed.example.test/wp-json/wp/v2");
    expect(key(s, "category", 2)).not.toBe(category);
    vi.unstubAllEnvs();
  });
  it("refuses a deleted or unpublished article key", async () => {
    const s = await snapshot(); const id = s.posts[0].id;
    s.posts[0].status = "draft";
    expect(() => key(s, "article", id)).toThrow(/No public article/);
    s.posts.shift(); expect(() => key(s, "article", id)).toThrow(/No public article/);
  });
});
