import type { StoryPresentationEntry, StoryPresentationRegistry } from "./types";
import OverrideFixtureStory from "./stories/override-fixture";
import VisualFixtureStory from "./stories/visual-fixture";

/**
 * Stories with a custom presentation, keyed by WordPress post ID (never slug or
 * headline). A listed story always uses its entry, even if the author chose
 * Immersive in WordPress. A story that is not listed falls through to that
 * choice, then to the normal `ArticleView`; delete a line to put a story back.
 *
 *   384: NeedALift,       a presentation: WordPress body, custom arrangement
 *   402: LunchLine,       a flagship visual story (`defineVisualStory`): the
 *                         repository narrative replaces the WordPress body
 *
 * Scaffold one (this file is edited for you):
 *   npm run story-presentation -- create <post-id> <name> [--visual]
 * See docs/custom-story-presentations.md.
 */
export const storyPresentations: StoryPresentationRegistry = {
};

/**
 * Test-only: the fixture build (`BYLINE_CONTENT_MODE=weekly-wildcat-fixture`)
 * exercises the framework on a fixture story that WordPress also marks
 * Immersive, to prove the override wins, and on a visual story. Production
 * never sets that mode, so these IDs cannot match a real story.
 */
export const fixtureStoryPresentations: StoryPresentationRegistry = {
  6: OverrideFixtureStory,
  10: VisualFixtureStory
};

export function resolveStoryPresentation(registry: StoryPresentationRegistry, postId: number | string): StoryPresentationEntry | null {
  const id = Number(postId);
  return Number.isInteger(id) && Object.prototype.hasOwnProperty.call(registry, id) ? registry[id] : null;
}

/** The custom presentation or visual story registered for a WordPress post ID, or `null` for the default article. */
export function getStoryPresentation(postId: number | string): StoryPresentationEntry | null {
  const fixture = process.env.BYLINE_CONTENT_MODE === "weekly-wildcat-fixture";
  return resolveStoryPresentation(storyPresentations, postId) ?? (fixture ? resolveStoryPresentation(fixtureStoryPresentations, postId) : null);
}
