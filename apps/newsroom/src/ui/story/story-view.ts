/**
 * Where in a Story the reader is (docs/story-screen.md). The Story itself is
 * the default; Reporting, Review and History are deliberate focused modes
 * with "Back to story", never peer tabs. The address carries the mode so a
 * link, Back/Forward and a reload land in the same place.
 *
 * These are implementation state, not equal navigation: Reporting has a
 * labeled header button and "Open reporting" in Story Context, History is in
 * the overflow menu, Review appears only for someone with a review to do.
 * No tab bar or mode switcher renders them side by side.
 *
 * Older links still work: `?tab=reporting` and `?tab=history` open those
 * modes, `?tab=plan` and `?tab=write` open the Story (Plan no longer exists;
 * its parts live in Story Context and Reporting). `?appointment=` and
 * `?transcript=` open Reporting on that record. An ordinary Story link never
 * picks a mode from the lifecycle.
 */

export const STORY_VIEWS = ["story", "reporting", "review", "history"] as const;
export type StoryView = (typeof STORY_VIEWS)[number];

/** What a capture shortcut in Story Context asks Reporting to open. */
export const CAPTURE_INTENTS = ["note", "record", "file", "photo", "link", "transcript"] as const;
export type CaptureIntent = (typeof CAPTURE_INTENTS)[number];

export type StoryLocation = { view: StoryView; capture: CaptureIntent | null; transcript: number | null; context: boolean; appointment: string };

export function parseStoryLocation(search: string): StoryLocation {
  const params = new URLSearchParams(search);
  const requested = params.get("view") ?? "";
  const legacy = params.get("tab") ?? "";
  // An appointment or transcript link is reporting intent: it lands in Reporting on that record.
  const reportingIntent = params.has("appointment") || params.has("transcript");
  const view: StoryView = (STORY_VIEWS as readonly string[]).includes(requested)
    ? (requested as StoryView)
    : legacy === "reporting" || legacy === "history" ? legacy : reportingIntent ? "reporting" : "story";
  const capture = params.get("capture") ?? "";
  const transcript = Number(params.get("transcript"));
  return {
    view,
    capture: (CAPTURE_INTENTS as readonly string[]).includes(capture) ? (capture as CaptureIntent) : null,
    transcript: Number.isSafeInteger(transcript) && transcript > 0 ? transcript : null,
    // An old Plan link opens the ordinary Story with its context showing (Plan no longer exists).
    context: legacy === "plan",
    appointment: params.get("appointment") ?? ""
  };
}

/** The address for a mode, keeping unrelated parameters and dropping the old `tab`. */
export function storyLocationSearch(search: string, view: StoryView, extra: { capture?: CaptureIntent | null; transcript?: number | null } = {}): string {
  const params = new URLSearchParams(search);
  params.delete("tab");
  params.delete("capture");
  params.delete("transcript");
  // A deep link is consumed once; going back to the Story must not reopen it.
  if (view !== "reporting") params.delete("appointment");
  if (view === "story") params.delete("view");
  else params.set("view", view);
  if (extra.capture) params.set("capture", extra.capture);
  if (extra.transcript) params.set("transcript", String(extra.transcript));
  const text = params.toString();
  return text ? `?${text}` : "";
}
