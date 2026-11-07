import type { ArticlePresentation, StoryPresentationChoice } from "./presentation";

/**
 * Which built-in opening a story gets, and why. This is the one rule for the
 * Standard/Immersive choice; the full resolver (`@byline/story-presentations`)
 * puts a repository custom presentation in front of it.
 *
 *   requested immersive + lead image (not a video story) → immersive
 *   requested immersive, no lead image                   → standard (missing-lead-image)
 *   requested immersive, video story                     → standard (video-story)
 *   otherwise                                            → standard
 */
export type BuiltInPresentationReason = "selected" | "missing-lead-image" | "video-story";

export type BuiltInPresentationResolution = {
  requested: StoryPresentationChoice;
  resolved: StoryPresentationChoice;
  reason: BuiltInPresentationReason;
};

export function resolveBuiltInPresentation(presentation: Pick<ArticlePresentation, "storyPresentation" | "image" | "video">): BuiltInPresentationResolution {
  const requested: StoryPresentationChoice = presentation.storyPresentation === "immersive" ? "immersive" : "standard";
  if (requested === "standard") return { requested, resolved: "standard", reason: "selected" };
  // A video story always opens on its player, never a fullscreen photo.
  if (presentation.video) return { requested, resolved: "standard", reason: "video-story" };
  if (!presentation.image?.src) return { requested, resolved: "standard", reason: "missing-lead-image" };
  return { requested, resolved: "immersive", reason: "selected" };
}

/** Whether the story opens Immersive. */
export function usesImmersivePresentation(presentation: Pick<ArticlePresentation, "storyPresentation" | "image" | "video">): boolean {
  return resolveBuiltInPresentation(presentation).resolved === "immersive";
}
