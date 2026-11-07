import { resolveBuiltInPresentation, type BuiltInPresentationInput, type BuiltInPresentationReason, type StoryPresentationChoice } from "@byline/content/story";
import { findStoryPresentation } from "./registry";
import type { StoryPresentationEntry, StoryPresentationRegistry } from "./types";

/**
 * The one presentation resolver. In order:
 *
 *  1. a repository entry registered for the story's ID (always wins);
 *  2. Immersive, when the author chose it and the story has a lead image
 *     (and is not a video story);
 *  3. Standard.
 *
 * `StoryArticle` renders from this, and the newsroom explains it from the same
 * result ("Previewing as Standard: Immersive requires a lead image", "Custom
 * presentation: Election Results 2026"), so the two cannot disagree.
 */
export type StoryPresentationReason = BuiltInPresentationReason | "custom-presentation" | "visual-story";

export type StoryPresentationResolution = {
  /** The author's built-in choice. */
  requested: StoryPresentationChoice;
  resolved: "custom" | StoryPresentationChoice;
  reason: StoryPresentationReason;
  /** The repository entry, when one is registered. */
  custom: { name: string; title: string; kind: StoryPresentationEntry["kind"] } | null;
  entry: StoryPresentationEntry | null;
};

export function resolveStoryPresentation(
  presentation: BuiltInPresentationInput & { id: number | string },
  registry: StoryPresentationRegistry
): StoryPresentationResolution {
  const builtIn = resolveBuiltInPresentation(presentation);
  const entry = findStoryPresentation(registry, presentation.id);
  if (entry) {
    return {
      requested: builtIn.requested,
      resolved: "custom",
      reason: entry.kind === "visual-story" ? "visual-story" : "custom-presentation",
      custom: { name: entry.name, title: entry.title, kind: entry.kind },
      entry
    };
  }
  return { requested: builtIn.requested, resolved: builtIn.resolved, reason: builtIn.reason, custom: null, entry: null };
}
