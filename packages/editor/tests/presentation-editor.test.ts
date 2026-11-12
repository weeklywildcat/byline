import { describe, expect, it } from "vitest";
import { chapterChoices, featureMediaChoices, type ArticleBlock, type MediaId } from "@byline/article-body";
import { FIXTURE_BLOCKS, FIXTURE_FEATURE_STORY_BODY, FIXTURE_MEDIA } from "@byline/article-body/fixtures";
import { articleBlockFromFields, BLOCK_FIELD_READERS, NEW_BLOCK_FIELDS, withNewBlockFields } from "../src/fields";
import { normalizePayloadArticleBody } from "../src/normalize";
import { BYLINE_BODY_BLOCKS } from "../src/schema";
import { blockFields, lexicalFromArticleBody } from "./lexical-fixture";

/**
 * The Payload adapter's side of the presentation model
 * (docs/story-presentation.md): stored fields read with safe defaults, old
 * blocks stay byte-identical, new blocks start on the recommended preset, and
 * Payload never stamps a default onto a story saved before a preset existed.
 */
const media = (id: MediaId) => FIXTURE_MEDIA[String(id)] ?? null;
const normalize = (state: unknown) => normalizePayloadArticleBody(state, { media });
const PRESET_FIELDS = { photo: ["phone"], pullQuote: ["presentation"], portraitText: ["presentation", "phoneOrder", "phone", "tone", "scrim"], visualChapter: ["kind", "height", "tone", "scrim"] } as const;

describe("stored fields", () => {
  it("read an old block with the defaults that keep its look", () => {
    expect(BLOCK_FIELD_READERS.photo(blockFields(FIXTURE_BLOCKS.photo))).toMatchObject({ phone: "auto" });
    expect(BLOCK_FIELD_READERS.pullQuote(blockFields(FIXTURE_BLOCKS.pullQuote))).toMatchObject({ presentation: "standard" });
    expect(BLOCK_FIELD_READERS.portraitText(blockFields(FIXTURE_BLOCKS.portraitText))).toMatchObject({ presentation: "split", phoneOrder: "media", phone: "auto", tone: "light", scrim: "standard" });
    expect(BLOCK_FIELD_READERS.visualChapter(blockFields(FIXTURE_BLOCKS.visualChapter))).toMatchObject({ kind: "media", height: null, tone: null, scrim: "standard" });
  });

  it("fall back safely from a value that is not a preset (or Payload's null)", () => {
    expect(BLOCK_FIELD_READERS.photo({ ...blockFields(FIXTURE_BLOCKS.photo), phone: "huge" })).toMatchObject({ phone: "auto" });
    expect(BLOCK_FIELD_READERS.portraitText({ ...blockFields(FIXTURE_BLOCKS.portraitText), presentation: null, scrim: 7 })).toMatchObject({ presentation: "split", scrim: "standard" });
    expect(BLOCK_FIELD_READERS.visualChapter({ ...blockFields(FIXTURE_BLOCKS.visualChapter), kind: "section", height: "tall" })).toMatchObject({ kind: "media", height: null });
  });

  it("round-trip every block of a legacy story to exactly the same semantic block", () => {
    for (const type of ["photo", "gallery", "portraitText", "visualChapter", "pullQuote"] as const) {
      const block = FIXTURE_BLOCKS[type] as ArticleBlock;
      expect(articleBlockFromFields(type, block.id, blockFields(block)), type).toEqual(JSON.parse(JSON.stringify(block)));
      // And Lexical never gains a presentation field the story did not have.
      const stored = blockFields(block);
      for (const field of (PRESET_FIELDS as Record<string, readonly string[]>)[type] ?? []) expect(stored, `${type}.${field}`).not.toHaveProperty(field);
    }
  });

  it("round-trip every preset of the feature story through Lexical and back", () => {
    const result = normalize(lexicalFromArticleBody(FIXTURE_FEATURE_STORY_BODY));
    expect(result.issues).toEqual([]);
    expect(result.body.nodes).toEqual(JSON.parse(JSON.stringify(FIXTURE_FEATURE_STORY_BODY.nodes)));
  });

  it("never publish a photograph a text chapter no longer uses", () => {
    const stored = { ...blockFields(FIXTURE_BLOCKS.visualChapter), kind: "text" };
    expect(articleBlockFromFields("visualChapter", "chapter", stored)).toMatchObject({ kind: "text", media: null });
    expect(articleBlockFromFields("visualChapter", "chapter", stored)).not.toHaveProperty("altOverride");
  });
});

