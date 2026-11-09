/**
 * The legacy Story layout preference's pure parts (docs/story-screen.md#legacy-layout).
 * The hook that stores it in Payload Preferences is story-layout.ts.
 */
export const STORY_LAYOUT_PREFERENCE_KEY = "byline:story:layout:v1";

export const STORY_LAYOUTS = ["focused", "tabs"] as const;
export type StoryLayout = (typeof STORY_LAYOUTS)[number];

/** Stored data is untrusted: anything but an explicit `tabs` is the default layout. */
export function normalizeStoryLayout(value: unknown): StoryLayout {
  const layout = value && typeof value === "object" ? (value as { layout?: unknown }).layout : value;
  return layout === "tabs" ? "tabs" : "focused";
}
