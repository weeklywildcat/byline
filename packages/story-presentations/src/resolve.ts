import { resolveBuiltInPresentation, type BuiltInPresentationInput, type BuiltInPresentationReason, type StoryPresentationChoice } from "@byline/content/story";

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
 *
 * It reads only an entry's identity (`kind`, `name`, `title`), never its
 * component, so the newsroom's Story header can resolve from plain metadata
 * (`describeStoryPresentations`) without loading any story's React code. This
 * module imports nothing from the registry for that reason.
 */
export type StoryPresentationReason = BuiltInPresentationReason | "custom-presentation" | "visual-story";

export type StoryPresentationIdentity = { readonly kind: "presentation" | "visual-story"; readonly name: string; readonly title: string };

export type StoryPresentationResolution<Entry extends StoryPresentationIdentity = StoryPresentationIdentity> = {
  /** The author's built-in choice. */
  requested: StoryPresentationChoice;
  resolved: "custom" | StoryPresentationChoice;
  reason: StoryPresentationReason;
  /** The repository entry, when one is registered. */
  custom: { name: string; title: string; kind: Entry["kind"] } | null;
  entry: Entry | null;
};

/** The entry registered for a story ID, or `null`. Only integer IDs match; never a slug, a prototype key or an empty value. */
export function findStoryPresentation<Entry>(registry: Readonly<Record<number, Entry>>, storyId: number | string): Entry | null {
  const id = Number(storyId);
  return Number.isInteger(id) && Object.prototype.hasOwnProperty.call(registry, id) ? registry[id] : null;
}

export function resolveStoryPresentation<Entry extends StoryPresentationIdentity>(
  presentation: BuiltInPresentationInput & { id: number | string },
  registry: Readonly<Record<number, Entry>>
): StoryPresentationResolution<Entry> {
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
