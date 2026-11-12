import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ARTICLE_BLOCK_TYPES, ARTICLE_BODY_FORMAT, articleOutline, inlineText, type ArticleBlock, type ArticleBody } from "@byline/article-body";
import { FIXTURE_BLOCKS, FIXTURE_FEATURE_STORY_BODY, FIXTURE_MEDIA } from "@byline/article-body/fixtures";
import { ARTICLE_BLOCK_RENDERERS, articleBlockFrameClassNameOf, StructuredArticleBody, type ArticleRenderHost } from "@byline/ui/article-body";

/**
 * Every presentation preset (docs/story-presentation.md) as the one shared
 * renderer draws it for the public site and Live Preview: semantic structure,
 * the frame classes and data attributes the shared CSS reads, source order,
 * responsive image sizes and art-directed crops. Geometry at real widths is
 * checked in the browser (story-presentation.spec.ts).
 */
const body = (...nodes: ArticleBody["nodes"]): ArticleBody => ({ format: ARTICLE_BODY_FORMAT, version: 1, media: FIXTURE_MEDIA, nodes });
const render = (node: ArticleBlock, host?: ArticleRenderHost) => renderToStaticMarkup(<StructuredArticleBody body={body(node)} host={host} />);
const frame = (html: string) => /<div class="([^"]+)" data-block-type/.exec(html)?.[1].split(" ") ?? [];
const sizesOf = (html: string) => /<img [^>]*sizes="([^"]+)"/.exec(html)?.[1];

describe("Photo", () => {
  it("keeps a column photo inset on a phone and lets wide and full photos reach the edges (Auto)", () => {
    expect(frame(render({ ...FIXTURE_BLOCKS.photo, placement: "column" }))).not.toContain("byline-frame-bleed");
    expect(frame(render({ ...FIXTURE_BLOCKS.photo, placement: "wide" }))).toEqual(["byline-block", "byline-block-photo", "alignwide", "byline-frame-bleed"]);
    expect(frame(render({ ...FIXTURE_BLOCKS.photo, placement: "full" }))).toEqual(["byline-block", "byline-block-photo", "alignfull", "byline-frame-bleed"]);
  });

  it("follows an explicit Inset or Edge to edge choice", () => {
    expect(frame(render({ ...FIXTURE_BLOCKS.photo, placement: "full", phone: "inset" }))).not.toContain("byline-frame-bleed");
    expect(frame(render({ ...FIXTURE_BLOCKS.photo, placement: "column", phone: "bleed" }))).toEqual(["byline-block", "byline-block-photo", "byline-frame-bleed"]);
  });

  it("keeps its caption a semantic caption and its sizes matched to its width", () => {
    const html = render({ ...FIXTURE_BLOCKS.photo, placement: "column", phone: "bleed" });
    expect(html).toMatch(/<figure class="byline-photo"><img [^>]+><figcaption><p class="byline-caption">/);
    expect(sizesOf(html)).toBe("(min-width: 800px) 760px, 100vw");
    expect(sizesOf(render({ ...FIXTURE_BLOCKS.photo, placement: "full" }))).toBe("100vw");
  });
});

describe("Feature Media", () => {
  it("renders an old Portrait + Text exactly as before: a Split, photo first", () => {
    const html = render(FIXTURE_BLOCKS.portraitText);
    expect(html).toContain('<div class="byline-portrait-text" data-side="left"><figure class="byline-portrait-text-figure">');
    expect(html).not.toMatch(/data-(presentation|phone-order|tone|scrim)=/);
    expect(frame(html)).toEqual(["byline-block", "byline-block-portraitText", "alignwide"]);
    expect(sizesOf(html)).toBe("(min-width: 1080px) 416px, (min-width: 640px) 40vw, 100vw");
  });

  it("puts the passage first in the source when a Split reads text first on a phone", () => {
    const html = render({ ...FIXTURE_BLOCKS.portraitText, phoneOrder: "text" });
    expect(html).toContain('data-phone-order="text"');
    expect(html.indexOf("byline-portrait-text-body")).toBeLessThan(html.indexOf("byline-portrait-text-figure"));
  });

  it("draws each preset with its own frame, phone behaviour and image sizes", () => {
    const breakout = render({ ...FIXTURE_BLOCKS.portraitText, presentation: "breakout" });
    expect(breakout).toContain('data-presentation="breakout"');
    expect(frame(breakout)).toEqual(["byline-block", "byline-block-portraitText", "alignwide", "byline-frame-bleed"]);
    expect(sizesOf(breakout)).toBe("(min-width: 1080px) 700px, (min-width: 900px) 66vw, 100vw");

    const sticky = render({ ...FIXTURE_BLOCKS.portraitText, presentation: "sticky", side: "right" });
    expect(sticky).toContain('data-presentation="sticky"');
    expect(frame(sticky)).not.toContain("byline-frame-bleed");
    // Sticky reads photo then passage everywhere it does not stick: the source order never depends on the side.
    expect(sticky.indexOf("byline-portrait-text-figure")).toBeLessThan(sticky.indexOf("byline-portrait-text-body"));
    expect(sizesOf(sticky)).toBe("(min-width: 1080px) 470px, (min-width: 740px) 45vw, 100vw");

    const spotlight = render({ ...FIXTURE_BLOCKS.portraitText, presentation: "spotlight", tone: "dark", scrim: "strong" });
    expect(spotlight).toContain('data-presentation="spotlight" data-tone="dark" data-scrim="strong"');
    expect(frame(spotlight)).toEqual(["byline-block", "byline-block-portraitText", "alignfull", "byline-frame-bleed"]);
    expect(sizesOf(spotlight)).toBe("100vw");
    // The words stay real text after the photo and its caption: no text baked into an image.
    expect(spotlight).toMatch(/<figure class="byline-portrait-text-figure"><img [^>]+alt="A junior laughs[^"]*"[^>]*><figcaption>.*<\/figcaption><\/figure><div class="byline-portrait-text-body">/);
  });

  it("gives a spotlight the standard light scrim when none was chosen", () => {
    expect(render({ ...FIXTURE_BLOCKS.portraitText, presentation: "spotlight" })).toContain('data-tone="light" data-scrim="standard"');
  });
});

