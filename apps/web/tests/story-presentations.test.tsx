import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";
import { JSDOM } from "jsdom";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ArticleView, HeroReveal, HeroRevealContent, type ArticlePresentation, type ArticleViewSlots } from "@byline/ui";
import { buildArticlePresentation } from "@/lib/article-presentation";
import { getPostContributors, isGuestContributor, type WordPressAuthor } from "@/lib/wordpress";
import { getStoryPresentation, resolveStoryPresentation, storyPresentations, fixtureStoryPresentations } from "@/story-presentations/registry";
import { StoryArticle } from "@/story-presentations/StoryArticle";
import RevealFixtureStory from "@/story-presentations/stories/reveal-fixture";
import { publicEditorialPosts } from "@/tests/fixtures/public-editorial-content";

const FIXTURE_ID = 8;

function basePresentation(overrides: Partial<ArticlePresentation> = {}): ArticlePresentation {
  const post = publicEditorialPosts[0];
  const contributors = getPostContributors(post);
  return {
    ...buildArticlePresentation({
      post,
      allPosts: publicEditorialPosts,
      contributors,
      author: contributors.find((contributor): contributor is WordPressAuthor => !isGuestContributor(contributor)) ?? null
    }),
    image: {
      src: "/media/lead-1600.jpg",
      srcSet: "/media/lead-640.jpg 640w, /media/lead-1600.jpg 1600w",
      sizes: "(max-width: 900px) 100vw, 900px",
      alt: "Students gather in a hallway",
      width: 1600,
      height: 1067,
      captionHtml: "<p>Students gather before first period.</p>",
      credit: "Casey Photographer"
    },
    topics: [{ id: "tag-1", name: "Campus" }],
    ...overrides
  };
}

const slots: ArticleViewSlots = {
  metadata: <script id="newsarticle-json-ld" type="application/ld+json" />,
  shareActions: <div className="article-share-actions" data-slot="share" />,
  poll: <div data-slot="poll" />,
  feedback: <div data-slot="feedback" />,
  newsletter: <div data-slot="newsletter" />
};

const dom = (markup: string) => new JSDOM(markup).window.document;
const text = (node: Element | null) => node?.textContent?.replace(/\s+/g, " ").trim() ?? "";

afterEach(() => vi.unstubAllEnvs());

describe("story presentation registry", () => {
  const Custom = () => null;
  const registry = { 384: Custom };

  it("resolves a registered WordPress post ID, as a number or numeric string", () => {
    expect(resolveStoryPresentation(registry, 384)).toBe(Custom);
    expect(resolveStoryPresentation(registry, "384")).toBe(Custom);
  });

  it("returns null for any other identity, including slugs and inherited keys", () => {
    expect(resolveStoryPresentation(registry, 385)).toBeNull();
    expect(resolveStoryPresentation(registry, "need-a-lift")).toBeNull();
    expect(resolveStoryPresentation(registry, "constructor")).toBeNull();
    expect(resolveStoryPresentation(registry, "")).toBeNull();
    expect(resolveStoryPresentation({}, 384)).toBeNull();
  });

  it("ships no production override, and the fixture story only exists in fixture builds", () => {
    expect(storyPresentations).toEqual({});
    expect(fixtureStoryPresentations[FIXTURE_ID]).toBe(RevealFixtureStory);
    expect(getStoryPresentation(FIXTURE_ID)).toBeNull();

    vi.stubEnv("BYLINE_CONTENT_MODE", "weekly-wildcat-fixture");
    expect(getStoryPresentation(FIXTURE_ID)).toBe(RevealFixtureStory);
    expect(getStoryPresentation(FIXTURE_ID + 1)).toBeNull();
  });
});

describe("a story with no registered override", () => {
  it("renders exactly what ArticleView renders", () => {
    const presentation = basePresentation({ id: 101 });
    const withSlots = renderToStaticMarkup(<StoryArticle presentation={presentation} slots={slots} className="article-shell-opinion" />);
    const direct = renderToStaticMarkup(<ArticleView presentation={presentation} slots={slots} className="article-shell-opinion" />);

    expect(withSlots).toBe(direct);
    expect(renderToStaticMarkup(<StoryArticle presentation={presentation} />)).toBe(renderToStaticMarkup(<ArticleView presentation={presentation} />));
    expect(withSlots).not.toContain("data-story-presentation");
    expect(withSlots).not.toContain("hero-reveal");
  });

  it("keeps the fixture story on the normal article outside fixture builds", () => {
    const presentation = basePresentation({ id: FIXTURE_ID });
    expect(renderToStaticMarkup(<StoryArticle presentation={presentation} slots={slots} />)).toBe(renderToStaticMarkup(<ArticleView presentation={presentation} slots={slots} />));
  });
});

