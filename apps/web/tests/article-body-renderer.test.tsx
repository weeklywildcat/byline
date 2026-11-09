import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ARTICLE_BLOCK_TYPES, ARTICLE_BODY_FORMAT, type ArticleBody } from "@byline/article-body";
import { FIXTURE_ARTICLE_BODY, FIXTURE_BLOCKS, FIXTURE_MEDIA } from "@byline/article-body/fixtures";
import { ARTICLE_BLOCK_RENDERERS, StructuredArticleBody, articleBlockFrameClassName } from "@byline/ui/article-body";

const render = (body: ArticleBody) => renderToStaticMarkup(<div className="byline-article-view"><StructuredArticleBody body={body} /></div>);
const only = (node: ArticleBody["nodes"][number]): ArticleBody => ({ format: ARTICLE_BODY_FORMAT, version: 1, media: FIXTURE_MEDIA, nodes: [node] });

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}

describe("the canonical ArticleBody renderer", () => {
  it("has exactly one renderer for every registered block", () => {
    expect(Object.keys(ARTICLE_BLOCK_RENDERERS).sort()).toEqual([...ARTICLE_BLOCK_TYPES].sort());
  });

  it("never imports a CMS, an editor engine or a framework other than React", () => {
    const uiSource = join(import.meta.dirname, "../../../packages/ui/src");
    for (const file of files(uiSource).filter((path) => /\.(ts|tsx)$/.test(path))) {
      const source = readFileSync(file, "utf8");
      expect(source, file).not.toMatch(/from\s+["'](?:payload|@payloadcms\/|lexical|@lexical\/|next\/|@wordpress\/)/);
    }
  });

  it("renders the fixture story in reading order with the shared structure", () => {
    const html = render(FIXTURE_ARTICLE_BODY);
    expect(html.startsWith('<div class="byline-article-view"><div class="article-body"><p>The bell')).toBe(true);
    const order = ["The bell", "byline-block-photo", "Cafeteria staff", "byline-reported-quote", "A kitchen built", "<ul>", "byline-gallery", "byline-key-facts", "byline-pull-quote", "byline-context", "What the district", "byline-document", "byline-timeline", "keep eating"];
    const positions = order.map((needle) => html.indexOf(needle));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it("renders inline meaning and only safe links", () => {
    const html = render(only({ type: "paragraph", children: [{ type: "text", text: "a", italic: true }, { type: "text", text: "b", bold: true, italic: true }, { type: "link", href: "javascript:alert(1)", children: [{ type: "text", text: "c" }] }, { type: "lineBreak" }, { type: "link", href: "/news", children: [{ type: "text", text: "d" }] }] }));
    expect(html).toContain("<p><em>a</em><strong><em>b</em></strong>c<br/><a href=\"/news\">d</a></p>");
  });

  it("places a wide photo in a breakout frame and prints the credit from Media", () => {
    const html = render(only(FIXTURE_BLOCKS.photo));
    expect(html).toContain(`<div class="${articleBlockFrameClassName("photo", "wide")}" data-block-type="photo"><figure class="byline-photo"><img src="newsroom-panorama.jpg" alt="Students wait`);
    expect(html).toContain('<figcaption><p class="byline-caption">By 11:42');
    expect(html).toContain('<p class="photo-credit">Photo: Maya Torres</p>');
    expect(render(only({ ...FIXTURE_BLOCKS.photo, placement: "full" }))).toContain('class="byline-block byline-block-photo alignfull"');
    expect(render(only({ ...FIXTURE_BLOCKS.photo, placement: "column" }))).toContain('class="byline-block byline-block-photo"');
  });

  it("uses an alt override for one use only, and prints no credit line without a credit", () => {
    const html = render(only({ ...FIXTURE_BLOCKS.photo, media: 105, altOverride: "Lunch trays." }));
    expect(html).toContain('alt="Lunch trays."');
    expect(html).not.toContain("photo-credit");
  });

  it("pairs two gallery photographs, each with its caption and credit", () => {
    const html = render(only(FIXTURE_BLOCKS.gallery));
    expect(html).toContain('<div class="byline-block byline-block-gallery alignwide" data-block-type="gallery"><div class="byline-gallery is-pair" data-layout="grid">');
    expect(html.match(/<figure class="byline-gallery-item">/g)).toHaveLength(2);
    expect(html).toContain("Photo: Jordan Lee");
    expect(render(only({ ...FIXTURE_BLOCKS.gallery, fit: "crop" }))).toContain('class="byline-gallery is-cropped is-pair"');
    // A gallery saved before layouts existed has none, and renders exactly as a grid.
    expect(render(only({ ...FIXTURE_BLOCKS.gallery, layout: undefined }))).toContain('<div class="byline-gallery is-pair" data-layout="grid">');
  });

  it("draws quotes and supporting context in the shared family", () => {
    const { sourceUrl: _url, sourceLabel: _label, ...plainQuote } = FIXTURE_BLOCKS.reportedQuote;
    expect(render(only(plainQuote))).toContain('<blockquote class="byline-reported-quote"><p>We are feeding');
    expect(render(only(plainQuote))).toContain("<cite>Denise Royal, Greenwood cafeteria manager</cite></blockquote>");
    // Quote → attribution → an optional, restrained source link.
    expect(render(only(FIXTURE_BLOCKS.reportedQuote))).toContain('<cite>Denise Royal, Greenwood cafeteria manager</cite><p class="byline-quote-source">Source: <a href="https://example.org/board/2025-10-21-minutes" rel="noopener">School board minutes, Oct. 21</a></p></blockquote>');
    expect(render(only(FIXTURE_BLOCKS.pullQuote))).toContain('<figure class="byline-pull-quote"><blockquote><p>Some days');
    const facts = render(only(FIXTURE_BLOCKS.keyFacts));
    expect(facts).toContain('<aside class="byline-key-facts" aria-labelledby="blk-facts-heading"><h2 id="blk-facts-heading">Key facts</h2><ul><li>Greenwood serves');
    const context = render(only(FIXTURE_BLOCKS.context));
    expect(context).toContain('<aside class="byline-context" aria-labelledby="blk-context-heading"><h2 id="blk-context-heading">Why it matters</h2><p>Research');
  });

  it("always links the document directly, with structured page references", () => {
    const html = render(only(FIXTURE_BLOCKS.document));
    expect(html).toContain('<a href="document.pdf">Nutrition Services budget request, 2026</a>');
    expect(html).toContain('<a href="document.pdf#page=4">Page 4</a><span class="byline-document-page-text"><span class="byline-document-page-label">Wait times by school and lunch period</span><span class="byline-document-page-excerpt">Greenwood&#x27;s second lunch has the longest average wait in the district, 14 minutes.</span></span>');
    // The excerpt is the reporter's words about the page; nothing claims the PDF itself is highlighted.
    expect(html).not.toMatch(/highlight/i);
    expect(html).toContain('<a class="byline-document-open" href="document.pdf">Open the document</a>');
    expect(html).toContain('<object data="document.pdf#view=FitH" type="application/pdf"');
    expect(html).toContain("Source: Greenwood School District");
  });

  it("marks the latest event and a new year on the timeline", () => {
    const html = render(only(FIXTURE_BLOCKS.timeline));
    expect(html).toContain('<li class="byline-timeline-item is-current is-new-period"><p class="byline-timeline-label">Jan. 2026</p><h3 class="byline-timeline-title">School board votes on the budget</h3>');
    expect(html.match(/byline-timeline-item/g)).toHaveLength(4);
  });

  it("renders nothing for a block whose media is gone", () => {
    expect(render(only({ ...FIXTURE_BLOCKS.photo, media: 999 }))).toBe('<div class="byline-article-view"><div class="article-body"></div></div>');
  });
});
