import { describe, expect, it } from "vitest";
import {
  ARTICLE_BLOCKS,
  chapterHeight,
  chapterKind,
  chapterTone,
  featureMediaPhone,
  featureMediaPhoneOrder,
  featureMediaPlacement,
  featureMediaPresentation,
  finalizeBlock,
  photoPhone,
  pullQuotePresentation,
  validateArticleBody,
  type ArticleBlock,
  type ArticleBody,
  type MediaLookup
} from "../src";
import { FIXTURE_ARTICLE_BODY, FIXTURE_BLOCKS, FIXTURE_FEATURE_STORY_BODY, FIXTURE_MEDIA } from "../src/fixtures";

/**
 * The presentation model (docs/story-presentation.md): a few newsroom presets
 * per block, stored as semantic choices with safe defaults, so every body
 * saved before presets existed keeps its look and its exact serialization.
 */
const lookup: MediaLookup = (id) => FIXTURE_MEDIA[String(id)];
const finalize = (block: ArticleBlock) => finalizeBlock(block, lookup).block;
const body = (...nodes: ArticleBody["nodes"]): ArticleBody => ({ format: "byline-v1", version: 1, media: FIXTURE_MEDIA, nodes });
const errors = (...nodes: ArticleBody["nodes"]) => {
  const result = validateArticleBody(JSON.parse(JSON.stringify(body(...nodes))));
  return result.ok ? [] : result.errors;
};

describe("defaults read the way a block looked before presets existed", () => {
  it("keeps a column photo inset and lets wide and full photos reach a phone's edges", () => {
    expect(photoPhone({ placement: "column" })).toBe("inset");
    expect(photoPhone({ placement: "wide" })).toBe("bleed");
    expect(photoPhone({ placement: "full" })).toBe("bleed");
    expect(photoPhone({ placement: "full", phone: "inset" })).toBe("inset");
    expect(photoPhone({ placement: "column", phone: "bleed" })).toBe("bleed");
  });

  it("reads an old Portrait + Text as a Split, photo first, inset", () => {
    const legacy = FIXTURE_BLOCKS.portraitText;
    expect(featureMediaPresentation(legacy)).toBe("split");
    expect(featureMediaPhoneOrder(legacy)).toBe("media");
    expect(featureMediaPhone(legacy)).toBe("inset");
    expect(featureMediaPlacement(legacy)).toBe("wide");
  });

  it("gives each Feature Media preset its own phone behaviour, and Text first only to Split", () => {
    expect(featureMediaPhone({ presentation: "breakout" })).toBe("bleed");
    expect(featureMediaPhone({ presentation: "spotlight" })).toBe("bleed");
    expect(featureMediaPhone({ presentation: "sticky" })).toBe("inset");
    expect(featureMediaPhoneOrder({ presentation: "split", phoneOrder: "text" })).toBe("text");
    expect(featureMediaPhoneOrder({ presentation: "sticky", phoneOrder: "text" })).toBe("media");
    expect(featureMediaPlacement({ presentation: "spotlight" })).toBe("full");
  });

  it("reads an old Visual Chapter as a photo chapter with its original proportion and light words", () => {
    const legacy = FIXTURE_BLOCKS.visualChapter;
    expect(chapterKind(legacy)).toBe("media");
    expect(chapterHeight(legacy)).toBeUndefined();
    expect(chapterTone(legacy)).toBe("light");
    expect(chapterTone({ kind: "text" })).toBe("dark");
    expect(chapterTone({ kind: "split" })).toBe("dark");
    expect(chapterHeight({ kind: "text", height: "full" })).toBeUndefined();
  });

  it("reads an old Pull Quote as Standard", () => {
    expect(pullQuotePresentation(FIXTURE_BLOCKS.pullQuote)).toBe("standard");
  });

  it("falls back to the default for a value that is not a preset", () => {
    expect(photoPhone({ placement: "wide", phone: "sideways" as never })).toBe("bleed");
    expect(featureMediaPresentation({ presentation: "carousel" as never })).toBe("split");
    expect(pullQuotePresentation({ presentation: "giant" as never })).toBe("standard");
    expect(chapterKind({ kind: "section" as never })).toBe("media");
    expect(chapterHeight({ height: "tall" as never })).toBeUndefined();
  });
});

