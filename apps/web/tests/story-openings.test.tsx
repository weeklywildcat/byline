import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { JSDOM } from "jsdom";
import {
  PresentedArticleView,
  StoryNavigation,
  type ArticlePresentation
} from "@byline/ui";
import { requestedPresentation, resolveBuiltInPresentation, resolveSiteNavigation } from "@byline/content/story";
import { fixtureStoryPresentations, resolveStoryChrome, resolveStoryPresentation, StoryArticle } from "@byline/story-presentations";
import { buildArticlePresentation } from "@/lib/article-presentation";
import { getPostContributors, getPostStoryPresentation, isGuestContributor, type ArchiveAuthor, type ArchivePost } from "@/lib/public-content";
import { getStoryChrome } from "@/lib/story-presentation-host";
import { publicEditorialPosts } from "@/tests/fixtures/public-editorial-content";

function base(overrides: Partial<ArticlePresentation> = {}): ArticlePresentation {
  const post = publicEditorialPosts[0];
  const contributors = getPostContributors(post);
  return {
    ...buildArticlePresentation({
      post,
      allPosts: publicEditorialPosts,
      contributors,
      author: contributors.find((contributor): contributor is ArchiveAuthor => !isGuestContributor(contributor)) ?? null
    }),
    image: {
      src: "/media/lead-1600.jpg",
      srcSet: "/media/lead-640.jpg 640w, /media/lead-1600.jpg 1600w",
      sizes: "100vw",
      alt: "A student stands in the garden",
      width: 1600,
      height: 1067,
      captionHtml: "<p>Jordan tends the garden.</p>",
      credit: "Casey Photographer",
      sources: [{ media: "(max-width: 640px)", srcSet: "/media/lead-portrait-800.jpg 800w", sizes: "100vw", width: 800, height: 1000 }]
    },
    ...overrides
  };
}

const dom = (markup: string) => new JSDOM(markup).window.document;
const render = (presentation: ArticlePresentation) => dom(renderToStaticMarkup(<PresentedArticleView presentation={presentation} />));

describe("the four story openings resolve from one rule", () => {
  const lead = { src: "/lead.jpg" };

  it("maps every older value safely", () => {
    expect(requestedPresentation(undefined)).toBe("standard");
    expect(requestedPresentation("fullbleed")).toBe("standard");
    expect(requestedPresentation({ nested: true })).toBe("standard");
    for (const opening of ["standard", "feature", "immersive", "split"] as const) expect(requestedPresentation(opening)).toBe(opening);
  });

  it("opens each photographic mode only with a lead image and no video", () => {
    for (const storyPresentation of ["feature", "immersive", "split"] as const) {
      expect(resolveBuiltInPresentation({ storyPresentation, image: lead })).toEqual({ requested: storyPresentation, resolved: storyPresentation, reason: "selected" });
      expect(resolveBuiltInPresentation({ storyPresentation, image: null })).toMatchObject({ resolved: "standard", reason: "missing-lead-image" });
      expect(resolveBuiltInPresentation({ storyPresentation, image: lead, video: { videoId: "x" } })).toMatchObject({ resolved: "standard", reason: "video-story" });
    }
    expect(resolveBuiltInPresentation({ storyPresentation: "standard", image: lead })).toMatchObject({ resolved: "standard" });
  });

  it("lets a repository entry override every built-in choice, exactly as before", () => {
    const registry = { 6: fixtureStoryPresentations[6] };
    for (const storyPresentation of ["standard", "feature", "immersive", "split"] as const) {
      expect(resolveStoryPresentation({ id: 6, storyPresentation, image: lead }, registry)).toMatchObject({ resolved: "custom", reason: "custom-presentation" });
    }
  });

  it("reads the archive settings, defaulting every new setting", () => {
    const post = (byline: Record<string, unknown>) => ({ byline } as unknown as ArchivePost);
    expect(getPostStoryPresentation(post({ presentation: "split", splitImageSide: "left", siteNavigation: "minimal" }))).toEqual({
      presentation: "split",
      immersiveAlignment: "bottom-left",
      featureWidth: "wide",
      splitImageSide: "left",
      siteNavigation: "minimal"
    });
    expect(getPostStoryPresentation(post({ presentation: "feature", featureWidth: "full" })).featureWidth).toBe("full");
    expect(getPostStoryPresentation(post({ presentation: "immersive", immersiveAlignment: "center" }))).toMatchObject({ presentation: "immersive", immersiveAlignment: "center", siteNavigation: "standard" });
  });
});

