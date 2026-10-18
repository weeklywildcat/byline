import type { StoryPresentationComponent, StoryPresentationRegistry } from "./types";
import RevealFixtureStory from "./stories/reveal-fixture";

/**
 * Stories with a custom presentation, keyed by WordPress post ID (never slug or
 * headline). A story that is not listed renders through the normal
 * `ArticleView`; delete a line to put a story back on it.
 *
 *   384: NeedALift,
 *
 * Scaffold one (this file is edited for you): npm run story-presentation -- create <post-id> <name>
 * See docs/custom-story-presentations.md.
 */
export const storyPresentations: StoryPresentationRegistry = {
};

/**
 * Test-only: the fixture build (`BYLINE_CONTENT_MODE=weekly-wildcat-fixture`)
 * exercises the framework on a fixture story. Production never sets that mode, so
 * these IDs cannot match a real story.
 */
export const fixtureStoryPresentations: StoryPresentationRegistry = {
  8: RevealFixtureStory
};

export function resolveStoryPresentation(registry: StoryPresentationRegistry, postId: number | string): StoryPresentationComponent | null {
  const id = Number(postId);
  return Number.isInteger(id) && Object.prototype.hasOwnProperty.call(registry, id) ? registry[id] : null;
}

/** The custom presentation registered for a WordPress post ID, or `null` for the default article. */
export function getStoryPresentation(postId: number | string): StoryPresentationComponent | null {
  const fixture = process.env.BYLINE_CONTENT_MODE === "weekly-wildcat-fixture";
  return resolveStoryPresentation(storyPresentations, postId) ?? (fixture ? resolveStoryPresentation(fixtureStoryPresentations, postId) : null);
}
