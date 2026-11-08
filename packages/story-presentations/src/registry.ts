import type { StoryPresentationIdentity } from "./resolve";
import type { StoryPresentationRegistry } from "./types";
import OverrideFixtureStory from "./stories/override-fixture";
import VisualFixtureStory from "./stories/visual-fixture";

/**
 * Stories with a custom presentation, keyed by the stable Story ID used by the
 * current CMS, never slug or headline. A WordPress migration may preserve the
 * numeric ID or remap it into Payload; register the post-import Payload Story
 * ID. The original WordPress ID remains import provenance. A listed
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

/**
 * The registry's identities as plain data (story ID to kind, name and title),
 * for a host that must describe presentations without loading any story's
 * code: the newsroom's server hands this to the Story header, which resolves
 * with the same `resolveStoryPresentation`.
 */
export function describeStoryPresentations(registry: StoryPresentationRegistry): Record<number, StoryPresentationIdentity> {
  return Object.fromEntries(Object.entries(registry).map(([id, entry]) => [Number(id), { kind: entry.kind, name: entry.name, title: entry.title }]));
}
