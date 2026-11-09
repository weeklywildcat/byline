import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { createHeadlessEditor } from "@payloadcms/richtext-lexical/lexical/headless";
import { describe, expect, it } from "vitest";
import { ARTICLE_BLOCK_TYPES, ARTICLE_BLOCKS, finalizeBlock, type ArticleBlock, type ArticleBody, type ArticleMediaAsset } from "@byline/article-body";
import { FIXTURE_ARTICLE_BODY, FIXTURE_BLOCKS, FIXTURE_INTERACTIVE_KEY, FIXTURE_MEDIA, FIXTURE_TRACKER_KEY, FIXTURE_REFERENCES } from "@byline/article-body/fixtures";
import { ARTICLE_BLOCK_RENDERERS } from "@byline/ui/article-body";
import { articleBlockFromFields, BLOCK_FIELD_READERS, BLOCK_TO_ARTICLE, mediaIdOf } from "../src/fields";
import { duplicateItem, insertItem, moveDirection, moveItem, removeItem, setOnlyCurrent } from "../src/items";
import { articleMediaFromPayload, collectMediaIds, collectMediaUses, normalizePayloadArticleBody, normalizePayloadStoryBody } from "../src/normalize";
import { BYLINE_BLOCK_COMPONENT, BYLINE_BODY_BLOCKS } from "../src/schema";
import { blockFields, lexicalFromArticleBody } from "./lexical-fixture";

const media = (id: string | number) => FIXTURE_MEDIA[String(id)] ?? null;
const references = { story: (id: string | number) => FIXTURE_REFERENCES.stories?.[String(id)] ?? null, poll: (id: string | number) => FIXTURE_REFERENCES.polls?.[String(id)] ?? null, event: (id: string | number) => FIXTURE_REFERENCES.events?.[String(id)] ?? null, interactive: (key: string) => key === FIXTURE_INTERACTIVE_KEY, tracker: (key: string) => key === FIXTURE_TRACKER_KEY };
const sourceFiles = (dir: string): string[] => readdirSync(dir).flatMap((name) => {
  const path = join(dir, name);
  return statSync(path).isDirectory() ? sourceFiles(path) : [path];
});
const SRC = join(import.meta.dirname, "../src");
const importsOf = (file: string) => [...readFileSync(file, "utf8").matchAll(/(?:from|import)\s+["']([^"']+)["']/g)].map((match) => match[1] as string);

describe("one registry, every adapter", () => {
  it("has a Payload block, a field reader, a normalizer, an editor and a renderer for every registered type", () => {
    const types = [...ARTICLE_BLOCK_TYPES].sort();
    expect(Object.keys(BYLINE_BODY_BLOCKS).sort()).toEqual(types);
    expect(Object.keys(BLOCK_FIELD_READERS).sort()).toEqual(types);
    expect(Object.keys(BLOCK_TO_ARTICLE).sort()).toEqual(types);
    expect(Object.keys(ARTICLE_BLOCK_RENDERERS).sort()).toEqual(types);
    // The editors map is client code; read its keys from source rather than loading Payload's client bundle.
    const editors = readFileSync(join(SRC, "client/BylineStoryBlock.tsx"), "utf8").match(/BLOCK_EDITORS[^=]*=\s*{([^}]*)}/)?.[1] ?? "";
    expect(editors.split(",").map((entry) => entry.split(":")[0]?.trim()).filter(Boolean).sort()).toEqual(types);
  });

  it("names, labels and draws each Payload block from the registry, through the one Byline component", () => {
    for (const type of ARTICLE_BLOCK_TYPES) {
      const block = BYLINE_BODY_BLOCKS[type];
      expect(block.slug).toBe(type);
      expect(block.labels?.singular).toBe(ARTICLE_BLOCKS[type].label);
      expect(block.admin?.components?.Block).toBe(BYLINE_BLOCK_COMPONENT);
      expect(block.admin?.disableBlockName).toBe(true);
      expect(String((block.admin as { images?: { icon?: { url?: string } } })?.images?.icon?.url)).toMatch(/^data:image\/svg\+xml,/);
    }
  });
});