describe("finalizing keeps legacy bodies byte-identical", () => {
  it("adds nothing to a block saved before presets existed", () => {
    for (const type of ["photo", "portraitText", "visualChapter", "pullQuote", "gallery"] as const) {
      // The fixture blocks are the stored shape of stories saved before presets existed.
      expect(JSON.parse(JSON.stringify(finalize(FIXTURE_BLOCKS[type]))), type).toEqual(JSON.parse(JSON.stringify(FIXTURE_BLOCKS[type])));
      const finalized = finalize(FIXTURE_BLOCKS[type]) as Record<string, unknown>;
      for (const key of ["phone", "presentation", "phoneOrder", "tone", "scrim", "kind", "height"]) expect(finalized, `${type}.${key}`).not.toHaveProperty(key);
    }
  });

  it("stores a preset only when it differs from the default", () => {
    expect(finalize({ ...FIXTURE_BLOCKS.photo, phone: "auto" })).not.toHaveProperty("phone");
    expect(finalize({ ...FIXTURE_BLOCKS.photo, phone: "inset" })).toMatchObject({ phone: "inset" });
    expect(finalize({ ...FIXTURE_BLOCKS.pullQuote, presentation: "standard" })).not.toHaveProperty("presentation");
    expect(finalize({ ...FIXTURE_BLOCKS.pullQuote, presentation: "full" })).toMatchObject({ presentation: "full" });
    expect(finalize({ ...FIXTURE_BLOCKS.portraitText, presentation: "split", phone: "auto", scrim: "standard" })).not.toHaveProperty("presentation");
  });

  it("drops choices that do not apply to the chosen presentation", () => {
    const sticky = finalize({ ...FIXTURE_BLOCKS.portraitText, presentation: "sticky", phoneOrder: "text", tone: "dark", scrim: "strong" }) as Record<string, unknown>;
    expect(sticky).toMatchObject({ presentation: "sticky" });
    expect(sticky).not.toHaveProperty("phoneOrder");
    expect(sticky).not.toHaveProperty("tone");
    expect(sticky).not.toHaveProperty("scrim");
    expect(finalize({ ...FIXTURE_BLOCKS.portraitText, presentation: "spotlight", tone: "dark", scrim: "subtle" })).toMatchObject({ presentation: "spotlight", tone: "dark", scrim: "subtle" });
  });

  it("publishes a text chapter without a photograph, and drops one it no longer uses", () => {
    const text = finalizeBlock({ ...FIXTURE_BLOCKS.visualChapter, kind: "text", media: null, height: "full", scrim: "strong" }, lookup);
    expect(text.issues).toEqual([]);
    expect(text.block).toMatchObject({ kind: "text", media: null });
    expect(text.block).not.toHaveProperty("height");
    expect(text.block).not.toHaveProperty("scrim");
    // A photograph left in the stored fields after switching to text is never published.
    expect(finalize({ ...FIXTURE_BLOCKS.visualChapter, kind: "text" })).toMatchObject({ media: null });
  });

  it("still requires the photograph of a photo or split chapter", () => {
    for (const kind of ["media", "split"] as const) {
      const result = finalizeBlock({ ...FIXTURE_BLOCKS.visualChapter, kind, media: null }, lookup);
      expect(result.block).toBeNull();
      expect(result.issues[0]).toMatchObject({ effect: "omitted", code: "chapter-missing" });
    }
  });

  it("keeps a chapter's tone only when it is not the kind's own default", () => {
    expect(finalize({ ...FIXTURE_BLOCKS.visualChapter, tone: "light" })).not.toHaveProperty("tone");
    expect(finalize({ ...FIXTURE_BLOCKS.visualChapter, tone: "dark" })).toMatchObject({ tone: "dark" });
    expect(finalize({ ...FIXTURE_BLOCKS.visualChapter, kind: "text", media: null, tone: "dark" })).not.toHaveProperty("tone");
    expect(finalize({ ...FIXTURE_BLOCKS.visualChapter, kind: "text", media: null, tone: "light" })).toMatchObject({ tone: "light" });
  });
});