describe("Payload block configs", () => {
  it("offer each preset as a plain select with no default and no requirement (old blocks keep their look)", () => {
    for (const [type, names] of Object.entries(PRESET_FIELDS)) {
      for (const name of names) {
        const field = BYLINE_BODY_BLOCKS[type as keyof typeof PRESET_FIELDS].fields.find((entry) => "name" in entry && entry.name === name) as { type?: string; defaultValue?: unknown; required?: unknown; options?: unknown[] } | undefined;
        expect(field?.type, `${type}.${name}`).toBe("select");
        expect(field, `${type}.${name}`).not.toHaveProperty("defaultValue");
        expect(field?.required, `${type}.${name}`).toBeFalsy();
        expect(field?.options?.length, `${type}.${name}`).toBeGreaterThan(1);
      }
    }
  });

  it("let a text chapter publish without a photograph, and no other chapter", () => {
    const field = BYLINE_BODY_BLOCKS.visualChapter.fields.find((entry) => "name" in entry && entry.name === "media") as { validate: (value: unknown, options: { siblingData: Record<string, unknown> }) => true | string };
    expect(field.validate(null, { siblingData: { kind: "text" } })).toBe(true);
    expect(field.validate(null, { siblingData: { kind: "media" } })).toMatch(/text chapter/);
    expect(field.validate(null, { siblingData: {} })).toMatch(/text chapter/);
    expect(field.validate(12, { siblingData: { kind: "split" } })).toBe(true);
  });

  it("use the registry's newsroom names", () => {
    expect(BYLINE_BODY_BLOCKS.portraitText.labels).toEqual({ singular: "Feature Media", plural: "Feature Media" });
    expect(BYLINE_BODY_BLOCKS.visualChapter.labels).toEqual({ singular: "Chapter", plural: "Chapter" });
    // The stored slugs never change: every saved story keeps working.
    expect(BYLINE_BODY_BLOCKS.portraitText.slug).toBe("portraitText");
    expect(BYLINE_BODY_BLOCKS.visualChapter.slug).toBe("visualChapter");
  });
});

describe("new blocks", () => {
  it("start a Chapter at Half screen, without touching what the insertion already set", () => {
    expect(NEW_BLOCK_FIELDS.visualChapter).toEqual({ kind: "media", height: "half" });
    expect(withNewBlockFields({ blockType: "visualChapter", blockName: "" })).toMatchObject({ kind: "media", height: "half" });
    expect(withNewBlockFields({ blockType: "visualChapter", kind: "text" })).toMatchObject({ kind: "text", height: "half" });
    expect(withNewBlockFields({ blockType: "visualChapter", height: "full" })).toMatchObject({ height: "full" });
    expect(withNewBlockFields({ blockType: "photo" })).toEqual({ blockType: "photo" });
  });
});

describe("only the choices that apply", () => {
  it("show Text first only for Split, words-over-photo only for Spotlight", () => {
    expect(featureMediaChoices("split")).toContain("phoneOrder");
    expect(featureMediaChoices("sticky")).not.toContain("phoneOrder");
    expect(featureMediaChoices("spotlight")).toEqual(expect.arrayContaining(["tone", "scrim", "crops"]));
    expect(featureMediaChoices("spotlight")).not.toContain("side");
    for (const presentation of ["split", "breakout", "sticky"] as const) expect(featureMediaChoices(presentation)).not.toContain("scrim");
  });

  it("show a chapter's height and scrim only where a photograph carries them", () => {
    expect(chapterChoices("text")).not.toContain("height");
    expect(chapterChoices("text")).not.toContain("crops");
    expect(chapterChoices("split")).not.toContain("scrim");
    expect(chapterChoices("media")).toEqual(expect.arrayContaining(["height", "scrim", "crops"]));
  });
});
