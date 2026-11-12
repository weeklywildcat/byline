import { STORY_PRESENTATION_CHOICES, type StoryPresentationChoice, type StorySiteNavigation } from "./presentation";

/** What the resolution rule reads: a story's choice, whether it has a lead image and whether it is a video story. */
export type BuiltInPresentationInput = {
  storyPresentation?: StoryPresentationChoice | null;
  image?: { src?: string | null } | null;
  video?: unknown;
};

/**
 * Which built-in opening a story gets, and why. This is the one rule for the
 * Standard / Feature / Immersive / Split choice; the full resolver
 * (`@byline/story-presentations`) puts a repository custom presentation in
 * front of it.
 *
 *   requested standard                                            → standard
 *   requested feature | immersive | split + lead image (no video) → as requested
 *   requested a photographic opening, no lead image               → standard (missing-lead-image)
 *   requested a photographic opening, video story                 → standard (video-story)
 *
 * An unknown or absent value is Standard, so stories published before the
 * Feature and Split openings keep their appearance.
 */
export type BuiltInPresentationReason = "selected" | "missing-lead-image" | "video-story";

export type BuiltInPresentationResolution = {
  requested: StoryPresentationChoice;
  resolved: StoryPresentationChoice;
  reason: BuiltInPresentationReason;
};

/** The author's choice, narrowed: anything that is not a known opening is Standard. */
export function requestedPresentation(value: unknown): StoryPresentationChoice {
  return (STORY_PRESENTATION_CHOICES as readonly unknown[]).includes(value) ? (value as StoryPresentationChoice) : "standard";
}

export function resolveBuiltInPresentation(presentation: BuiltInPresentationInput): BuiltInPresentationResolution {
  const requested = requestedPresentation(presentation.storyPresentation);
  if (requested === "standard") return { requested, resolved: "standard", reason: "selected" };
  // A video story always opens on its player, never a photographic opening.
  if (presentation.video) return { requested, resolved: "standard", reason: "video-story" };
  if (!presentation.image?.src) return { requested, resolved: "standard", reason: "missing-lead-image" };
  return { requested, resolved: requested, reason: "selected" };
}

/** Whether the story opens Immersive. */
export function usesImmersivePresentation(presentation: BuiltInPresentationInput): boolean {
  return resolveBuiltInPresentation(presentation).resolved === "immersive";
}

/**
 * The site chrome a story asks for. Orthogonal to the opening: it is never
 * derived from, nor silently changed by, the hero choice. Anything but
 * `minimal` is Standard, so every older story keeps the normal header.
 */
export function resolveSiteNavigation(presentation: { siteNavigation?: StorySiteNavigation | null }): StorySiteNavigation {
  return presentation.siteNavigation === "minimal" ? "minimal" : "standard";
}