describe("the closed validator", () => {
  it("accepts the legacy fixture story and the feature fixture story", () => {
    expect(validateArticleBody(JSON.parse(JSON.stringify(FIXTURE_ARTICLE_BODY)))).toMatchObject({ ok: true });
    expect(validateArticleBody(JSON.parse(JSON.stringify(FIXTURE_FEATURE_STORY_BODY)))).toMatchObject({ ok: true });
  });

  it("refuses a value that is not one of the presets", () => {
    expect(errors({ ...FIXTURE_BLOCKS.photo, phone: "huge" as never }).join()).toMatch(/phone: must be one of auto, inset, bleed/);
    expect(errors({ ...FIXTURE_BLOCKS.pullQuote, presentation: "giant" as never }).join()).toMatch(/presentation: must be one of standard, breakout, full/);
    expect(errors({ ...FIXTURE_BLOCKS.visualChapter, height: "tall" as never }).join()).toMatch(/height: must be one of short, half, full/);
  });

  it("refuses a choice where it does not apply", () => {
    expect(errors({ ...FIXTURE_BLOCKS.portraitText, presentation: "sticky", phoneOrder: "text" }).join()).toMatch(/only Split chooses the order/);
    expect(errors({ ...FIXTURE_BLOCKS.portraitText, scrim: "strong" }).join()).toMatch(/only Spotlight sets words over the photo/);
    expect(errors({ ...FIXTURE_BLOCKS.visualChapter, kind: "text" }).join()).toMatch(/a text chapter has no photograph/);
    expect(errors({ ...FIXTURE_BLOCKS.visualChapter, media: null }).join()).toMatch(/needs its photograph/);
    expect(errors({ ...FIXTURE_BLOCKS.visualChapter, kind: "split", scrim: "subtle" }).join()).toMatch(/only a photo chapter has a scrim/);
  });

  it("never names a CSS class, size or colour in a stored presentation", () => {
    const stored = JSON.stringify(FIXTURE_FEATURE_STORY_BODY.nodes);
    for (const forbidden of ["alignwide", "alignfull", "px", "#", "rgb", "class", "style", "breakpoint"]) expect(stored.includes(`"${forbidden}`), forbidden).toBe(false);
  });
});

describe("Add menu language", () => {
  it("names the tools by what they do in a story", () => {
    expect(ARTICLE_BLOCKS.portraitText.label).toBe("Feature Media");
    expect(ARTICLE_BLOCKS.visualChapter.label).toBe("Chapter");
    for (const type of ["photo", "gallery", "portraitText", "pullQuote", "visualChapter", "keyFacts", "context", "timeline", "chartMap"] as const) {
      expect(ARTICLE_BLOCKS[type].description, type).not.toMatch(/\b(?:block|component|widget|css|layout engine)\b/i);
    }
  });

  it("finds the tools by the words reporters use", () => {
    const find = (word: string) => Object.values(ARTICLE_BLOCKS).filter((definition) => [definition.label, ...definition.aliases].some((alias) => alias.toLowerCase() === word)).map((definition) => definition.type);
    expect(find("feature image")).toEqual(["portraitText"]);
    expect(find("image and text")).toEqual(["portraitText"]);
    expect(find("spotlight")).toEqual(["portraitText"]);
    expect(find("sticky image")).toEqual(["portraitText"]);
    expect(find("chapter break")).toEqual(["visualChapter"]);
    expect(find("section break")).toEqual(["visualChapter"]);
    expect(find("full bleed")).toEqual(["photo"]);
    expect(find("edge to edge")).toEqual(["photo"]);
    expect(find("photo essay")).toEqual(["gallery"]);
    expect(find("quote")).toEqual(expect.arrayContaining(["pullQuote", "reportedQuote"]));
    // The old names still find their tools.
    expect(find("portrait")).toEqual(["portraitText"]);
    expect(find("visual chapter")).toEqual(["visualChapter"]);
  });
});
