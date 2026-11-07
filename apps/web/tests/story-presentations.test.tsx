import { readFileSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";
import { JSDOM } from "jsdom";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ArticleView, HeroReveal, HeroRevealContent, ImmersiveArticleView, type ArticlePresentation, type ArticleViewSlots } from "@byline/ui";
import { buildArticlePresentation } from "@/lib/article-presentation";
import { getPostContributors, getPostStoryPresentation, isGuestContributor, type WordPressAuthor, type WordPressPost } from "@/lib/wordpress";
import { getStoryPresentation, resolveStoryPresentation, storyPresentations, fixtureStoryPresentations } from "@/story-presentations/registry";
import { defineVisualStory, isVisualStory } from "@/story-presentations/types";
import { getNewsArticleSchema } from "@/lib/seo";
import { StoryArticle } from "@/story-presentations/StoryArticle";
import OverrideFixtureStory from "@/story-presentations/stories/override-fixture";
import VisualFixtureStory from "@/story-presentations/stories/visual-fixture";
import { publicEditorialPosts } from "@/tests/fixtures/public-editorial-content";

const OVERRIDE_ID = 6;
const VISUAL_ID = 10;
const IMMERSIVE_ID = 8;

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
    expect(fixtureStoryPresentations[OVERRIDE_ID]).toBe(OverrideFixtureStory);
    expect(getStoryPresentation(OVERRIDE_ID)).toBeNull();

    vi.stubEnv("BYLINE_CONTENT_MODE", "weekly-wildcat-fixture");
    expect(getStoryPresentation(OVERRIDE_ID)).toBe(OverrideFixtureStory);
    expect(getStoryPresentation(IMMERSIVE_ID)).toBeNull();
  });
});

function immersive(alignment: "bottom-left" | "center", overrides: Partial<ArticlePresentation> = {}) {
  return basePresentation({ id: IMMERSIVE_ID, storyPresentation: "immersive", immersiveAlignment: alignment, ...overrides });
}

describe("a standard story", () => {
  it("renders exactly what ArticleView renders", () => {
    const presentation = basePresentation({ id: 101 });
    const withSlots = renderToStaticMarkup(<StoryArticle presentation={presentation} slots={slots} className="article-shell-opinion" />);
    const direct = renderToStaticMarkup(<ArticleView presentation={presentation} slots={slots} className="article-shell-opinion" />);

    expect(withSlots).toBe(direct);
    expect(renderToStaticMarkup(<StoryArticle presentation={presentation} />)).toBe(renderToStaticMarkup(<ArticleView presentation={presentation} />));
    expect(withSlots).not.toContain("hero-reveal");
    expect(withSlots).not.toContain("immersive-article");
  });

  it("is what a missing or explicitly standard setting means, whatever the alignment", () => {
    const plain = basePresentation({ id: 101 });
    for (const presentation of [
      { ...plain, storyPresentation: undefined },
      { ...plain, storyPresentation: "standard" as const, immersiveAlignment: "center" as const }
    ]) {
      expect(renderToStaticMarkup(<StoryArticle presentation={presentation} slots={slots} />)).toBe(renderToStaticMarkup(<ArticleView presentation={presentation} slots={slots} />));
    }
  });

  it("falls back to the normal article when Immersive is chosen but there is no featured image", () => {
    const presentation = immersive("center", { image: null });
    expect(renderToStaticMarkup(<StoryArticle presentation={presentation} slots={slots} />)).toBe(renderToStaticMarkup(<ArticleView presentation={presentation} slots={slots} />));
  });
});

