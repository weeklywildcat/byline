import type { AthleteSpotlightView, StoryView } from "@byline/ui";

/**
 * The presentation-neutral story record the canonical homepage resolver reads.
 *
 * Both hosts adapt their own transport into this shape: the static site from
 * build-time WordPress records, Studio from the authenticated REST API. Nothing
 * WordPress-, Next- or REST-shaped crosses this boundary, which is what allows
 * one resolver to serve both.
 *
 * The rendered views are supplied by the host rather than derived here. Deck
 * cleaning, date formatting and media selection are transport concerns that
 * differ in what they have available; story *selection* is not, and selection
 * is what this package owns.
 */
export type HomepageStoryInput = {
  id: number;
  sticky: boolean;
  // Section slugs, in the publication's own taxonomy vocabulary.
  categorySlugs: readonly string[];
  categoryIds: readonly number[];
  tagIds: readonly number[];
  authorId: number | null;
  hasFeaturedImage: boolean;
  // The two standing Weekly Wildcat editorial conventions. They are booleans
  // rather than tag lookups so the shared resolver never has to know which tag
  // slug a publication uses for them.
  isAthleteSpotlight: boolean;
  isSpecialCoverage: boolean;
  view: StoryView;
  // Used by packages configured for the cleaned two-sentence deck. Falls back
  // to `view` when the host cannot produce one.
  cleanDeckView?: StoryView;
  // Only read when this story becomes the athlete spotlight.
  athleteSpotlightView?: AthleteSpotlightView;
};

export function storyView(story: HomepageStoryInput, cleanDeck = false): StoryView {
  return cleanDeck ? story.cleanDeckView ?? story.view : story.view;
}
