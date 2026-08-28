import type { HomepagePublicationInput, HomepageStoryInput } from "@byline/content";
import type { BylinePublicationConfig } from "@byline/core";
import { isAthleteSpotlightPost, isSpecialCoveragePost } from "@/lib/content";
import { toAthleteSpotlightView, toStoryView } from "@/lib/story-view";
import { getPublicationConfig } from "@/lib/publication";
import { getFeaturedMedia, getPostCategories, type WordPressPost } from "@/lib/wordpress";

/**
 * The static site's adapter into the canonical homepage resolver.
 *
 * The build-time WordPress record is flattened here into the neutral story
 * input `@byline/content` reads. Studio has its own adapter over the REST
 * shape; from this point on both hosts run the identical selection and
 * resolution code.
 */
export function toHomepageStoryInput(post: WordPressPost): HomepageStoryInput {
  return {
    id: post.id,
    sticky: post.sticky === true,
    categorySlugs: getPostCategories(post).map((category) => category.slug),
    categoryIds: post.categories,
    tagIds: post.tags,
    authorId: post.author,
    hasFeaturedImage: Boolean(getFeaturedMedia(post)),
    isAthleteSpotlight: isAthleteSpotlightPost(post),
    isSpecialCoverage: isSpecialCoveragePost(post),
    view: toStoryView(post),
    cleanDeckView: toStoryView(post, { cleanDeck: true }),
    athleteSpotlightView: toAthleteSpotlightView(post)
  };
}

export function toHomepageStoryInputs(posts: readonly WordPressPost[]): HomepageStoryInput[] {
  return posts.map(toHomepageStoryInput);
}

export function toHomepagePublicationInput(
  publication: BylinePublicationConfig = getPublicationConfig(),
  calendarHeading?: string
): HomepagePublicationInput {
  return {
    shortName: publication.identity.shortName,
    // Defensive rather than strict: an installed site's stored publication
    // record, and several focused tests, carry only the fields their case
    // exercises. A missing optional field must not break homepage resolution.
    name: publication.identity.name ?? publication.identity.shortName,
    organizationName: publication.identity.organizationName ?? publication.identity.shortName,
    contactHref: publication.urls?.contact ?? "#contact",
    social: (publication.social ?? []).map((social) => ({
      label: social.label,
      url: social.url,
      service: social.service
    })),
    features: {
      polls: publication.features.polls === true,
      events: publication.features.events === true,
      sports: publication.features.sports === true,
      newsletter: publication.features.newsletter === true
    },
    calendarHeading: calendarHeading ?? (publication.appearance?.theme === "weekly-wildcat"
      ? "At NSHS"
      : `At ${publication.identity.organizationName ?? publication.identity.shortName}`)
  };
}