describe("WordPress story presentation settings", () => {
  const post = (byline?: Record<string, unknown>, legacy?: Record<string, unknown>) => ({ ...publicEditorialPosts[0], ...(byline ? { byline } : {}), ...(legacy ? { weeklyWildcat: legacy } : {}) }) as unknown as WordPressPost;

  it("reads the choice from the Byline settings, then the legacy alias", () => {
    expect(getPostStoryPresentation(post({ presentation: "immersive", immersiveAlignment: "center" }))).toEqual({ presentation: "immersive", immersiveAlignment: "center" });
    expect(getPostStoryPresentation(post(undefined, { presentation: "immersive" }))).toEqual({ presentation: "immersive", immersiveAlignment: "bottom-left" });
  });

  it("defaults to Standard and Bottom left for older stories and anything unrecognized", () => {
    const standard = { presentation: "standard", immersiveAlignment: "bottom-left" };
    expect(getPostStoryPresentation(post())).toEqual(standard);
    expect(getPostStoryPresentation(post({ primaryGameId: 4 }))).toEqual(standard);
    expect(getPostStoryPresentation(post({ presentation: "fullbleed", immersiveAlignment: "right" }))).toEqual(standard);
    expect(getPostStoryPresentation(post({ presentation: { nested: true }, immersiveAlignment: 3 }))).toEqual(standard);
  });

  it("carries the choice through the normalized article model", () => {
    const withChoice = post({ presentation: "immersive", immersiveAlignment: "center" });
    const contributors = getPostContributors(withChoice);
    const model = buildArticlePresentation({ post: withChoice, allPosts: publicEditorialPosts, contributors, author: null });
    expect([model.storyPresentation, model.immersiveAlignment]).toEqual(["immersive", "center"]);

    const plain = buildArticlePresentation({ post: post(), allPosts: publicEditorialPosts, contributors, author: null });
    expect([plain.storyPresentation, plain.immersiveAlignment]).toEqual(["standard", "bottom-left"]);
  });
});