describe("the media contract", () => {
  const fieldNames = (fields: unknown[]): string[] => fields.flatMap((field) => {
    const value = field as { name?: string; fields?: unknown[] };
    return [value.name ?? "", ...(value.fields ? fieldNames(value.fields) : [])];
  });

  it("never stores a credit in a Photo, Gallery or Document block", () => {
    for (const type of ["photo", "gallery", "document"] as const) {
      expect(fieldNames(BYLINE_BODY_BLOCKS[type].fields)).not.toContain("credit");
    }
    const { body } = normalizePayloadArticleBody(lexicalFromArticleBody(FIXTURE_ARTICLE_BODY), { media, references });
    // A graphic's own credit line belongs to Chart / Map (an embed has no Media); photographs' credits never do.
    expect(JSON.stringify(body.nodes.filter((node) => node.type !== "chartMap"))).not.toContain("credit");
  });

  it("relates block media to the Media collection, images for photos and PDFs for documents", () => {
    const upload = (type: "photo" | "document") => BYLINE_BODY_BLOCKS[type].fields.find((field) => "name" in field && field.name === "media") as { type: string; relationTo: string; filterOptions: unknown };
    expect(upload("photo")).toMatchObject({ type: "upload", relationTo: "media", filterOptions: { mimeType: { contains: "image/" } } });
    expect(upload("document")).toMatchObject({ type: "upload", relationTo: "media", filterOptions: { mimeType: { equals: "application/pdf" } } });
  });

  it("resolves a Payload Media document's credit from creator, then credit line", () => {
    const asset = articleMediaFromPayload({ id: 7, mimeType: "image/jpeg", filename: "a.jpg", width: 10, height: 5, alt: " Alt ", creator: "", credit: "Photo by Jordan Lee", artDirection: { version: 1, focalPoint: { x: 30, y: 50 }, crops: {} } }, (doc) => `/api/media/file/${doc.filename as string}`);
    expect(asset).toEqual({ id: 7, kind: "image", src: "/api/media/file/a.jpg", width: 10, height: 5, mimeType: "image/jpeg", filename: "a.jpg", filesize: null, alt: "Alt", credit: "Jordan Lee", focalPoint: { x: 30, y: 50 } } satisfies ArticleMediaAsset);
  });

  it("collects referenced media IDs, populated or not", () => {
    const state = lexicalFromArticleBody(FIXTURE_ARTICLE_BODY);
    expect(collectMediaIds(state).map(Number).sort((a, b) => a - b)).toEqual([101, 103, 104, 105, 106, 107, 108, 201, 202]);
    expect(mediaIdOf({ id: "12", filename: "x.jpg" })).toBe(12);
  });

  it("tracks story-specific alt text for each Media use", () => {
    const state = {
      root: {
        children: [
          { type: "block", fields: { id: "a", blockType: "photo", media: 12, caption: "", altOverride: "Story-specific description", placement: "column" } },
          { type: "block", fields: { id: "b", blockType: "photo", media: 12, caption: "", altOverride: "", placement: "column" } },
          { type: "block", fields: { id: "c", blockType: "gallery", fit: "natural", items: [{ id: "g", media: 13, caption: "", altOverride: "Gallery description" }] } }
        ]
      }
    };
    expect(collectMediaUses(state)).toEqual([
      { id: 12, hasAltOverride: true },
      { id: 12, hasAltOverride: false },
      { id: 13, hasAltOverride: true }
    ]);
  });

  it("offers the full Media details editor from a Photo's More menu", () => {
    const source = readFileSync(join(SRC, "client/blocks/media.tsx"), "utf8");
    expect(source).toContain("Edit media details…");
    expect(source).toContain("useEditMediaDetails()");
    expect(source).toContain("menuItems={editMediaDetails");
  });
});