describe("Chapter", () => {
  it("draws a photo chapter's height, words and scrim", () => {
    const html = render({ ...FIXTURE_BLOCKS.visualChapter, height: "full", tone: "dark", scrim: "subtle" });
    expect(html).toContain('<section class="byline-visual-chapter" id="chapter-blk-chapter" data-align="bottom-left" data-height="full" data-tone="dark" data-scrim="subtle" aria-labelledby="blk-chapter-heading">');
    expect(frame(html)).toContain("byline-frame-bleed");
  });

  it("draws a text chapter with no photograph, no credit and no height, its heading still an H2", () => {
    const html = render({ ...FIXTURE_BLOCKS.visualChapter, kind: "text", media: null, altOverride: undefined });
    expect(html).toContain('data-kind="text"');
    expect(html).not.toContain("<img");
    expect(html).not.toContain("byline-visual-chapter-media");
    expect(html).not.toContain("photo-credit");
    expect(html).not.toContain("data-height");
    expect(html).toContain('<h2 id="blk-chapter-heading">What the district can do</h2>');
    // On the page it is a break in the column; on a dark band it reaches a phone's edges.
    expect(frame(html)).not.toContain("byline-frame-bleed");
    expect(frame(render({ ...FIXTURE_BLOCKS.visualChapter, kind: "text", media: null, tone: "light" }))).toContain("byline-frame-bleed");
  });

  it("draws a split chapter photograph first, with a half-width image", () => {
    const html = render({ ...FIXTURE_BLOCKS.visualChapter, kind: "split", height: "short" });
    expect(html).toContain('data-kind="split" data-height="short"');
    expect(html.indexOf("byline-visual-chapter-media")).toBeLessThan(html.indexOf("byline-visual-chapter-text"));
    expect(sizesOf(html)).toBe("(min-width: 900px) 50vw, 100vw");
  });

  it("is listed in the story's outline whatever its kind", () => {
    const outline = articleOutline(FIXTURE_FEATURE_STORY_BODY.nodes, inlineText);
    expect(outline.map((entry) => entry.text)).toEqual(expect.arrayContaining(["The third window", "What changed, and what didn't", "The middle school is watching"]));
  });
});

describe("Pull Quote", () => {
  it("keeps Standard in the column and widens Breakout and Full", () => {
    const standard = render(FIXTURE_BLOCKS.pullQuote);
    expect(standard).toContain('<figure class="byline-pull-quote"><blockquote>');
    expect(frame(standard)).toEqual(["byline-block", "byline-block-pullQuote"]);
    for (const presentation of ["breakout", "full"] as const) {
      const html = render({ ...FIXTURE_BLOCKS.pullQuote, presentation });
      expect(html).toContain(`<figure class="byline-pull-quote" data-presentation="${presentation}"><blockquote>`);
      expect(frame(html)).toEqual(["byline-block", "byline-block-pullQuote", "alignwide"]);
    }
  });
});

describe("Gallery", () => {
  it("lets a Photo Essay and a Featured lead reach a phone's edges, and keeps a grid inset", () => {
    expect(frame(render({ ...FIXTURE_BLOCKS.gallery, layout: "essay" }))).toContain("byline-frame-bleed");
    expect(frame(render({ ...FIXTURE_BLOCKS.gallery, layout: "featured" }))).toContain("byline-frame-bleed");
    expect(frame(render({ ...FIXTURE_BLOCKS.gallery, layout: "grid" }))).not.toContain("byline-frame-bleed");
    expect(frame(render(FIXTURE_BLOCKS.gallery))).not.toContain("byline-frame-bleed");
  });
});