describe("an immersive story", () => {
  const render = (presentation: ArticlePresentation) => dom(renderToStaticMarkup(<StoryArticle presentation={presentation} slots={slots} />));

  it("is chosen when WordPress says Immersive and the story has a featured image", () => {
    const document = render(immersive("bottom-left"));

    expect(document.querySelector("main.immersive-article.immersive-article-bottom-left")).not.toBeNull();
    expect(document.querySelector(".hero-reveal")).not.toBeNull();
    expect(document.querySelector(".article-header")).toBeNull();
    expect(renderToStaticMarkup(<ImmersiveArticleView presentation={immersive("bottom-left")} slots={slots} />)).toBe(renderToStaticMarkup(<StoryArticle presentation={immersive("bottom-left")} slots={slots} />));
  });

  it("puts the headline bottom left by default and centered on request", () => {
    const bottomLeft = render(immersive("bottom-left"));
    expect(bottomLeft.querySelector(".hero-reveal-copy.hero-reveal-copy-end")).not.toBeNull();
    expect(bottomLeft.querySelector("main.immersive-article-center")).toBeNull();

    const centered = render(immersive("center"));
    expect(centered.querySelector("main.immersive-article.immersive-article-center")).not.toBeNull();
    expect(centered.querySelector(".hero-reveal-copy")).not.toBeNull();
    expect(centered.querySelector(".hero-reveal-copy-end")).toBeNull();

    const unspecified = render(basePresentation({ id: IMMERSIVE_ID, storyPresentation: "immersive", immersiveAlignment: undefined }));
    expect(unspecified.querySelector(".hero-reveal-copy-end")).not.toBeNull();
  });

  for (const alignment of ["bottom-left", "center"] as const) {
    it(`shows the live WordPress content with one h1 (${alignment})`, () => {
      const document = render(immersive(alignment, {
        title: "A headline edited later",
        titleHtml: "A headline edited later",
        excerptHtml: "<p>A deck edited later.</p>",
        body: { format: "legacy-html", html: "<p>A body paragraph edited later.</p>" }
      }));

      expect(document.querySelectorAll("h1")).toHaveLength(1);
      expect(text(document.querySelector(".hero-reveal h1"))).toBe("A headline edited later");
      expect(text(document.querySelector(".hero-reveal .article-excerpt"))).toBe("A deck edited later.");
      expect(text(document.querySelector(".hero-reveal .article-section-label"))).toBe("News");
      expect(text(document.querySelector(".article-body"))).toBe("A body paragraph edited later.");
      expect(text(document.querySelector(".article-author-line"))).toBe("By Alex Rivera and Jordan Guest");
      const levels = [...document.querySelectorAll("h1, h2, h3")].map((heading) => Number(heading.tagName[1]));
      levels.slice(1).forEach((level, index) => expect(level - levels[index]).toBeLessThanOrEqual(1));
    });
  }

  it("uses the featured image once, as a real responsive image, with caption and credit", () => {
    const document = render(immersive("center"));
    const images = [...document.querySelectorAll("img")].filter((img) => img.getAttribute("src") === "/media/lead-1600.jpg");
    const hero = document.querySelector<HTMLImageElement>("img.hero-reveal-image")!;

    expect(images).toEqual([hero]);
    expect(hero.getAttribute("srcset")).toBe("/media/lead-640.jpg 640w, /media/lead-1600.jpg 1600w");
    expect(hero.getAttribute("sizes")).toBe("100vw");
    expect([hero.getAttribute("width"), hero.getAttribute("height")]).toEqual(["1600", "1067"]);
    expect(hero.getAttribute("alt")).toBe("Students gather in a hallway");
    expect(hero.getAttribute("fetchpriority")).toBe("high");
    expect(hero.hasAttribute("loading")).toBe(false);
    expect(document.querySelector("[style*='background-image']")).toBeNull();
    expect(text(document.querySelector(".immersive-article-caption"))).toContain("Students gather before first period.");
    expect(text(document.querySelector(".immersive-article-caption"))).toContain("Photo: Casey Photographer");
  });

  it("keeps corrections, topics, authors, slots, structured data and the standard ending", () => {
    const document = render(immersive("bottom-left", { update: { modifiedAt: "2026-08-21T09:00:00", label: "Updated after publication." } }));
    const order = (node: Document) => [...node.querySelectorAll("[data-slot], .article-body, .article-correction-notices, .article-tags, .article-after")]
      .map((element) => element.getAttribute("data-slot") ?? element.className.split(" ")[0]);
    const defaults = dom(renderToStaticMarkup(<ArticleView presentation={basePresentation({ id: 101, update: { modifiedAt: "2026-08-21T09:00:00", label: "Updated after publication." } })} slots={slots} />));

    expect(document.querySelectorAll(".article-correction-notice")).toHaveLength(1);
    expect(text(document.querySelector(".article-tags"))).toContain("Campus");
    expect(text(document.querySelector(".article-update-notice"))).toContain("Updated after publication.");
    expect(document.querySelector(".about-writer h2")!.textContent).toBe("About the authors");
    expect(document.querySelector(".article-tip-callout")).not.toBeNull();
    expect(document.querySelector('.article-meta-block [data-slot="share"]')).not.toBeNull();
    expect(document.querySelectorAll("#newsarticle-json-ld")).toHaveLength(1);
    for (const slot of ["poll", "feedback", "newsletter"]) expect(document.querySelectorAll(`[data-slot="${slot}"]`)).toHaveLength(1);
    expect(order(document)).toEqual(order(defaults));
  });

  it("lays the pinned hero and opaque surface out as adjacent siblings inside a byline-content shell", () => {
    const document = render(immersive("bottom-left"));
    const hero = document.querySelector(".hero-reveal")!;
    const surface = document.querySelector(".hero-reveal-content")!;
    const shell = surface.querySelector(".article-shell.byline-article-view")!;

    expect(hero.nextElementSibling).toBe(surface);
    expect(hero.parentElement).toBe(surface.parentElement);
    expect(hero.parentElement!.tagName).toBe("MAIN");
    expect(hero.querySelector(`a.hero-reveal-scroll[href="#${surface.id}"]`)).not.toBeNull();
    expect(shell.contains(document.querySelector(".article-body"))).toBe(true);
    expect(shell.contains(document.querySelector(".article-after"))).toBe(true);
  });

  it("holds no editorial copy of its own", () => {
    const source = readFileSync(fileURLToPath(new URL("../../../packages/ui/src/immersive-article-view.tsx", import.meta.url)), "utf8");
    const jsxText = [...source.matchAll(/>([^<>{}\n]*[A-Za-z]{3,}[^<>{}\n]*)</g)].map((match) => match[1].trim()).filter(Boolean);
    expect(jsxText).toEqual([]);
  });
});

