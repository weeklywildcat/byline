import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { getWeeklyWildcatHomeDesign, OPINION_PACKAGE_TYPE } from "@byline/design";
import { getOpinionPackageRenderer, type ResolvedOpinionPackage, type StoryView } from "@byline/ui";
import { WEEKLY_WILDCAT_PUBLICATION } from "@/lib/publication";
import { resolveHomepageDocument } from "@/lib/homepage-resolution";
import { type WordPressPost } from "@/lib/wordpress";
import { post } from "./fixtures/sports-fixture";

function posts(): WordPressPost[] {
  return [
    post(1, "sports", { athlete: true }),
    post(2, "news", { sticky: true }),
    post(3, "features", { image: true }),
    post(4, "news"),
    post(5, "opinion", { image: true }),
    post(6, "opinion"),
    post(7, "opinion"),
    post(8, "sports"),
    post(9, "news"),
    post(10, "culture"),
    post(11, "opinion"),
    post(12, "features")
  ];
}

function normalizeStory(story: StoryView): StoryView {
  return {
    ...story,
    href: `/story-${story.id}/`,
    deck: `deck-${story.id}`,
    deckIsHtml: false,
    isoDate: "2026-01-01T00:00:00",
    displayDate: "January 1, 2026",
    readingTime: null,
    category: story.category ? { name: "Category", href: "/category/opinion/" } : null,
    author: story.author ? { name: "Reporter", href: null } : null,
    image: story.image ? { ...story.image, src: `image-${story.id}`, alt: `alt-${story.id}` } : null
  };
}

function normalizeOpinion(resolved: ResolvedOpinionPackage): ResolvedOpinionPackage {
  return {
    ...resolved,
    lead: resolved.lead ? normalizeStory(resolved.lead) : null,
    rail: resolved.rail.map(normalizeStory)
  };
}

function opinionMarkup(resolved: ResolvedOpinionPackage) {
  const Renderer = getOpinionPackageRenderer("weekly-wildcat");

  return renderToStaticMarkup(<Renderer package={normalizeOpinion(resolved)} />);
}

function productionOpinion() {
  const entry = resolveHomepageDocument({
    document: getWeeklyWildcatHomeDesign("weekly-wildcat"),
    posts: posts(),
    publication: WEEKLY_WILDCAT_PUBLICATION,
    sportsSchedule: { recentScores: [], upcomingGames: [], schoolEvents: [] }
  }).packages.find((item) => item.type === OPINION_PACKAGE_TYPE);

  if (entry?.type !== OPINION_PACKAGE_TYPE) throw new Error("Production resolved no Opinion package.");

  return entry.package;
}

describe("Weekly Wildcat Opinion layout", () => {
  it("uses one opinion-lead card and one opinion card per remaining story", () => {
    const markup = opinionMarkup(productionOpinion());
    const production = productionOpinion();

    expect(markup.match(/home-story-opinion-lead/g)).toHaveLength(1);
    expect(markup.match(/home-story-opinion(?!-)/g) ?? []).toHaveLength(production.rail.length);
    // The configured Weekly Wildcat package is three stories; a package that
    // silently grew to five is exactly the divergence this guards.
    expect(1 + production.rail.length).toBe(3);
  });
});