describe("Payload Lexical → byline-v1", () => {
  it("opens an empty imported body in Lexical while keeping the public body empty", () => {
    const article: ArticleBody = { format: "byline-v1", version: 1, nodes: [], media: {} };
    const state = lexicalFromArticleBody(article);
    const editor = createHeadlessEditor();
    expect(() => editor.setEditorState(editor.parseEditorState(JSON.stringify(state)))).not.toThrow();
    expect(normalizePayloadArticleBody(state, { media })).toEqual({ body: article, issues: [] });
  });

  it("round-trips the fixture story exactly, in order", () => {
    const { body, issues } = normalizePayloadArticleBody(lexicalFromArticleBody(FIXTURE_ARTICLE_BODY), { media, references });
    expect(issues).toEqual([]);
    expect(body).toEqual({ ...FIXTURE_ARTICLE_BODY, media: Object.fromEntries(Object.entries(FIXTURE_MEDIA).filter(([key]) => key !== "102")) });
  });

  it("emits no editor or Payload metadata", () => {
    const state = lexicalFromArticleBody(FIXTURE_ARTICLE_BODY);
    // Payload may add these to a stored block; none is article content.
    const block = (state.root.children as Array<{ type: string; fields?: Record<string, unknown> }>).find((node) => node.type === "block");
    Object.assign(block!.fields!, { blockName: "Lead photo", _components: { Block: "x" }, media: { id: 101, filename: "private.jpg", createdAt: "2026-01-01" } });
    const json = JSON.stringify(normalizePayloadArticleBody(state, { media, references }).body);
    for (const leak of ["blockName", "_components", "private.jpg", "createdAt", "blockType"]) expect(json).not.toContain(leak);
  });

  it("reports unsupported nodes instead of dropping them silently", () => {
    const state = { root: { type: "root", children: [
      { type: "paragraph", children: [{ type: "text", text: "Kept.", format: 16 }] },
      { type: "horizontalrule" },
      { type: "block", fields: { id: "x", blockType: "scrollytelling" } },
      { type: "heading", tag: "h4", children: [{ type: "text", text: "Small" }] },
      { type: "paragraph", children: [{ type: "link", fields: { url: "javascript:alert(1)", linkType: "custom" }, children: [{ type: "text", text: "bad" }] }] }
    ] } };
    const { body, issues } = normalizePayloadArticleBody(state, { media });
    expect(issues.map((issue) => (issue.kind === "block" ? issue.issue.code : `${issue.kind}:${"nodeType" in issue ? issue.nodeType : "format" in issue ? issue.format : issue.href}`))).toEqual([
      "unsupported-format:code",
      "unsupported-node:horizontalrule",
      "unsupported-node:block:scrollytelling",
      "unsupported-node:heading:h4",
      "unsafe-link:javascript:alert(1)"
    ]);
    // Text survives; unsafe links lose only their link.
    expect(body.nodes).toEqual([
      { type: "paragraph", children: [{ type: "text", text: "Kept." }] },
      { type: "heading", level: 3, children: [{ type: "text", text: "Small" }] },
      { type: "paragraph", children: [{ type: "text", text: "bad" }] }
    ]);
  });

  it("leaves unfinished blocks out of the public body and says why", () => {
    const unfinished: ArticleBlock[] = [{ ...FIXTURE_BLOCKS.photo, media: null }, { type: "timeline", id: "t", items: [{ id: "a", label: "2026", title: "", body: "", current: false }] }];
    const state = { root: { type: "root", children: unfinished.map((block) => ({ type: "block", fields: blockFields(block) })) } };
    const { body, issues } = normalizePayloadArticleBody(state, { media });
    expect(body.nodes).toEqual([]);
    expect(body.media).toEqual({});
    expect(issues.filter((issue) => issue.kind === "block").map((issue) => issue.kind === "block" && issue.issue.code)).toEqual(["photo-missing", "timeline-stub", "timeline-too-short"]);
  });

  it("never sends legacy-html stories through the Lexical normalizer", () => {
    const story = { contentFormat: "legacy-html", legacyHtml: "<p>Imported</p>", body: lexicalFromArticleBody(FIXTURE_ARTICLE_BODY) };
    expect(normalizePayloadStoryBody(story, { media })).toEqual({ body: { format: "legacy-html", html: "<p>Imported</p>" }, issues: [] });
    expect(normalizePayloadStoryBody({ contentFormat: "byline-v1", body: lexicalFromArticleBody(FIXTURE_ARTICLE_BODY) }, { media }).body.format).toBe("byline-v1");
  });
});

describe("stored fields", () => {
  it("start new blocks with what a writer needs to fill", () => {
    expect(BLOCK_FIELD_READERS.timeline({}).items).toHaveLength(2);
    expect(BLOCK_FIELD_READERS.keyFacts({}).facts).toEqual([{ id: "draft-0", text: "" }]);
    expect(BLOCK_FIELD_READERS.context({})).toEqual({ heading: "Context", body: [] });
    // A Context saved before formatting existed holds plain text: it reads as paragraphs.
    expect(BLOCK_FIELD_READERS.context({ body: "One.\n\nTwo." }).body).toHaveLength(2);
    expect(BLOCK_FIELD_READERS.photo({ placement: "giant" }).placement).toBe("column");
    // Re-reading never invents new row IDs (React keys and focus depend on them).
    expect(BLOCK_FIELD_READERS.timeline({}).items.map((item) => item.id)).toEqual(BLOCK_FIELD_READERS.timeline({}).items.map((item) => item.id));
  });

  it("map back to the same published block", () => {
    for (const type of ARTICLE_BLOCK_TYPES) {
      const block = FIXTURE_BLOCKS[type];
      const draft = articleBlockFromFields(type, block.id, blockFields(block)) as ArticleBlock;
      expect(finalizeBlock(draft, media, references).block, type).toEqual(block);
    }
  });
});