describe("a repository override and WordPress Immersive together", () => {
  it("renders the override, never the immersive layout", () => {
    vi.stubEnv("BYLINE_CONTENT_MODE", "weekly-wildcat-fixture");
    const presentation = immersive("center", { id: OVERRIDE_ID });
    const document = dom(renderToStaticMarkup(<StoryArticle presentation={presentation} slots={slots} />));

    expect(document.querySelector(".story-override-fixture")).not.toBeNull();
    expect(document.querySelector(".hero-reveal, .immersive-article")).toBeNull();
    expect(document.querySelectorAll("h1")).toHaveLength(1);
    expect(text(document.querySelector("h1"))).toBe("Public records guide");
    expect(document.querySelectorAll("#newsarticle-json-ld")).toHaveLength(1);
    expect(document.querySelector(".article-body")).not.toBeNull();
  });

  it("goes back to the author's Immersive choice once the override is removed", () => {
    const presentation = immersive("center", { id: OVERRIDE_ID });
    // Outside fixture builds the registry has no entry for this ID.
    const document = dom(renderToStaticMarkup(<StoryArticle presentation={presentation} slots={slots} />));

    expect(document.querySelector(".story-override-fixture")).toBeNull();
    expect(document.querySelector("main.immersive-article-center")).not.toBeNull();
  });

  it("goes back to the normal article when the override is removed and the story is Standard", () => {
    const presentation = basePresentation({ id: OVERRIDE_ID });
    expect(renderToStaticMarkup(<StoryArticle presentation={presentation} slots={slots} />)).toBe(renderToStaticMarkup(<ArticleView presentation={presentation} slots={slots} />));
  });
});

