import { describe, expect, it } from "vitest";
import {
  createSearchIndexDocument,
  parseSearchIndexDocument,
  SEARCH_INDEX_SCHEMA_VERSION,
  SEARCH_INDEX_URL
} from "@/lib/search-index";

const item = {
  id: 42,
  kind: "story" as const,
  title: "A representative story",
  excerpt: "A bounded excerpt.",
  href: "/2026/01/01/news/representative-story/",
  category: "News",
  section: "news",
  sectionLabel: "News",
  author: "Staff",
  authorKey: "staff",
  date: "January 1, 2026",
  sortDate: "2026-01-01T00:00:00Z",
  searchTokens: ["representative"]
};

describe("static search index contract", () => {
  it("creates and parses the versioned document shape", () => {
    const document = createSearchIndexDocument([item]);

    expect(SEARCH_INDEX_SCHEMA_VERSION).toBe(1);
    expect(SEARCH_INDEX_URL).toBe("/_byline/search-index.json");
    expect(parseSearchIndexDocument(JSON.parse(JSON.stringify(document)))).toEqual(document);
  });

  it("rejects incompatible versions and malformed items", () => {
    expect(() => parseSearchIndexDocument({ schemaVersion: 2, items: [] })).toThrow(/schema/i);
    expect(() => parseSearchIndexDocument({ schemaVersion: 1, items: [{ title: "missing required fields" }] })).toThrow(/invalid item/i);
    expect(() => parseSearchIndexDocument({ schemaVersion: 1, items: [{ ...item, searchText: "duplicated searchable text" }] })).toThrow(/invalid item/i);
  });
});