describe("art direction through the host", () => {
  const crops = new Set(["103:wide", "106:portrait", "106:wide"]);
  const host: ArticleRenderHost = {
    imageSources: (asset, _sizes, shape) => {
      if (!shape) return { src: `/media/${asset.id}-1920.webp`, srcSet: `/media/${asset.id}-960.webp 960w, /media/${asset.id}-1920.webp 1920w` };
      return crops.has(`${asset.id}:${shape}`) ? { src: `/media/${asset.id}-${shape}-1920.webp`, srcSet: `/media/${asset.id}-${shape}-1080.webp 1080w, /media/${asset.id}-${shape}-1920.webp 1920w` } : undefined;
    }
  };

  it("serves a photo chapter's Portrait crop to phones and its Wide crop to wide screens", () => {
    const html = render({ ...FIXTURE_BLOCKS.visualChapter, media: 106, height: "full" }, host);
    expect(html).toContain('<picture><source media="(max-width: 640px)" srcSet="/media/106-portrait-1080.webp 1080w, /media/106-portrait-1920.webp 1920w" sizes="100vw" data-shape="portrait"/><source media="(min-width: 641px)" srcSet="/media/106-wide-1080.webp 1080w, /media/106-wide-1920.webp 1920w" sizes="100vw" data-shape="wide"/><img src="/media/106-1920.webp"');
  });

  it("falls back to the natural files at the focal point when no crop was drawn", () => {
    const html = render({ ...FIXTURE_BLOCKS.visualChapter, media: 102 }, host);
    expect(html).not.toContain("<picture>");
    expect(html).toContain('srcSet="/media/102-960.webp 960w, /media/102-1920.webp 1920w"');
  });

  it("uses a Spotlight's Wide crop on wide screens only, and never crops a Split or a Photo", () => {
    expect(render({ ...FIXTURE_BLOCKS.portraitText, presentation: "spotlight" }, host)).toContain('<source media="(min-width: 641px)" srcSet="/media/103-wide-1080.webp');
    expect(render({ ...FIXTURE_BLOCKS.portraitText, presentation: "spotlight" }, host)).not.toContain('data-shape="portrait"');
    expect(render(FIXTURE_BLOCKS.portraitText, host)).not.toContain("<picture>");
    expect(render({ ...FIXTURE_BLOCKS.photo, media: 106, placement: "full" }, host)).not.toContain("<picture>");
  });
});

describe("the editor and the public page frame a block the same way", () => {
  it("derives the frame from stored fields exactly as from the semantic block", () => {
    const cases: ArticleBlock[] = [
      { ...FIXTURE_BLOCKS.photo, placement: "column", phone: "bleed" },
      { ...FIXTURE_BLOCKS.portraitText, presentation: "spotlight" },
      { ...FIXTURE_BLOCKS.portraitText, presentation: "sticky" },
      { ...FIXTURE_BLOCKS.visualChapter, kind: "text", media: null, tone: "light" },
      { ...FIXTURE_BLOCKS.pullQuote, presentation: "full" },
      { ...FIXTURE_BLOCKS.gallery, layout: "essay" }
    ];
    for (const block of cases) expect(frame(render(block)).join(" "), `${block.type}`).toBe(articleBlockFrameClassNameOf(block as never));
  });

  it("has a renderer for every registered block", () => {
    for (const type of ARTICLE_BLOCK_TYPES) expect(typeof ARTICLE_BLOCK_RENDERERS[type], type).toBe("function");
  });
});

describe("the feature fixture story", () => {
  it("alternates reading with every preset, and returns to reading after each moment", () => {
    const html = renderToStaticMarkup(<StructuredArticleBody body={FIXTURE_FEATURE_STORY_BODY} />);
    for (const marker of ['data-presentation="breakout"', 'data-presentation="spotlight"', 'data-presentation="sticky"', 'data-kind="text"', 'data-kind="split"', 'data-height="full"', 'class="byline-pull-quote" data-presentation="breakout"', 'class="byline-pull-quote" data-presentation="full"', 'data-layout="essay"', 'class="byline-gallery is-cropped"']) expect(html, marker).toContain(marker);
    const nodes = FIXTURE_FEATURE_STORY_BODY.nodes;
    nodes.forEach((node, index) => {
      if (node.type === "paragraph") return;
      expect(nodes[index + 1]?.type, `reading resumes after ${"id" in node ? node.id : node.type}`).toBe("paragraph");
    });
  });
});