describe("a flagship visual story", () => {
  const WORDPRESS_BODY = "<p>The WordPress text edition, for feeds and search.</p>";
  const visual = (overrides: Partial<ArticlePresentation> = {}) => basePresentation({ id: VISUAL_ID, body: { format: "legacy-html", html: WORDPRESS_BODY }, ...overrides });
  const render = (presentation: ArticlePresentation = visual()) => {
    vi.stubEnv("BYLINE_CONTENT_MODE", "weekly-wildcat-fixture");
    return dom(renderToStaticMarkup(<StoryArticle presentation={presentation} slots={slots} />));
  };

  it("is a deliberate opt-in: only defineVisualStory makes one", () => {
    expect(fixtureStoryPresentations[VISUAL_ID]).toBe(VisualFixtureStory);
    expect(isVisualStory(VisualFixtureStory)).toBe(true);
    expect(VisualFixtureStory).toMatchObject({ kind: "visual-story", name: "visual-fixture" });
    expect(isVisualStory(fixtureStoryPresentations[OVERRIDE_ID])).toBe(false);
    expect(isVisualStory(() => null)).toBe(false);
    expect(isVisualStory(null)).toBe(false);
    expect(() => defineVisualStory({ name: "Lunch Line", Component: () => null })).toThrow(/kebab-case/);
    expect(getStoryPresentation(VISUAL_ID)).toBeNull();
  });

  it("replaces the WordPress body with its own narrative, rendered as static HTML", () => {
    const document = render();
    const narrative = document.querySelector(".story-visual-fixture-narrative")!;

    expect(document.body.textContent).not.toContain("WordPress text edition");
    expect(document.body.textContent).not.toContain("No article body has been published yet.");
    expect(document.querySelectorAll(".article-body")).toEqual(document.querySelectorAll(".story-visual-fixture-narrative"));
    expect(text(narrative)).toContain("Open with the reporting.");
    expect(narrative.querySelectorAll(".story-visual-fixture-step")).toHaveLength(3);
    const graphic = narrative.querySelector('svg[role="img"]')!;
    expect(text(graphic.querySelector("title"))).toBe("First: 32, Second: 21, Third: 12");
    expect(graphic.getAttribute("aria-labelledby")).toBe(graphic.querySelector("title")!.id);
    // Nothing is enhanced until client.ts runs in the browser.
    expect(document.querySelector(".is-enhanced, .is-active, .is-highlighted")).toBeNull();
  });

  it("is marked for its own client code and keeps the route's structured data outside it", () => {
    const document = render();
    const root = document.querySelector('[data-visual-story="visual-fixture"]')!;

    expect(root).not.toBeNull();
    expect(document.querySelectorAll("#newsarticle-json-ld")).toHaveLength(1);
    expect(root.querySelector("#newsarticle-json-ld")).toBeNull();
  });

  it("keeps the WordPress publishing record and the standard article systems", () => {
    const document = render(visual({
      title: "A headline edited later",
      titleHtml: "A headline edited later",
      excerptHtml: "<p>A deck edited later.</p>",
      update: { modifiedAt: "2026-08-21T09:00:00", label: "Updated after publication." }
    }));
    const lead = [...document.querySelectorAll("img")].filter((img) => img.getAttribute("src") === "/media/lead-1600.jpg");

    expect(document.querySelectorAll("h1")).toHaveLength(1);
    expect(text(document.querySelector("h1"))).toBe("A headline edited later");
    expect(text(document.querySelector(".article-excerpt"))).toBe("A deck edited later.");
    expect(text(document.querySelector(".article-section-label"))).toBe("News");
    expect(text(document.querySelector(".article-author-line"))).toBe("By Alex Rivera and Jordan Guest");
    expect(lead).toHaveLength(1);
    expect(lead[0].getAttribute("alt")).toBe("Students gather in a hallway");
    expect(document.body.textContent).toContain("Photo: Casey Photographer");
    expect(document.querySelectorAll(".article-correction-notice")).toHaveLength(1);
    expect(text(document.querySelector(".article-tags"))).toContain("Campus");
    expect(text(document.querySelector(".article-update-notice"))).toContain("Updated after publication.");
    expect(document.querySelector(".article-tip-callout")).not.toBeNull();
    expect(document.querySelector('.article-meta-block [data-slot="share"]')).not.toBeNull();
    for (const slot of ["poll", "feedback", "newsletter"]) expect(document.querySelectorAll(`[data-slot="${slot}"]`)).toHaveLength(1);
    // The narrative sits where the body would: after the header, before the footer.
    const order = [...document.querySelectorAll(".article-header, .story-visual-fixture-narrative, .article-correction-notices, .article-after")].map((element) => element.className.split(" ").at(-1));
    expect(order).toEqual(["article-header", "story-visual-fixture-narrative", "article-correction-notices", "article-after"]);
  });

  it("returns to the WordPress body when its registry line is removed", () => {
    const presentation = visual();
    // Outside fixture builds the registry has no entry for this ID.
    expect(renderToStaticMarkup(<StoryArticle presentation={presentation} slots={slots} />)).toBe(renderToStaticMarkup(<ArticleView presentation={presentation} slots={slots} />));
  });

  it("can declare its own reading time, since the WordPress body is not its text", () => {
    const Story = ({ presentation }: { presentation: ArticlePresentation }) => <p data-reading={presentation.readingTime} data-body={presentation.body.format === "legacy-html" ? presentation.body.html : "structured"} />;
    const definition = defineVisualStory({ name: "timed", Component: Story, readingTime: "12 min read" });
    expect(definition.readingTime).toBe("12 min read");
    expect(defineVisualStory({ name: "untimed", Component: Story }).readingTime).toBeUndefined();
  });
});

describe("structured data for a flagship visual story", () => {
  const post = { ...publicEditorialPosts[0], content: { rendered: "<p>The WordPress text edition.</p>" } } as WordPressPost;

  it("claims the WordPress body only when the page shows it", () => {
    expect(getNewsArticleSchema(post).articleBody).toBe("The WordPress text edition.");
    const visual = getNewsArticleSchema(post, { articleBody: false });
    expect(visual).not.toHaveProperty("articleBody", expect.anything());
    expect(visual.articleBody).toBeUndefined();
    expect(visual.headline).toBe(getNewsArticleSchema(post).headline);
    expect(visual.description).toBe(getNewsArticleSchema(post).description);
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
