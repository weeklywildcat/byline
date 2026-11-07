import type { StoryPresentationEntry, StoryPresentationRegistry } from "./types";
import OverrideFixtureStory from "./stories/override-fixture";
import VisualFixtureStory from "./stories/visual-fixture";

/**
 * Stories with a custom presentation, keyed by stable story ID (the WordPress
 * post ID; imported Payload stories keep it), never slug or headline. A listed
 * story always uses its entry, even if the author chose Immersive. A story
 * that is not listed falls through to that choice, then to the normal
 * `ArticleView`; delete a line to put a story back.
 *
 *   384: NeedALift,       a presentation: the CMS body, custom arrangement
 *   402: LunchLine,       a flagship visual story (`defineVisualStory`): the
 *                         repository narrative replaces the CMS body
 *
 * Scaffold one (this file is edited for you):
 *   npm run story-presentation -- create <story-id> <name> [--visual]
 * See docs/custom-story-presentations.md.
 */
export const storyPresentations: StoryPresentationRegistry = {
};

/**
 * Test and development only: fixture stories that prove the framework (an
 * override that beats Immersive, and a visual story). Hosts opt in
 * explicitly (`storyPresentationRegistry({ fixtures: true })`): the public
 * fixture build (`BYLINE_CONTENT_MODE=weekly-wildcat-fixture`) and a newsroom
 * development server with `BYLINE_STORY_PRESENTATION_FIXTURES=1`. Production
 * never does, so these IDs cannot match a real story.
 */
export const fixtureStoryPresentations: StoryPresentationRegistry = {
  6: OverrideFixtureStory,
  10: VisualFixtureStory
};

/** The registry a host renders with: the public entries, plus the fixtures when it opts in. */
export function storyPresentationRegistry({ fixtures = false }: { fixtures?: boolean } = {}): StoryPresentationRegistry {
  return fixtures ? { ...fixtureStoryPresentations, ...storyPresentations } : storyPresentations;
}

/** The entry registered for a story ID, or `null`. Only integer IDs match; never a slug, a prototype key or an empty value. */
export function findStoryPresentation(registry: StoryPresentationRegistry, storyId: number | string): StoryPresentationEntry | null {
  const id = Number(storyId);
  return Number.isInteger(id) && Object.prototype.hasOwnProperty.call(registry, id) ? registry[id] : null;
}
