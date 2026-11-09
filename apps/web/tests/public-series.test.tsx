import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ArticleView } from "@byline/ui";
import { buildSnapshot } from "@byline/content";
import { buildArticlePresentation, buildArticleSeries } from "@/lib/article-presentation";
import { buildCoveragePresentation } from "@/lib/coverage-presentation";
import { routeCacheDependency } from "@/lib/route-cache";
import { WEEKLY_WILDCAT_PUBLICATION } from "@/lib/publication";
import { getPostContributors, getPostReportingNote, normalizePublicCoverage, type ArchiveCoverage, type ArchivePost } from "@/lib/public-content";
import type { WebBuildSnapshot } from "@/lib/build-snapshot";
import fixture from "./fixtures/weekly-wildcat-content.json";

const posts = structuredClone(fixture.posts) as ArchivePost[];
const [first, second, third, fourth, fifth] = posts;

/** The public coverage projection WordPress sends (and the build snapshot stores). */
function coverage(values: { id?: number; slug?: string; title?: string; format?: string; status?: string; stories: ArchivePost[]; overview?: string; description?: string }): ArchiveCoverage {
  const normalized = normalizePublicCoverage({
    id: values.id ?? 41,
    slug: values.slug ?? "lunch-squeeze",
    title: values.title ?? "The Lunch Squeeze",
    description: values.description ?? "Why the cafeteria line keeps getting longer.",
    overview: values.overview ?? "",
    status: values.status ?? "active",
    ...(values.format ? { format: values.format } : {}),
    artwork: null,
    stories: values.stories
  });
  if (!normalized) throw new Error("fixture coverage did not normalize");
  return normalized;
}

function withNote(post: ArchivePost, reportingNote: unknown): ArchivePost {
  return { ...post, byline: { ...(post.byline ?? {}), reportingNote } };
}

function presentationFor(post: ArchivePost, coverages: ArchiveCoverage[], allPosts = posts) {
  return buildArticlePresentation({ post, allPosts, contributors: getPostContributors(post), author: null, coverages });
}

describe("public coverage format", () => {
  it("reads as ongoing coverage unless WordPress says series", () => {
    expect(coverage({ stories: [first] }).format).toBe("coverage");
    expect(coverage({ format: "series", stories: [first] }).format).toBe("series");
    expect(coverage({ format: "magazine", stories: [first] }).format).toBe("coverage");
  });

  it("keeps the overview's paragraphs and the status", () => {
    const value = coverage({ stories: [first], overview: "<p>First <strong>paragraph</strong>.</p>\n<p>Second paragraph.</p>", status: "past" });
    expect(value.overviewParagraphs).toEqual(["First paragraph .", "Second paragraph."]);
    expect(value.status).toBe("past");
  });
});

describe("a story in a series", () => {
  const series = coverage({ format: "series", stories: [first, second, third] });

  it("knows its part, the parts around it, and promises no total while the series is running", () => {
    const view = buildArticleSeries(second, [series], posts)!;
    expect(view).toMatchObject({ format: "series", title: "The Lunch Squeeze", href: "/coverage/lunch-squeeze/", position: 2, total: 3, complete: false });
    expect(view.parts.map((part) => [part.id, part.number, part.current])).toEqual([[first.id, 1, false], [second.id, 2, true], [third.id, 3, false]]);
    expect(view.previous?.id).toBe(first.id);
    expect(view.next).toMatchObject({ id: third.id, number: 3 });
  });

  it("states the total once the series is finished, and the last part has no next part", () => {
    const finished = coverage({ format: "series", status: "past", stories: [first, second, third] });
    const view = buildArticleSeries(third, [finished], posts)!;
    expect(view.complete).toBe(true);
    expect(view.next).toBeNull();
    const markup = renderToStaticMarkup(<ArticleView presentation={presentationFor(third, [finished])} />);
    expect(markup).toContain("Part 3 of 3");
    expect(markup).toContain("You’ve reached the end of the series.");
  });

  it("numbers only stories readers can open", () => {
    // The public site never shows the "Hello world" placeholder, even when it is published.
    const hidden = { ...second, slug: "hello-world" } as ArchivePost;
    const view = buildArticleSeries(third, [series], posts.map((post) => post.id === second.id ? hidden : post))!;
    expect(view.parts.map((part) => [part.id, part.number])).toEqual([[first.id, 1], [third.id, 2]]);
    expect(view.position).toBe(2);
  });

  it("prefers a series over ongoing coverage, and is not a series when in neither", () => {
    const ongoing = coverage({ id: 42, slug: "budget", title: "Budget", stories: [second, fourth] });
    expect(buildArticleSeries(second, [ongoing, series], posts)?.format).toBe("series");
    expect(buildArticleSeries(fifth, [ongoing, series], posts)).toBeNull();
  });

  it("does not repeat the other parts as related stories", () => {
    const presentation = presentationFor(second, [series]);
    const partIds = new Set([first.id, third.id]);
    expect(presentation.relatedStories.some((story) => partIds.has(Number(story.id)))).toBe(false);
  });

  it("renders the kicker, the next part and every part with this one marked", () => {
    const markup = renderToStaticMarkup(<ArticleView presentation={presentationFor(second, [series])} />);
    expect(markup).toContain('class="article-series-label"><a href="/coverage/lunch-squeeze/">The Lunch Squeeze</a><span>Part 2</span>');
    expect(markup).toContain("A series · 3 parts so far");
    expect(markup).toMatch(/class="article-series-next[^"]*" href="[^"]+">/);
    expect(markup).toContain("Next: Part 3");
    expect(markup).toContain('aria-current="page"');
    expect(markup.match(/class="article-series-part-number"/g)).toHaveLength(3);
  });
});

