import { describe, expect, it } from "vitest";
import {
  buildSearchFacets,
  getSearchUrl,
  highlightText,
  parseSearchUrlState,
  scoreSearchResult,
  searchIndex,
  type SearchIndexItem,
  type SearchUrlState
} from "@/lib/search";

function item(overrides: Partial<SearchIndexItem> = {}): SearchIndexItem {
  return {
    id: "story",
    kind: "story",
    title: "A story",
    excerpt: "A short excerpt",
    href: "/story/",
    category: "News",
    section: "news",
    sectionLabel: "News",
    author: "Alex Reporter",
    authorKey: "alex-reporter",
    topics: ["campus"],
    topicLabels: { campus: "Campus" },
    date: "January 1, 2026",
    sortDate: "2026-01-01T00:00:00Z",
    searchText: "a story a short excerpt news alex reporter campus",
    ...overrides
  };
}

const defaultState: SearchUrlState = {
  query: "",
  type: "all",
  section: "",
  author: "",
  topic: ""
};

describe("public search helpers", () => {
  it("keeps AND-match inclusion independent of query term order", () => {
    const items = [
      item({ id: "both", title: "Foo bar", searchText: "foo bar news" }),
      item({ id: "foo-only", title: "Foo only", searchText: "foo news" }),
      item({ id: "bar-only", title: "Bar only", searchText: "bar news" })
    ];

    const fooBar = searchIndex(items, { ...defaultState, query: "foo bar" }).map((result) => result.id);
    const barFoo = searchIndex(items, { ...defaultState, query: "bar foo" }).map((result) => result.id);

    expect(fooBar).toEqual(["both"]);
    expect(barFoo).toEqual(["both"]);
    expect(scoreSearchResult(items[2], ["foo", "bar"])).toBe(Number.NEGATIVE_INFINITY);
  });

  it("supports a bounded typo match without replacing exact matches", () => {
    const results = searchIndex(
      [
        item({ id: "exact", title: "Football preview", searchText: "football preview news" }),
        item({ id: "typo", title: "Footbal notes", searchText: "footbal notes news" })
      ],
      { ...defaultState, query: "football" }
    );

    expect(results.map((result) => result.id)).toEqual(["exact", "typo"]);
  });

  it("parses, validates, and serializes shareable search state", () => {
    const facets = buildSearchFacets([
      item(),
      item({ id: "second", author: "Morgan Editor", authorKey: "morgan-editor", topics: ["sports"] })
    ]);
    const state = parseSearchUrlState(
      "?q=Football%20  preview&type=story&section=news&author=alex-reporter&topic=campus&unknown=ignored",
      facets
    );

    expect(state).toEqual({
      query: "football preview",
      type: "story",
      section: "news",
      author: "alex-reporter",
      topic: "campus"
    });
    expect(getSearchUrl("/search/?utm_source=newsletter#results", state)).toBe(
      "/search/?utm_source=newsletter&q=football+preview&type=story&section=news&author=alex-reporter&topic=campus#results"
    );
    expect(parseSearchUrlState("?type=invalid&section=missing", facets)).toEqual(defaultState);
  });

  it("builds stable section, author, and topic facets", () => {
    const facets = buildSearchFacets([
      item(),
      item({ id: "second", section: "sports", sectionLabel: "Sports", author: "Alex Reporter", topics: ["campus", "soccer"] })
    ]);

    expect(facets.sections).toEqual([
      { value: "news", label: "News" },
      { value: "sports", label: "Sports" }
    ]);
    expect(facets.authors).toEqual([{ value: "alex-reporter", label: "Alex Reporter" }]);
    expect(facets.topics).toEqual([
      { value: "campus", label: "Campus" },
      { value: "soccer", label: "soccer" }
    ]);
  });

  it("exposes and matches individual contributors on multi-byline stories", () => {
    const multiByline = item({
      author: "Alex Reporter, Morgan Editor",
      authorKey: "alex-reporter,morgan-editor",
      authorOptions: [
        { value: "alex-reporter", label: "Alex Reporter" },
        { value: "morgan-editor", label: "Morgan Editor" }
      ]
    });
    const facets = buildSearchFacets([multiByline]);

    expect(facets.authors).toEqual([
      { value: "alex-reporter", label: "Alex Reporter" },
      { value: "morgan-editor", label: "Morgan Editor" }
    ]);
    expect(searchIndex([multiByline], { ...defaultState, author: "morgan-editor" })).toHaveLength(1);
  });

  it("returns safe text pieces for highlighting instead of HTML", () => {
    expect(highlightText("<foo> & bar", ["foo"])).toEqual([
      { text: "<", matched: false },
      { text: "foo", matched: true },
      { text: "> & bar", matched: false }
    ]);
  });
});