describe("Feature", () => {
  it("keeps the headline package on the page and prints the photograph after it", () => {
    const doc = render(base({ storyPresentation: "feature" }));
    const root = doc.querySelector("main")!;
    expect(root.getAttribute("data-opening")).toBe("feature");
    expect(root.className).toContain("story-opening-feature-wide");
    const head = doc.querySelector(".story-opening-head")!;
    expect(head.querySelector("h1")).not.toBeNull();
    expect(head.querySelector(".article-author-line")).not.toBeNull();
    // Logical order: the headline package precedes the photograph.
    const figure = doc.querySelector(".story-opening-figure")!;
    expect(head.compareDocumentPosition(figure) & 4).toBeTruthy();
    // Caption and credit stay inset and readable, outside the photograph.
    expect(figure.querySelector(".story-opening-caption")?.textContent).toContain("Jordan tends the garden.");
    expect(figure.querySelector(".story-opening-caption")?.textContent).toContain("Casey Photographer");
    expect(figure.querySelector(".story-opening-media")?.contains(figure.querySelector(".story-opening-caption"))).toBe(false);
  });

  it("offers a full-bleed width and art-directed sources", () => {
    const doc = render(base({ storyPresentation: "feature", featureWidth: "full" }));
    expect(doc.querySelector("main")!.className).toContain("story-opening-feature-full");
    expect(doc.querySelector("picture source")?.getAttribute("media")).toBe("(max-width: 640px)");
    expect(doc.querySelector("picture img")?.getAttribute("alt")).toBe("A student stands in the garden");
  });

  it("keeps the original focal position and marks only actual crop sources for centering", () => {
    const image = base().image!;
    const article = render(base({ storyPresentation: "feature", image: { ...image, objectPosition: "24% 72%" } }));
    const picture = article.querySelector(".story-opening-media picture")!;
    expect(picture.hasAttribute("data-phone-crop")).toBe(true);
    expect(picture.hasAttribute("data-tablet-crop")).toBe(false);
    expect(picture.querySelector("img")?.style.getPropertyValue("--byline-image-natural-position")).toBe("24% 72%");

    const natural = render(base({ storyPresentation: "feature", image: { ...image, sources: undefined, objectPosition: "24% 72%" } }));
    expect(natural.querySelector(".story-opening-media picture")).toBeNull();
    expect(natural.querySelector<HTMLElement>(".story-opening-media img")?.style.getPropertyValue("--byline-image-natural-position")).toBe("24% 72%");
  });

  it("falls back to the normal article without a lead image", () => {
    const doc = render(base({ storyPresentation: "feature", image: null }));
    expect(doc.querySelector(".story-opening")).toBeNull();
    expect(doc.querySelector(".article-header")).not.toBeNull();
  });
});

describe("Split", () => {
  it("puts the headline package first in the source, whichever side the photograph is on", () => {
    for (const side of ["left", "right"] as const) {
      const doc = render(base({ storyPresentation: "split", splitImageSide: side }));
      const root = doc.querySelector("main")!;
      expect(root.className).toContain(`story-opening-split-${side}`);
      const text = doc.querySelector(".story-opening-split-text")!;
      const figure = doc.querySelector(".story-opening-split-figure")!;
      expect(text.compareDocumentPosition(figure) & 4).toBeTruthy();
      expect(text.querySelector("h1")).not.toBeNull();
    }
  });

  it("defaults to the photograph on the right", () => {
    expect(render(base({ storyPresentation: "split" })).querySelector("main")!.className).toContain("story-opening-split-right");
  });
});

describe("Immersive", () => {
  it("keeps its alignments and marks its hero as the navigation zone", () => {
    const left = render(base({ storyPresentation: "immersive" }));
    expect(left.querySelector("main")!.className).toContain("immersive-article-bottom-left");
    expect(left.querySelector("[data-story-nav-zone]")?.className).toContain("hero-reveal");
    expect(render(base({ storyPresentation: "immersive", immersiveAlignment: "center" })).querySelector("main")!.className).toContain("immersive-article-center");
  });

  it("marks a prepared portrait source while preserving the natural focal fallback", () => {
    const image = base().image!;
    const article = render(base({ storyPresentation: "immersive", image: {
      ...image,
      objectPosition: "19% 42%",
      sources: [{ media: "(max-width: 1023px) and (orientation: portrait)", srcSet: "/media/cropped.jpg 800w" }]
    } }));
    const picture = article.querySelector(".hero-reveal picture")!;
    expect(picture.hasAttribute("data-portrait-crop")).toBe(true);
    expect(picture.querySelector("img")?.style.getPropertyValue("--hero-reveal-natural-position")).toBe("19% 42%");
  });

  it("art-directs the photograph for phones", () => {
    const doc = render(base({ storyPresentation: "immersive" }));
    expect(doc.querySelector(".hero-reveal picture source")?.getAttribute("media")).toBe("(max-width: 640px)");
  });
});

