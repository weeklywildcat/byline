import type { HomepageStoryInput } from "./story";

// The compatibility homepage selection pass.
//
// Moved verbatim (behaviour, not text) from the pre-Studio
// `resolveWeeklyWildcatHomepage`, and generalised from WordPress records to the
// neutral `HomepageStoryInput`. It is the one ordered de-duplication algorithm:
// it walks a single used-story set and assigns each story to the first slot
// that claims it, which is what keeps the homepage free of cross-package
// duplicates.
//
// The order below is the historical *selection* order, which is deliberately
// not the visual package order: The Latest and The Brief are resolved last, so
// they receive what the semantic packages did not take.

export type HomepageSelection = {
  athleteSpotlightStory: HomepageStoryInput | null;
  leadStory: HomepageStoryInput | null;
  inFocusStory: HomepageStoryInput | null;
  specialCoverageStories: HomepageStoryInput[];
  opinionStories: HomepageStoryInput[];
  fieldStories: HomepageStoryInput[];
  moreStories: HomepageStoryInput[];
  latestStories: HomepageStoryInput[];
  briefStories: HomepageStoryInput[];
  usedStoryIds: Set<number>;
};

export function storyHasSection(story: HomepageStoryInput, slugs: readonly string[]) {
  const wanted = new Set(slugs);

  return story.categorySlugs.some((slug) => wanted.has(slug));
}

export function takeUnusedStories(
  stories: readonly HomepageStoryInput[],
  usedStoryIds: Set<number>,
  count: number,
  predicate: (story: HomepageStoryInput) => boolean = () => true
) {
  const selected: HomepageStoryInput[] = [];

  for (const story of stories) {
    if (usedStoryIds.has(story.id) || !predicate(story)) continue;

    selected.push(story);
    usedStoryIds.add(story.id);

    if (selected.length === count) break;
  }

  return selected;
}

function takeDiverseUnusedStories(
  stories: readonly HomepageStoryInput[],
  usedStoryIds: Set<number>,
  count: number,
  sectionSlugs: readonly string[]
) {
  const selected: HomepageStoryInput[] = [];
  const oldestFirst = [...stories].reverse();

  const add = (story: HomepageStoryInput) => {
    selected.push(story);
    usedStoryIds.add(story.id);
  };

  for (const slug of sectionSlugs) {
    const story = oldestFirst.find(
      (candidate) => !usedStoryIds.has(candidate.id) && storyHasSection(candidate, [slug])
    );

    if (story) add(story);
    if (selected.length === count) return selected;
  }

  for (const story of oldestFirst) {
    if (usedStoryIds.has(story.id)) continue;

    add(story);
    if (selected.length === count) break;
  }

  return selected;
}

/**
 * Runs the ordered compatibility selection over the whole story list.
 *
 * `reservedStoryIds` are stories an editor pinned into a specific package. They
 * are seeded into the used set before anything else, so no automatic slot can
 * claim them first and the pinning package places them itself. An empty set --
 * which is what every design without a manual source produces -- leaves the
 * algorithm unchanged.
 */
export function resolveCompatibilityHomepageSelection(
  stories: readonly HomepageStoryInput[],
  reservedStoryIds?: ReadonlySet<number>
): HomepageSelection {
  const usedStoryIds = new Set<number>(reservedStoryIds ?? []);
  const athleteSpotlightStory = stories.find((story) => story.isAthleteSpotlight) ?? null;

  if (athleteSpotlightStory) usedStoryIds.add(athleteSpotlightStory.id);

  const leadStory =
    stories.find((story) => !usedStoryIds.has(story.id) && story.sticky) ??
    stories.find((story) => !usedStoryIds.has(story.id)) ??
    null;

  if (leadStory) usedStoryIds.add(leadStory.id);

  const inFocusStory =
    takeUnusedStories(
      stories,
      usedStoryIds,
      1,
      (story) => story.hasFeaturedImage && storyHasSection(story, ["features", "culture"])
    )[0] ?? null;
  const specialCoverageStories = takeUnusedStories(stories, usedStoryIds, 3, (story) => story.isSpecialCoverage);
  const opinionStories = takeUnusedStories(stories, usedStoryIds, 3, (story) => storyHasSection(story, ["opinion"]));
  const fieldStories = takeUnusedStories(stories, usedStoryIds, 3, (story) => storyHasSection(story, ["sports"]));
  const moreStories = takeDiverseUnusedStories(stories, usedStoryIds, 4, [
    "news",
    "features",
    "culture",
    "opinion",
    "sports"
  ]);
  const latestStories = takeUnusedStories(stories, usedStoryIds, 4);
  const briefStories = takeUnusedStories(stories, usedStoryIds, 4);

  return {
    athleteSpotlightStory,
    leadStory,
    inFocusStory,
    specialCoverageStories,
    opinionStories,
    fieldStories,
    moreStories,
    latestStories,
    briefStories,
    usedStoryIds
  };
}
