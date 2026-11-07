import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FIXTURE_ARTICLE_BODY } from "@byline/article-body/fixtures";
import { buildArticlePresentation as buildCanonical, storyReadingTime, type ArticlePresentation } from "@byline/content/story";
import { ArticleView, PresentedArticleView } from "@byline/ui";
import { StructuredArticleBody } from "@byline/ui/article-body";
import { buildArticlePresentation } from "@/lib/article-presentation";
import { getPostContributors, isGuestContributor, type WordPressAuthor } from "@/lib/wordpress";
import { publicEditorialPosts } from "@/tests/fixtures/public-editorial-content";

/**
 * `ArticlePresentation.body` is the provider-neutral `PublicArticleBody`. A
 * WordPress (imported) body prints its HTML; a semantic `byline-v1` body goes
 * through the canonical structured renderer. Nothing serializes one into the
 * other to reach the article.
 */
function wordpressPresentation(): ArticlePresentation {
  const post = publicEditorialPosts[0];
  const contributors = getPostContributors(post);
  return buildArticlePresentation({ post, allPosts: publicEditorialPosts, contributors, author: contributors.find((c): c is WordPressAuthor => !isGuestContributor(c)) ?? null });
}

describe("the PublicArticleBody renderer boundary", () => {
  it("adapts WordPress content as legacy-html", () => {
    const presentation = wordpressPresentation();
    expect(presentation.body.format).toBe("legacy-html");
    expect(presentation).not.toHaveProperty("contentHtml");
  });

  it("prints a legacy body as its HTML inside one .article-body", () => {
    const markup = renderToStaticMarkup(<ArticleView presentation={{ ...wordpressPresentation(), body: { format: "legacy-html", html: "<p>Imported paragraph.</p>" } }} />);
    expect(markup.match(/class="article-body"/g)).toHaveLength(1);
    expect(markup).toContain("<p>Imported paragraph.</p>");
  });

  it("renders a byline-v1 body with the canonical structured renderer, the same markup as StructuredArticleBody", () => {
    const markup = renderToStaticMarkup(<ArticleView presentation={{ ...wordpressPresentation(), body: FIXTURE_ARTICLE_BODY }} />);
    const structured = renderToStaticMarkup(<StructuredArticleBody body={FIXTURE_ARTICLE_BODY} />);
    expect(markup).toContain(structured);
    expect(markup.match(/class="article-body"/g)).toHaveLength(1);
    for (const type of ["photo", "gallery", "reportedQuote", "pullQuote", "keyFacts", "context", "document", "timeline"]) {
      expect(FIXTURE_ARTICLE_BODY.nodes.some((node) => node.type === type)).toBe(true);
    }
  });

  it("renders the structured body the same way in the Immersive opening", () => {
    const presentation = { ...wordpressPresentation(), body: FIXTURE_ARTICLE_BODY, storyPresentation: "immersive" as const, image: { src: "/lead.jpg", alt: "Lead", width: 1600, height: 1000 } };
    const markup = renderToStaticMarkup(<PresentedArticleView presentation={presentation} />);
    expect(markup).toContain("immersive-article");
    expect(markup).toContain(renderToStaticMarkup(<StructuredArticleBody body={FIXTURE_ARTICLE_BODY} />));
  });

  it("shows the empty state for an empty body of either format", () => {
    for (const body of [{ format: "legacy-html", html: "  " } as const, { ...FIXTURE_ARTICLE_BODY, nodes: [] }]) {
      expect(renderToStaticMarkup(<ArticleView presentation={{ ...wordpressPresentation(), body }} />)).toContain("No article body has been published yet.");
    }
  });

  it("reads the reading time from a structured body's words", () => {
    expect(storyReadingTime({ body: FIXTURE_ARTICLE_BODY, excerptHtml: "" })).toMatch(/^\d+ min read$/);
    expect(storyReadingTime({ body: { ...FIXTURE_ARTICLE_BODY, nodes: [] }, excerptHtml: "<p>Deck words only.</p>" })).toBe("1 min read");
    expect(typeof buildCanonical).toBe("function");
  });
});
