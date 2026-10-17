import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ArticleView } from "@byline/ui";
import { buildArticlePresentation } from "@/lib/article-presentation";
import { getPostContributors, isGuestContributor, type WordPressAuthor } from "@/lib/wordpress";
import { publicEditorialPosts } from "@/tests/fixtures/public-editorial-content";

describe("shared article presentation", () => {
  it("normalizes public WordPress data before it reaches the renderer", () => {
    const post = publicEditorialPosts[0];
    const contributors = getPostContributors(post);
    const presentation = buildArticlePresentation({
      post,
      allPosts: publicEditorialPosts,
      contributors,
      author: contributors.find((contributor): contributor is WordPressAuthor => !isGuestContributor(contributor)) ?? null
    });

    expect(presentation.title).toBe("Public records guide");
    expect(presentation.contributors.map((contributor) => contributor.name)).toEqual(["Alex Rivera", "Jordan Guest"]);
    expect(presentation.corrections).toHaveLength(1);
    expect(presentation.corrections[0].label).toBe("Clarification");
    expect(JSON.stringify(presentation)).not.toContain("privateNote");
    expect(JSON.stringify(presentation)).not.toContain("private@example.test");
  });

  it("uses the same renderer for a host with no optional interactive slots", () => {
    const post = publicEditorialPosts[0];
    const contributors = getPostContributors(post);
    const presentation = buildArticlePresentation({
      post,
      allPosts: publicEditorialPosts,
      contributors,
      author: contributors.find((contributor): contributor is WordPressAuthor => !isGuestContributor(contributor)) ?? null
    });
    const markup = renderToStaticMarkup(<ArticleView presentation={presentation} />);

    expect(markup).toContain("byline-article-view");
    expect(markup).toContain("Public records guide");
    expect(markup).toContain("The public story.");
    expect(markup).toContain("Clarification");
    expect(markup).not.toContain("About the Writer");
    expect(markup).not.toContain("privateNote");
  });
});

describe("per-contributor coverage", () => {
  it("does not credit a contributor with the other writers' coverage areas", () => {
    const post = publicEditorialPosts[0];
    const contributors = getPostContributors(post);
    const presentation = buildArticlePresentation({
      post,
      allPosts: publicEditorialPosts,
      contributors: [
        ...contributors,
        { type: "guest", id: 999, name: "Photo Only", slug: "photo-only" } as (typeof contributors)[number]
      ],
      author: null
    });
    const photoOnly = presentation.contributors.find((contributor) => contributor.name === "Photo Only");
    const writer = presentation.contributors.find((contributor) => contributor.name === "Alex Rivera");

    expect(writer?.coverage?.length).toBeGreaterThan(0);
    expect(photoOnly?.coverage ?? []).toEqual([]);
  });
});