describe("the example custom presentation", () => {
  function render(presentation = basePresentation({ id: FIXTURE_ID })) {
    vi.stubEnv("BYLINE_CONTENT_MODE", "weekly-wildcat-fixture");
    return dom(renderToStaticMarkup(<StoryArticle presentation={presentation} slots={slots} />));
  }

  it("is chosen by post ID and replaces the default composition", () => {
    const document = render();

    expect(document.querySelector(".story-reveal")).not.toBeNull();
    expect(document.querySelector(".hero-reveal")).not.toBeNull();
    expect(document.querySelector(".article-header")).toBeNull();
    expect(document.querySelector("style[data-story-presentation='reveal-fixture']")!.textContent).toContain(".story-reveal .story-reveal-headline");
  });

  it("shows the live WordPress headline, deck, body and contributors", () => {
    const changed = basePresentation({
      id: FIXTURE_ID,
      title: "A headline edited later",
      titleHtml: "A headline edited later",
      excerptHtml: "<p>A deck edited later.</p>",
      contentHtml: "<p>A body paragraph edited later.</p>"
    });
    const document = render(changed);

    expect(text(document.querySelector("h1"))).toBe("A headline edited later");
    expect(text(document.querySelector(".hero-reveal .article-excerpt"))).toBe("A deck edited later.");
    expect(text(document.querySelector(".article-body"))).toBe("A body paragraph edited later.");
    expect(text(document.querySelector(".article-author-line"))).toBe("By Alex Rivera and Jordan Guest");
    expect(text(document.querySelector(".article-section-label"))).toBe("News");
    expect(document.querySelector(".article-section-label")!.getAttribute("href")).toBe("/category/news/");
    expect(text(document.querySelector(".article-timing"))).toContain("Published");
  });

  it("holds no editorial copy of its own", () => {
    const directory = fileURLToPath(new URL("../story-presentations/stories/reveal-fixture/", import.meta.url));
    const source = readdirSync(directory).filter((name) => name.endsWith(".tsx")).map((name) => readFileSync(directory + name, "utf8")).join("\n");
    const jsxText = [...source.matchAll(/>([^<>{}\n]*[A-Za-z]{3,}[^<>{}\n]*)</g)].map((match) => match[1].trim()).filter(Boolean);

    expect(jsxText).toEqual([]);
  });

  it("has exactly one h1, outside the article body", () => {
    const document = render();

    expect(document.querySelectorAll("h1")).toHaveLength(1);
    expect(document.querySelector(".article-body h1")).toBeNull();
    expect(document.querySelector(".hero-reveal h1")).not.toBeNull();
    const levels = [...document.querySelectorAll("h1, h2, h3")].map((heading) => Number(heading.tagName[1]));
    levels.slice(1).forEach((level, index) => expect(level - levels[index]).toBeLessThanOrEqual(1));
  });

  it("uses the featured image once, as a real responsive image, with caption and credit", () => {
    const document = render();
    const images = [...document.querySelectorAll("img")].filter((img) => img.getAttribute("src") === "/media/lead-1600.jpg");
    const hero = document.querySelector<HTMLImageElement>("img.hero-reveal-image")!;

    expect(images).toHaveLength(1);
    expect(images[0]).toBe(hero);
    expect(hero.getAttribute("srcset")).toBe("/media/lead-640.jpg 640w, /media/lead-1600.jpg 1600w");
    expect(hero.getAttribute("sizes")).toBe("100vw");
    expect(hero.getAttribute("width")).toBe("1600");
    expect(hero.getAttribute("height")).toBe("1067");
    expect(hero.getAttribute("alt")).toBe("Students gather in a hallway");
    expect(hero.getAttribute("fetchpriority")).toBe("high");
    expect(hero.hasAttribute("loading")).toBe(false);
    expect(hero.getAttribute("style") ?? "").not.toContain("background-image");
    expect(document.querySelector("[style*='background-image']")).toBeNull();

    const caption = document.querySelector(".story-reveal-caption")!;
    expect(text(caption)).toContain("Students gather before first period.");
    expect(text(caption)).toContain("Photo: Casey Photographer");
  });

  it("renders without a lead image", () => {
    const document = render(basePresentation({ id: FIXTURE_ID, image: null }));

    expect(document.querySelector("img.hero-reveal-image")).toBeNull();
    expect(document.querySelector(".story-reveal-caption")).toBeNull();
    expect(document.querySelectorAll("h1")).toHaveLength(1);
  });

  it("keeps corrections, topics, authors, slots and the standard ending", () => {
    const document = render(basePresentation({ id: FIXTURE_ID, update: { modifiedAt: "2026-08-21T09:00:00", label: "Updated after publication." } }));

    expect(document.querySelectorAll(".article-correction-notice")).toHaveLength(1);
    expect(text(document.querySelector(".article-correction-notice h2"))).toBe("Clarification");
    expect(text(document.querySelector(".article-correction-notice p"))).toContain("public-records deadline");
    expect(text(document.querySelector(".article-tags"))).toContain("Campus");
    expect(text(document.querySelector(".article-update-notice"))).toContain("Updated after publication.");
    expect(document.querySelector(".about-writer h2")!.textContent).toBe("About the Writers");
    expect(document.querySelector(".article-tip-callout")).not.toBeNull();
    expect(document.querySelector('.article-meta-block [data-slot="share"]')).not.toBeNull();
    for (const slot of ["poll", "feedback", "newsletter"]) expect(document.querySelectorAll(`[data-slot="${slot}"]`)).toHaveLength(1);
  });

  it("keeps the interactive slots in the order the default article uses", () => {
    const custom = render();
    const defaults = dom(renderToStaticMarkup(<ArticleView presentation={basePresentation({ id: 101 })} slots={slots} />));
    const order = (document: Document) => [...document.querySelectorAll("[data-slot], .article-body, .article-correction-notices, .article-tags, .article-after")]
      .map((node) => node.getAttribute("data-slot") ?? node.className.split(" ")[0]);

    expect(order(custom)).toEqual(order(defaults));
  });

  it("emits structured data once, from the route, not from the presentation", () => {
    const document = render();

    expect(document.querySelectorAll("#newsarticle-json-ld")).toHaveLength(1);
  });

  it("puts the article body inside a byline-content container, like the default article", () => {
    const document = render();
    const shell = document.querySelector(".article-shell.byline-article-view")!;

    expect(shell.contains(document.querySelector(".article-body"))).toBe(true);
    expect(shell.contains(document.querySelector(".article-after"))).toBe(true);
    expect(shell.querySelector("h1")).toBeNull();
  });

  it("puts the opaque surface directly after the pinned hero, as siblings", () => {
    const document = render();
    const hero = document.querySelector(".hero-reveal")!;
    const surface = document.querySelector(".hero-reveal-content")!;

    expect(hero.parentElement).toBe(surface.parentElement);
    expect(hero.parentElement!.tagName).toBe("MAIN");
    expect(hero.nextElementSibling).toBe(surface);
    expect(hero.querySelector(`a.hero-reveal-scroll[href="#${surface.id}"]`)).not.toBeNull();
  });
});