describe("Site navigation is chosen apart from the opening", () => {
  it("defaults to Standard for older stories and unknown values", () => {
    expect(resolveSiteNavigation({})).toBe("standard");
    expect(resolveSiteNavigation({ siteNavigation: null })).toBe("standard");
    expect(resolveSiteNavigation({ siteNavigation: "minimal" })).toBe("minimal");
  });

  it("is never changed by the opening, and every opening can carry either", () => {
    for (const storyPresentation of ["standard", "feature", "immersive", "split"] as const) {
      for (const siteNavigation of ["standard", "minimal"] as const) {
        expect(resolveStoryChrome({ id: 1, siteNavigation }, {})).toBe(siteNavigation);
        const root = render(base({ storyPresentation, siteNavigation })).querySelector("main")!;
        if (storyPresentation !== "standard") expect(root.getAttribute("data-site-navigation")).toBe(siteNavigation);
      }
    }
  });

  it("keeps the Standard header for a repository presentation", () => {
    expect(resolveStoryChrome({ id: 6, siteNavigation: "minimal" }, { 6: fixtureStoryPresentations[6] })).toBe("standard");
    expect(getStoryChrome({ id: 5, siteNavigation: "minimal" })).toBe("minimal");
  });

  it("renders the same article whatever the navigation (the layout owns the header)", () => {
    const standard = renderToStaticMarkup(<StoryArticle presentation={base({ id: 5, storyPresentation: "feature", siteNavigation: "standard" })} />);
    const minimal = renderToStaticMarkup(<StoryArticle presentation={base({ id: 5, storyPresentation: "feature", siteNavigation: "minimal" })} />);
    expect(minimal.replace('data-site-navigation="minimal"', 'data-site-navigation="standard"')).toBe(standard);
    expect(minimal).not.toContain("story-nav__");
    expect(minimal).not.toContain('class="story-nav');
  });
});

describe("Minimal story navigation", () => {
  const sections = [{ label: "News", url: "/category/news/" }, { label: "Sports", url: "/category/sports/" }];
  const markup = renderToStaticMarkup(
    <StoryNavigation publicationName="Weekly Wildcat" logoUrl="/brand/logo.svg" sections={sections} secondary={[{ label: "About us", url: "/about/" }]} />
  );
  const doc = dom(markup);

  it("has exactly menu, logo and search as visible controls, and none of the standard chrome", () => {
    const bar = doc.querySelector("[data-story-nav]")!;
    expect(bar.querySelector("[data-story-nav-open]")?.getAttribute("aria-label")).toBe("Open site navigation");
    expect(bar.querySelector(".story-nav__logo")?.getAttribute("href")).toBe("/");
    expect(bar.querySelector(".story-nav__logo")?.getAttribute("aria-label")).toBe("Weekly Wildcat home");
    const search = bar.querySelector('a[aria-label="Search Weekly Wildcat"]');
    expect(search?.getAttribute("href")).toBe("/search/");
    expect(markup).not.toContain("site-utility");
    expect(markup).not.toContain("section-nav");
    expect(markup).not.toContain("header-donate");
  });

  it("lists the configured sections in a labelled modal sheet", () => {
    const sheet = doc.querySelector("dialog")!;
    expect(sheet.getAttribute("aria-labelledby")).toBe("story-nav-menu-title");
    expect([...sheet.querySelectorAll(".story-nav__sections a")].map((a) => a.getAttribute("href"))).toEqual(["/category/news/", "/category/sports/"]);
    expect(sheet.querySelector("nav")?.getAttribute("aria-label")).toBe("Site sections");
    expect(sheet.querySelector('[aria-label="Close site navigation"]')).not.toBeNull();
    expect(sheet.querySelector(".story-nav__secondary a")?.getAttribute("href")).toBe("/about/");
  });

  it("shows the masthead logo, not the publication name as text, at the top of the sheet", () => {
    const title = doc.querySelector("dialog .story-nav__sheet-title")!;
    expect(title.getAttribute("href")).toBe("/");
    expect(title.getAttribute("aria-label")).toBe("Weekly Wildcat");
    expect(title.querySelector("img.story-nav__sheet-logo")?.getAttribute("src")).toBe("/brand/logo.svg");
    expect(title.textContent).toBe("");
  });

  it("orders the controls menu, logo, search for keyboard users", () => {
    const order = [...doc.querySelectorAll("[data-story-nav-open], .story-nav__logo, .story-nav__layer--end a")].map((el) => el.getAttribute("aria-label"));
    expect(order).toEqual(["Open site navigation", "Weekly Wildcat home", "Search Weekly Wildcat"]);
  });
});
