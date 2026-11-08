import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ARTICLE_BLOCK_FAMILIES,
  ARTICLE_BLOCK_TYPES,
  ARTICLE_BLOCKS,
  ARTICLE_BLOCK_LIMITS,
  compactInline,
  finalizeBlock,
  isArticleBlockType,
  mediaCredit,
  paragraphsFromText,
  periodStarts,
  safeHref,
  type ArticleBlock,
  type MediaLookup
} from "../src";
import { FIXTURE_ARTICLE_BODY, FIXTURE_BLOCKS, FIXTURE_INTERACTIVE_KEY, FIXTURE_MEDIA, FIXTURE_REFERENCES } from "../src/fixtures";

const lookup: MediaLookup = (id) => FIXTURE_MEDIA[String(id)];
const refs = { story: (id: number | string) => FIXTURE_REFERENCES.stories?.[String(id)] ?? null, poll: (id: number | string) => FIXTURE_REFERENCES.polls?.[String(id)] ?? null, interactive: (key: string) => key === FIXTURE_INTERACTIVE_KEY };
const sourceDir = join(import.meta.dirname, "../src");

describe("the contract stays provider-neutral", () => {
  it("imports nothing but itself", () => {
    for (const file of readdirSync(sourceDir)) {
      const source = readFileSync(join(sourceDir, file), "utf8");
      const imports = [...source.matchAll(/(?:from|import)\s+["']([^"']+)["']/g)].map((match) => match[1]);
      for (const specifier of imports) expect(specifier, `${file} imports ${specifier}`).toMatch(/^\.\//);
      // No CMS, editor, framework or presentation vocabulary in code (comments may explain the boundary).
      const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
      expect(code, file).not.toMatch(/payload|lexical|react|next\/|astro|wordpress|wp-block|className/i);
    }
  });

  it("registers every block once, with a family and newsroom label", () => {
    expect(Object.keys(ARTICLE_BLOCKS).sort()).toEqual([...ARTICLE_BLOCK_TYPES].sort());
    const families = new Set(ARTICLE_BLOCK_FAMILIES.map((family) => family.id));
    for (const type of ARTICLE_BLOCK_TYPES) {
      expect(ARTICLE_BLOCKS[type].type).toBe(type);
      expect(families.has(ARTICLE_BLOCKS[type].family)).toBe(true);
      expect(ARTICLE_BLOCKS[type].label).not.toBe("");
      expect(isArticleBlockType(type)).toBe(true);
    }
    expect(isArticleBlockType("scrollytelling")).toBe(false);
    expect(isArticleBlockType("interactive")).toBe(false);
    expect(isArticleBlockType("footnotes")).toBe(false);
    expect(isArticleBlockType("photoEssay")).toBe(false);
  });

  it("never stores a photograph's credit in a block (Chart / Map has its own graphic credit line)", () => {
    const blocks = [FIXTURE_BLOCKS.photo, FIXTURE_BLOCKS.gallery, FIXTURE_BLOCKS.portraitText, FIXTURE_BLOCKS.visualChapter, FIXTURE_BLOCKS.annotatedImage, FIXTURE_BLOCKS.beforeAfter, FIXTURE_BLOCKS.audio, FIXTURE_BLOCKS.document];
    expect(JSON.stringify(blocks)).not.toMatch(/"credit"/);
  });
});

describe("credits come from the asset", () => {
  it("prefers the creator, then the credit line, without a lead-in", () => {
    expect(mediaCredit({ creator: "Maya Torres", credit: "Weekly Wildcat" })).toBe("Maya Torres");
    expect(mediaCredit({ creator: " ", credit: "Photo by Jordan Lee" })).toBe("Jordan Lee");
    expect(mediaCredit({ credit: "Photo: AP" })).toBe("AP");
    expect(mediaCredit({})).toBe("");
  });
});

describe("text helpers", () => {
  it("splits plain text into paragraphs at blank lines", () => {
    expect(paragraphsFromText("One.\r\n\r\nTwo\nlines.")).toEqual([
      { type: "paragraph", children: [{ type: "text", text: "One." }] },
      { type: "paragraph", children: [{ type: "text", text: "Two" }, { type: "lineBreak" }, { type: "text", text: "lines." }] }
    ]);
    expect(paragraphsFromText("   ")).toEqual([]);
  });

  it("merges equal runs and trims edge breaks", () => {
    expect(compactInline([{ type: "lineBreak" }, { type: "text", text: "a" }, { type: "text", text: "b" }, { type: "text", text: "" }, { type: "text", text: "c", bold: true }])).toEqual([
      { type: "text", text: "ab" },
      { type: "text", text: "c", bold: true }
    ]);
  });

  it("only allows links readers can safely follow", () => {
    expect(safeHref("https://example.org/a b")).toBe("https://example.org/a%20b");
    expect(safeHref("/news/story")).toBe("/news/story");
    expect(safeHref("#part-2")).toBe("#part-2");
    expect(safeHref("javascript:alert(1)")).toBeNull();
    expect(safeHref("data:text/html,x")).toBeNull();
    expect(safeHref("//evil.example")).toBeNull();
  });
});

describe("publishing keeps only complete blocks", () => {
  it("passes every fixture block unchanged", () => {
    for (const type of ARTICLE_BLOCK_TYPES) {
      // A draft Video carries the editors' captions flag; publishing removes it.
      const draft = type === "video" ? { ...FIXTURE_BLOCKS.video, captionsConfirmed: true } : FIXTURE_BLOCKS[type];
      const { block, issues } = finalizeBlock(draft, lookup, refs);
      expect(issues, type).toEqual([]);
      expect(block, type).toEqual(FIXTURE_BLOCKS[type]);
    }
  });

  it("omits a photo without a photograph, or with a non-image", () => {
    expect(finalizeBlock({ ...FIXTURE_BLOCKS.photo, media: null }, lookup)).toMatchObject({ block: null, issues: [{ effect: "omitted", code: "photo-missing" }] });
    expect(finalizeBlock({ ...FIXTURE_BLOCKS.photo, media: 201 }, lookup).block).toBeNull();
    expect(finalizeBlock({ ...FIXTURE_BLOCKS.photo, media: 999 }, lookup).issues[0]?.code).toBe("photo-unavailable");
  });

  it("drops empty gallery slots and omits a gallery with fewer than two photographs", () => {
    const gallery = { ...FIXTURE_BLOCKS.gallery, items: [...FIXTURE_BLOCKS.gallery.items, { id: "g3", media: null, caption: "" }] };
    const result = finalizeBlock(gallery, lookup);
    expect(result.block && "items" in result.block ? result.block.items.map((item) => item.id) : null).toEqual(["g1", "g2"]);
    expect(result.issues).toMatchObject([{ effect: "dropped", itemId: "g3" }]);
    expect(finalizeBlock({ ...FIXTURE_BLOCKS.gallery, items: FIXTURE_BLOCKS.gallery.items.slice(0, 1) }, lookup).block).toBeNull();
  });

  it("requires quote text, and an attribution for a reported quote", () => {
    expect(finalizeBlock({ ...FIXTURE_BLOCKS.reportedQuote, text: "  " }, lookup).issues[0]?.code).toBe("quote-empty");
    expect(finalizeBlock({ ...FIXTURE_BLOCKS.reportedQuote, attribution: "" }, lookup).issues[0]?.code).toBe("quote-unattributed");
    expect(finalizeBlock({ ...FIXTURE_BLOCKS.pullQuote, attribution: "" }, lookup).block).toMatchObject({ type: "pullQuote", attribution: undefined });
  });

  it("never publishes empty fact rows, and defaults the heading", () => {
    const result = finalizeBlock({ ...FIXTURE_BLOCKS.keyFacts, heading: " ", facts: [{ id: "a", text: " " }, { id: "b", text: "One fact." }] }, lookup);
    expect(result.block).toEqual({ type: "keyFacts", id: "blk-facts", heading: "Key facts", facts: [{ id: "b", text: "One fact." }] });
    expect(finalizeBlock({ ...FIXTURE_BLOCKS.keyFacts, facts: [] }, lookup).block).toBeNull();
  });

  it("requires a PDF for a document and drops invalid page references", () => {
    expect(finalizeBlock({ ...FIXTURE_BLOCKS.document, media: 101 }, lookup).issues[0]?.code).toBe("document-incompatible");
    const result = finalizeBlock({ ...FIXTURE_BLOCKS.document, pages: [{ id: "x", page: 0, label: "Cover" }, { id: "y", page: 2, label: " Table\n2 " }] }, lookup);
    expect(result.block && "pages" in result.block ? result.block.pages : null).toEqual([{ id: "y", page: 2, label: "Table 2" }]);
  });

  it("never publishes stub timeline events, and keeps one latest event", () => {
    const items = [
      { id: "a", label: "2024", title: "First", body: "", current: true },
      { id: "b", label: "2025", title: "", body: "", current: false },
      { id: "c", label: "2026", title: "Third", body: "", current: true }
    ];
    const result = finalizeBlock({ type: "timeline", id: "t", items }, lookup);
    expect(result.block && "items" in result.block ? result.block.items.map((item) => [item.id, item.current]) : null).toEqual([["a", true], ["c", false]]);
    expect(result.issues).toMatchObject([{ code: "timeline-stub", itemId: "b" }]);
    expect(finalizeBlock({ type: "timeline", id: "t", items: items.slice(0, 2) }, lookup).issues.at(-1)?.code).toBe("timeline-too-short");
  });

  it("bounds repeated content", () => {
    const facts = Array.from({ length: ARTICLE_BLOCK_LIMITS.factsMax + 3 }, (_, index) => ({ id: String(index), text: `Fact ${index}` }));
    const result = finalizeBlock({ ...FIXTURE_BLOCKS.keyFacts, facts }, lookup).block as Extract<ArticleBlock, { type: "keyFacts" }>;
    expect(result.facts).toHaveLength(ARTICLE_BLOCK_LIMITS.factsMax);
  });
});

describe("timeline periods", () => {
  it("rules a new year only after a published event that named one", () => {
    expect(periodStarts(FIXTURE_BLOCKS.timeline.items)).toEqual([false, false, false, true]);
  });
});