describe("native slash discovery", () => {
  // Payload 3.92.1's slash menu matches a query against an item's label and its
  // keywords (`["block", "blocks", slug]` for BlocksFeature blocks), with spaces,
  // hyphens and underscores ignored. Byline relies only on labels and slugs.
  const items = ARTICLE_BLOCK_TYPES.map((type) => ({ label: ARTICLE_BLOCKS[type].label, keywords: ["block", "blocks", BYLINE_BODY_BLOCKS[type].slug] }));
  const normalize = (value: string) => value.toLowerCase().replace(/[\s\-_]/g, "");
  const find = (query: string) => items.filter((item) => [item.label, ...item.keywords].some((word) => normalize(word).includes(normalize(query)))).map((item) => item.label);

  it.each([
    ["photo", ["Photo", "Photo Gallery"]],
    ["gallery", ["Photo Gallery"]],
    ["quote", ["Reported Quote", "Pull Quote"]],
    ["facts", ["Key Facts"]],
    ["context", ["Context"]],
    ["doc", ["Document (PDF)"]],
    ["pdf", ["Document (PDF)"]],
    ["timeline", ["Timeline"]],
    ["chart", ["Chart / Map"]],
    ["table", ["Data Table"]],
    ["video", ["Video"]],
    ["poll", ["Poll"]],
    ["interactive", ["Repository Interactive"]]
  ])("/%s finds %j", (query, expected) => {
    expect(find(query)).toEqual(expected);
  });
});

describe("ordered items", () => {
  it("insert, move, duplicate and remove with focus following the change", () => {
    expect(insertItem(["a", "b"], 1, "x", 5)).toEqual({ items: ["a", "x", "b"], focus: 1 });
    expect(insertItem(["a", "b"], 1, "x", 2)).toEqual({ items: ["a", "b"], focus: 1 });
    expect(moveItem(["a", "b", "c"], 2, -1)).toEqual({ items: ["a", "c", "b"], focus: 1 });
    expect(moveItem(["a", "b"], 0, -1)).toEqual({ items: ["a", "b"], focus: 0 });
    expect(duplicateItem(["a"], 0, (item) => `${item}2`, 5)).toEqual({ items: ["a", "a2"], focus: 1 });
    expect(removeItem(["a", "b", "c"], 2)).toEqual({ items: ["a", "b"], focus: 1 });
    expect(removeItem(["a"], 0, () => "blank")).toEqual({ items: ["blank"], focus: 0 });
    expect(setOnlyCurrent([{ current: true }, { current: false }], 1, true)).toEqual([{ current: false }, { current: true }]);
    expect(moveDirection({ altKey: true, shiftKey: true, key: "ArrowUp" })).toBe(-1);
    expect(moveDirection({ altKey: false, shiftKey: true, key: "ArrowUp" })).toBe(0);
  });
});

describe("package boundaries", () => {
  it("keeps the normalizer, fields and schema free of React and private Payload paths", () => {
    for (const file of ["normalize.ts", "fields.ts", "items.ts"]) {
      // @byline/core is pure (no React, CMS or runtime): the art-direction intent is read from it.
      for (const specifier of importsOf(join(SRC, file))) expect(specifier, file).toMatch(/^(?:\.\/|@byline\/article-body$|@byline\/core$)/);
    }
    for (const specifier of importsOf(join(SRC, "schema.ts"))) expect(specifier).toMatch(/^(?:\.\/|@byline\/article-body$|@byline\/core$|payload$)/);
  });

  it("never imports Payload's private source paths, Views or JSX converters", () => {
    for (const file of sourceFiles(SRC).filter((path) => /\.(ts|tsx)$/.test(path))) {
      for (const specifier of importsOf(file)) {
        expect(specifier, file).not.toMatch(/@payloadcms\/[^/]+\/(?:src|dist)\//);
        expect(specifier, file).not.toMatch(/richtext-lexical\/(?:react|html|html-async|rsc|migrate)$/);
      }
    }
  });
});