describe("HeroReveal", () => {
  it("renders a real responsive image, the copy, a scroll cue and the header-fit script", () => {
    const document = dom(renderToStaticMarkup(
      <main>
        <HeroReveal target="below" scrim={0.4} imagePosition="40% 20%" scrollLabel="Read on" image={{ src: "/a.jpg", srcSet: "/a-1.jpg 1w", alt: "Alt", width: 10, height: 20 }}>
          <h1>Words</h1>
        </HeroReveal>
        <HeroRevealContent id="below">Content</HeroRevealContent>
      </main>
    ));
    const hero = document.querySelector<HTMLElement>(".hero-reveal")!;
    const image = hero.querySelector<HTMLImageElement>("img.hero-reveal-image")!;

    expect(hero.tagName).toBe("HEADER");
    expect(hero.getAttribute("style")).toContain("--hero-reveal-scrim:0.4");
    expect(image.getAttribute("srcset")).toBe("/a-1.jpg 1w");
    expect(image.getAttribute("sizes")).toBe("100vw");
    expect(image.getAttribute("alt")).toBe("Alt");
    expect(image.getAttribute("style")).toContain("object-position:40% 20%");
    expect(text(hero.querySelector(".hero-reveal-copy"))).toBe("Words");
    expect(text(hero.querySelector("a.hero-reveal-scroll"))).toBe("Read on");
    expect(document.querySelector("#below.hero-reveal-content")).not.toBeNull();
    expect(document.querySelector("script#hero-reveal-fit")!.textContent).toContain("--hero-reveal-header-h");
  });

  it("omits the image element when there is no image", () => {
    const document = dom(renderToStaticMarkup(<HeroReveal target="x"><h1>Words</h1></HeroReveal>));

    expect(document.querySelector("img")).toBeNull();
    expect(document.querySelector(".hero-reveal-copy-end")).toBeNull();
  });
});
