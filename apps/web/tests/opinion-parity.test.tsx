import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { getWeeklyWildcatCompatibilityDesign, OPINION_PACKAGE_TYPE } from "@byline/design";
import { resolveHomepageDocument as resolveSharedHomepageDocument } from "@byline/content";
import { getOpinionPackageRenderer, type ResolvedOpinionPackage, type StoryView } from "@byline/ui";
import { WEEKLY_WILDCAT_PUBLICATION } from "@/lib/publication";
import { resolveHomepageDocument } from "@/lib/homepage-resolution";
import { getFeaturedMedia, getPostCategories, getPostTags, type WordPressPost } from "@/lib/wordpress";
import { toPreviewData, type PreviewPost } from "../../../wordpress-plugin/src/studio-preview-model";
import { post } from "./fixtures/sports-fixture";

// Opinion is the package that looked wrong in production Studio -- visibly
// taller than the live section. Height is not something to clamp; it is a
// consequence of how many stories a package holds, which ones, and which card
// variant each gets. This file asserts those three things are identical in both
// hosts by rendering both resolutions through the one shared renderer and
// comparing the markup.

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

function toPreviewPost(source: WordPressPost): PreviewPost {
  const media = getFeaturedMedia(source);

  return {
    id: source.id,
    title: { rendered: source.title.rendered },
    excerpt: { rendered: source.excerpt.rendered },
    content: { rendered: source.content.rendered },
    date: source.date,
    link: source.link,
    sticky: source.sticky,
    categories: source.categories,
    tags: source.tags,
    author: source.author,
    _embedded: {
      "wp:featuredmedia": media
        ? [{ source_url: media.source_url, alt_text: media.alt_text, media_details: media.media_details }]
        : [],
      "wp:term": [
        getPostCategories(source).map((category) => ({
          id: category.id,
          taxonomy: "category",
          name: category.name,
          slug: category.slug
        })),
        getPostTags(source).map((entry) => ({ id: entry.id, taxonomy: "post_tag", name: entry.name, slug: entry.slug }))
      ]
    }
  };
}

/**
 * Collapses the fields that legitimately differ between a build-time record and
 * a REST record -- link formatting, locale date rendering, embedded author and
 * term payloads -- so what remains to compare is the resolution itself.
 */
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
    document: getWeeklyWildcatCompatibilityDesign("weekly-wildcat"),
    posts: posts(),
    publication: WEEKLY_WILDCAT_PUBLICATION,
    sportsSchedule: { recentScores: [], upcomingGames: [], schoolEvents: [] }
  }).packages.find((item) => item.type === OPINION_PACKAGE_TYPE);

  if (entry?.type !== OPINION_PACKAGE_TYPE) throw new Error("Production resolved no Opinion package.");

  return entry.package;
}

function studioOpinion() {
  const data = toPreviewData({ posts: posts().map(toPreviewPost) });
  const entry = resolveSharedHomepageDocument({
    document: getWeeklyWildcatCompatibilityDesign("weekly-wildcat"),
    stories: data.stories,
    publication: {
      shortName: WEEKLY_WILDCAT_PUBLICATION.identity.shortName,
      name: WEEKLY_WILDCAT_PUBLICATION.identity.name,
      organizationName: WEEKLY_WILDCAT_PUBLICATION.identity.organizationName,
      contactHref: WEEKLY_WILDCAT_PUBLICATION.urls.contact,
      social: WEEKLY_WILDCAT_PUBLICATION.social,
      features: {
        polls: WEEKLY_WILDCAT_PUBLICATION.features.polls,
        events: WEEKLY_WILDCAT_PUBLICATION.features.events,
        sports: WEEKLY_WILDCAT_PUBLICATION.features.sports,
        newsletter: WEEKLY_WILDCAT_PUBLICATION.features.newsletter
      },
      calendarHeading: "At NSHS"
    },
    sportsSchedule: { recentScores: [], upcomingGames: [] }
  }).packages.find((item) => item.type === OPINION_PACKAGE_TYPE);

  if (entry?.type !== OPINION_PACKAGE_TYPE) throw new Error("Studio resolved no Opinion package.");

  return entry.package;
}

describe("Opinion parity between Studio and production", () => {
  it("renders identical markup through the one shared renderer", () => {
    expect(opinionMarkup(studioOpinion())).toBe(opinionMarkup(productionOpinion()));
  });

  it("holds the same stories in the same order", () => {
    const production = productionOpinion();
    const studio = studioOpinion();

    expect([studio.lead?.id, ...studio.rail.map((story) => story.id)]).toEqual([
      production.lead?.id,
      ...production.rail.map((story) => story.id)
    ]);
  });

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
