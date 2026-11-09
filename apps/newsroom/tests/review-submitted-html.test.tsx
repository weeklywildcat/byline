// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { legacyHtmlBlocks } from "../src/ui/review/legacy-html";
import { reviewBlocks, SubmittedArticle } from "../src/ui/review/SubmittedArticle";

const parse = (html: string) => new DOMParser().parseFromString(html, "text/html");

function render(legacyHtml: string): string {
  const blocks = reviewBlocks({ headline: "Imported", legacyHtml, contentFormat: "legacy-html" }, parse);
  return renderToStaticMarkup(<SubmittedArticle blocks={blocks} marks={new Map()} onMark={() => {}} />);
}

describe("submitted legacy HTML", () => {
  it("keeps paragraphs, headings, quotes, lists and media in order", () => {
    const blocks = legacyHtmlBlocks(
      "<h2>Budget</h2><p>The board <a href='/x'>voted</a> 4&ndash;1 &amp; adjourned.<br>Late.</p>" +
      "<blockquote><p>We had no choice.</p></blockquote><ul><li>One</li><li>Two</li></ul>" +
      "<figure><img src='a.jpg' alt='Alt'><figcaption>The board room</figcaption></figure>Trailing words",
      parse
    );
    expect(blocks).toEqual([
      { kind: "heading", text: "Budget", level: 2 },
      { kind: "paragraph", text: "The board voted 4–1 & adjourned.\nLate." },
      { kind: "quote", text: "We had no choice." },
      { kind: "list", text: "One\nTwo" },
      { kind: "media", text: "The board room" },
      { kind: "paragraph", text: "Trailing words" }
    ]);
  });

  it.each([
    ["plain script", "<p>Safe</p><script>alert(1)</script>"],
    ["upper-case script", "<p>Safe</p><SCRIPT SRC=//evil.test/x.js></SCRIPT>"],
    ["nested split script", "<p>Safe</p><scr<script>ipt>alert(1)</scr</script>ipt>"],
    ["unterminated tag", "<p>Safe</p><script"],
    ["event handler", "<p>Safe</p><img src=x onerror=alert(1)>"],
    ["svg script", "<p>Safe</p><svg><script>alert(1)</script><a xlink:href='javascript:alert(1)'>x</a></svg>"],
    ["javascript link", "<p>Safe <a href='javascript:alert(1)' onclick='alert(1)'>link</a></p>"],
    ["iframe srcdoc", "<p>Safe</p><iframe srcdoc='<script>alert(1)</script>'></iframe>"],
    ["style", "<style>body{background:url(javascript:alert(1))}</style><p>Safe</p>"]
  ])("never renders markup from %s", (_name, html) => {
    // The media placeholder's own icon is the only SVG the view draws.
    const markup = render(html).replace(/<svg[^>]*class="lucide[\s\S]*?<\/svg>/g, "");
    expect(markup).toContain("Safe");
    expect(markup).not.toMatch(/<script|<svg|<iframe|<style|<img|onerror|onclick|javascript:|alert\(1\)(?![^<]*&)/i);
  });

  it("renders escaped markup as visible text, never as elements", () => {
    const markup = render("<p>&lt;script&gt;alert(1)&lt;/script&gt; is how it starts</p>");
    expect(markup).toContain("&lt;script&gt;alert(1)&lt;/script&gt; is how it starts");
    expect(markup).not.toContain("<script");
  });

  it("returns nothing (not a regex guess) where no parser exists", () => {
    expect(legacyHtmlBlocks("<p>x</p>", null)).toBeNull();
  });
});