describe("a story in ongoing coverage", () => {
  it("lists the other stories, newest first, and links to the coverage", () => {
    const ongoing = coverage({ stories: [first, second, third, fourth, fifth] });
    const view = buildArticleSeries(third, [ongoing], posts)!;
    expect(view.format).toBe("coverage");
    expect(view.parts.map((part) => part.id)).not.toContain(third.id);
    expect(view.parts.length).toBeLessThanOrEqual(4);
    const dates = view.parts.map((part) => new Date(part.date ?? 0).getTime());
    expect([...dates].sort((left, right) => right - left)).toEqual(dates);
    const markup = renderToStaticMarkup(<ArticleView presentation={presentationFor(third, [ongoing])} />);
    expect(markup).toContain("More coverage");
    expect(markup).toContain("All 5 stories");
    expect(markup).not.toContain("Part 3");
  });
});

describe("How we reported this", () => {
  it("splits the note into paragraphs and ignores anything that is not text", () => {
    expect(getPostReportingNote(withNote(first, "We interviewed 14 students.\r\n\r\n  We read the budget.  \n\n\n"))).toEqual(["We interviewed 14 students.", "We read the budget."]);
    expect(getPostReportingNote(withNote(first, ["not", "text"]))).toEqual([]);
    expect(getPostReportingNote(first)).toEqual([]);
  });

  it("prints after the story only when the author wrote one, as text", () => {
    const withReporting = withNote(first, "We talked to <b>14</b> students.");
    const markup = renderToStaticMarkup(<ArticleView presentation={presentationFor(withReporting, [])} />);
    expect(markup).toContain("How we reported this");
    expect(markup).toContain("We talked to &lt;b&gt;14&lt;/b&gt; students.");
    expect(markup.indexOf("article-body")).toBeLessThan(markup.indexOf("article-reporting-note"));
    expect(renderToStaticMarkup(<ArticleView presentation={presentationFor(first, [])} />)).not.toContain("How we reported this");
  });
});

describe("coverage page", () => {
  it("counts parts honestly and starts the reader at Part 1", () => {
    const running = buildCoveragePresentation(coverage({ format: "series", stories: [first, second] }), posts);
    expect(running.countLabel).toBe("2 parts so far");
    expect(running.stories.map((story) => story.number)).toEqual([1, 2]);
    expect(running.startHref).toBe(running.stories[0].href);
    expect(buildCoveragePresentation(coverage({ format: "series", status: "archived", stories: [first, second] }), posts).countLabel).toBe("2 parts");
    expect(buildCoveragePresentation(coverage({ stories: [first] }), posts).countLabel).toBe("1 story");
  });
});

describe("incremental rendering", () => {
  async function snapshot(coverages: ArchiveCoverage[], snapshotPosts = posts): Promise<WebBuildSnapshot> {
    const personKey = (p: { id: number | string; type?: string }) => `${p.type === "guest" ? "guest" : "user"}:${p.id}`;
    return buildSnapshot({
      loaders: { posts: async () => structuredClone(snapshotPosts), contributors: async () => structuredClone(fixture.authors), categories: async () => structuredClone(fixture.categories) as any, tags: async () => [], corrections: async () => [], pages: async () => structuredClone(fixture.pages), sports: async () => ({ games: [], teams: [], rosters: [], teamMedia: [], coverages }), games: (sports) => sports.games },
      accessors: { postId: (p) => p.id, postSlug: (p) => p.slug, postCategoryIds: (p) => p.categories, postTagIds: (p) => p.tags, postContributorIds: (p) => getPostContributors(p).map(personKey), contributorId: personKey, categoryId: (c: any) => c.id, tagId: (t: any) => t.id, pageSlug: (p) => p.slug, correctionPostId: () => null, gameId: () => 0, gameSport: () => "", gameSeason: () => "", gameTeamKeys: () => [], gameDate: () => "" },
      routes: () => [], globalDependencies: {}
    }) as Promise<WebBuildSnapshot>;
  }
  const key = (s: WebBuildSnapshot, kind: "article" | "coverage", id: string | number) => routeCacheDependency(s, kind, id, WEEKLY_WILDCAT_PUBLICATION).key;

  it("re-renders a part when a new part is published, and the series page when a part's photo changes", async () => {
    const before = await snapshot([coverage({ format: "series", stories: [first, second] })]);
    const after = await snapshot([coverage({ format: "series", stories: [first, second, third] })]);
    expect(key(before, "article", second.id)).not.toBe(key(after, "article", second.id));
    expect(key(before, "article", fifth.id)).toBe(key(after, "article", fifth.id));

    const retitled = posts.map((post) => post.id === first.id ? { ...post, title: { rendered: "A new headline" } } : post);
    const series = [coverage({ format: "series", stories: [first, second] })];
    expect(key(await snapshot(series), "coverage", "lunch-squeeze")).not.toBe(key(await snapshot(series, retitled), "coverage", "lunch-squeeze"));
  });

  it("re-renders a story when its reporting note changes", async () => {
    const before = await snapshot([]);
    const after = await snapshot([], posts.map((post) => post.id === first.id ? withNote(post, "We read the minutes.") : post));
    expect(key(before, "article", first.id)).not.toBe(key(after, "article", first.id));
  });
});
