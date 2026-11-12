import type {
  ChapterHeight,
  ChapterKind,
  FeatureMediaPhoneOrder,
  FeatureMediaPresentation,
  OverlayTone,
  PhonePresentation,
  Placement,
  PortraitTextBlock,
  PhotoBlock,
  PullQuoteBlock,
  PullQuotePresentation,
  ScrimStrength,
  VisualChapterBlock
} from "./types";

/**
 * Presentation: how strongly a story block interrupts or expands the reading
 * column. A small, fixed set of newsroom-designed presets per block, stored as
 * semantic choices and never as sizes, colours or CSS (docs/story-presentation.md).
 *
 * Every field is optional and its absence means what the block looked like
 * before the field existed, so stored `byline-v1` bodies keep their
 * appearance. The resolvers below are the one reading of those defaults: the
 * renderer, the editor and the tests ask them rather than re-deriving a rule.
 *
 * Labels and descriptions are newsroom language, shared by every adapter
 * (Payload select options, the editor's Presentation surface).
 */

export type PresetOption<T extends string> = { value: T; label: string; description: string };

export const PHONE_PRESENTATIONS: readonly PhonePresentation[] = ["auto", "inset", "bleed"];
export const PHONE_PRESENTATION_OPTIONS: ReadonlyArray<PresetOption<PhonePresentation>> = [
  { value: "auto", label: "Auto", description: "Column photos stay inset; wide and full photos reach the edges of a phone." },
  { value: "inset", label: "Inset", description: "The photo keeps the story's margins on a phone." },
  { value: "bleed", label: "Edge to edge", description: "The photo reaches both edges of a phone. The caption stays inset." }
];

export const PLACEMENT_OPTIONS: ReadonlyArray<PresetOption<Placement>> = [
  { value: "column", label: "Reading column", description: "As wide as the text." },
  { value: "wide", label: "Wide", description: "Wider than the text, a visual moment." },
  { value: "full", label: "Full width", description: "As wide as the page allows." }
];

export const PULL_QUOTE_PRESENTATIONS: readonly PullQuotePresentation[] = ["standard", "breakout", "full"];
export const PULL_QUOTE_OPTIONS: ReadonlyArray<PresetOption<PullQuotePresentation>> = [
  { value: "standard", label: "Standard", description: "A restrained line between rules, in the reading column." },
  { value: "breakout", label: "Breakout", description: "Larger, with room around it, reaching past the column on wide screens." },
  { value: "full", label: "Full", description: "A major pause in the story, as wide as the article." }
];

export const FEATURE_MEDIA_PRESENTATIONS: readonly FeatureMediaPresentation[] = ["split", "breakout", "spotlight", "sticky"];
export const FEATURE_MEDIA_OPTIONS: ReadonlyArray<PresetOption<FeatureMediaPresentation>> = [
  { value: "split", label: "Split", description: "Photo beside the passage. One after the other on a phone." },
  { value: "breakout", label: "Breakout", description: "A large photo carries the moment, with a short passage beside or below it." },
  { value: "spotlight", label: "Spotlight", description: "A big photo with a few words set on it on wide screens; photo, then words, on a phone." },
  { value: "sticky", label: "Sticky", description: "The photo stays in view while the passage beside it is read. One after the other on a phone." }
];
export const FEATURE_MEDIA_PHONE_ORDERS: readonly FeatureMediaPhoneOrder[] = ["media", "text"];
export const FEATURE_MEDIA_PHONE_ORDER_OPTIONS: ReadonlyArray<PresetOption<FeatureMediaPhoneOrder>> = [
  { value: "media", label: "Photo first", description: "The photo, then the passage." },
  { value: "text", label: "Text first", description: "The passage, then the photo." }
];
/** Feature Media on a phone has no Auto row: the presentation sets its own default (see `featureMediaPhone`). */
export const FEATURE_MEDIA_PHONE_OPTIONS: ReadonlyArray<PresetOption<PhonePresentation>> = PHONE_PRESENTATION_OPTIONS.map((option) => (option.value === "auto" ? { ...option, description: "Split and Sticky stay inset; Breakout and Spotlight reach the edges of a phone." } : option));

export const OVERLAY_TONES: readonly OverlayTone[] = ["light", "dark"];
export const OVERLAY_TONE_OPTIONS: ReadonlyArray<PresetOption<OverlayTone>> = [
  { value: "light", label: "Light text", description: "White words on a darkened photo." },
  { value: "dark", label: "Dark text", description: "Dark words on a lightened photo." }
];
export const SCRIM_STRENGTHS: readonly ScrimStrength[] = ["subtle", "standard", "strong"];
export const SCRIM_OPTIONS: ReadonlyArray<PresetOption<ScrimStrength>> = [
  { value: "subtle", label: "Subtle", description: "For a calm photo with an even, uncluttered area behind the words." },
  { value: "standard", label: "Standard", description: "Readable over most photos." },
  { value: "strong", label: "Strong", description: "For a busy or bright photo." }
];

export const CHAPTER_KINDS: readonly ChapterKind[] = ["media", "text", "split"];
export const CHAPTER_KIND_OPTIONS: ReadonlyArray<PresetOption<ChapterKind>> = [
  { value: "media", label: "Photo", description: "The heading over a photograph." },
  { value: "text", label: "Text", description: "A typographic break: no photograph needed." },
  { value: "split", label: "Split", description: "Photograph and heading side by side; photograph first on a phone." }
];
export const CHAPTER_HEIGHTS: readonly ChapterHeight[] = ["short", "half", "full"];
export const CHAPTER_HEIGHT_OPTIONS: ReadonlyArray<PresetOption<ChapterHeight>> = [
  { value: "short", label: "Short", description: "A band across the story." },
  { value: "half", label: "Half screen", description: "About half the screen." },
  { value: "full", label: "Full screen", description: "The whole screen, on any device." }
];

// ---------------------------------------------------------------------------
// Resolvers: what an absent or unknown choice means.
// ---------------------------------------------------------------------------

const oneOf = <T extends string>(values: readonly T[], value: unknown): T | undefined => (typeof value === "string" && (values as readonly string[]).includes(value) ? (value as T) : undefined);

/** A stored choice, or `undefined` when it is absent or not one of the presets (an unknown value falls back to the default). */
export const presetValue = oneOf;

/** Whether a Photo reaches the edges of a phone. Auto: column photos stay inset; wide and full photos bleed. */
export function photoPhone(block: Pick<PhotoBlock, "placement" | "phone">): "inset" | "bleed" {
  const phone = oneOf(PHONE_PRESENTATIONS, block.phone) ?? "auto";
  if (phone !== "auto") return phone;
  return block.placement === "column" ? "inset" : "bleed";
}

export function pullQuotePresentation(block: Pick<PullQuoteBlock, "presentation">): PullQuotePresentation {
  return oneOf(PULL_QUOTE_PRESENTATIONS, block.presentation) ?? "standard";
}

/** Feature Media's preset. Absent is Split: every Portrait + Text saved before presets existed. */
export function featureMediaPresentation(block: Pick<PortraitTextBlock, "presentation">): FeatureMediaPresentation {
  return oneOf(FEATURE_MEDIA_PRESENTATIONS, block.presentation) ?? "split";
}

/** Which comes first on a phone. Only Split offers Text first; every other preset leads with the photo. */
export function featureMediaPhoneOrder(block: Pick<PortraitTextBlock, "presentation" | "phoneOrder">): FeatureMediaPhoneOrder {
  return featureMediaPresentation(block) === "split" && block.phoneOrder === "text" ? "text" : "media";
}

/** Whether Feature Media's photo reaches the edges of a phone. Auto: Breakout and Spotlight do; Split and Sticky stay inset. */
export function featureMediaPhone(block: Pick<PortraitTextBlock, "presentation" | "phone">): "inset" | "bleed" {
  const phone = oneOf(PHONE_PRESENTATIONS, block.phone) ?? "auto";
  if (phone !== "auto") return phone;
  const presentation = featureMediaPresentation(block);
  return presentation === "breakout" || presentation === "spotlight" ? "bleed" : "inset";
}

/** Where Feature Media sits: Split and Sticky are wide moments, Breakout is wide, Spotlight is full width. */
export function featureMediaPlacement(block: Pick<PortraitTextBlock, "presentation">): Placement {
  return featureMediaPresentation(block) === "spotlight" ? "full" : "wide";
}

/** Text over a Spotlight photo: light words on a standard scrim unless the writer chose otherwise. */
export function overlayTone(value: unknown): OverlayTone {
  return oneOf(OVERLAY_TONES, value) ?? "light";
}
export function scrimStrength(value: unknown): ScrimStrength {
  return oneOf(SCRIM_STRENGTHS, value) ?? "standard";
}

/** A Chapter's kind. Absent is a photo chapter: every Visual Chapter saved before kinds existed. */
export function chapterKind(block: Pick<VisualChapterBlock, "kind">): ChapterKind {
  return oneOf(CHAPTER_KINDS, block.kind) ?? "media";
}

/**
 * A photo or split chapter's height, or `undefined` for one saved before
 * heights existed: it keeps its original proportion (between Half and Full).
 * A text chapter has no height.
 */
export function chapterHeight(block: Pick<VisualChapterBlock, "kind" | "height">): ChapterHeight | undefined {
  if (chapterKind(block) === "text") return undefined;
  return oneOf(CHAPTER_HEIGHTS, block.height);
}

/**
 * The colour of a chapter's words. Over a photograph they are light unless the
 * writer chose dark (on a lightened photo); a text or split chapter sits on the
 * page with dark words unless the writer chose light (on a dark band).
 */
export function chapterTone(block: Pick<VisualChapterBlock, "kind" | "tone">): OverlayTone {
  return oneOf(OVERLAY_TONES, block.tone) ?? (chapterKind(block) === "media" ? "light" : "dark");
}

/** Whether a chapter needs its photograph. A text chapter does not. */
export function chapterNeedsMedia(block: Pick<VisualChapterBlock, "kind">): boolean {
  return chapterKind(block) !== "text";
}

// ---------------------------------------------------------------------------
// Which choices apply: the editor shows only these, and finalizing keeps only
// these, so a writer never sees (and a body never stores) a setting that does
// nothing for what is chosen now.
// ---------------------------------------------------------------------------

export type FeatureMediaChoice = "layout" | "side" | "tone" | "scrim" | "phoneOrder" | "phone" | "crops";
export function featureMediaChoices(presentation: FeatureMediaPresentation): FeatureMediaChoice[] {
  switch (presentation) {
    case "split":
      return ["layout", "side", "phoneOrder", "phone"];
    case "breakout":
    case "sticky":
      return ["layout", "side", "phone"];
    case "spotlight":
      return ["layout", "tone", "scrim", "phone", "crops"];
  }
}

export type ChapterChoice = "kind" | "height" | "width" | "align" | "tone" | "scrim" | "crops";
export function chapterChoices(kind: ChapterKind): ChapterChoice[] {
  switch (kind) {
    case "media":
      return ["kind", "height", "width", "align", "tone", "scrim", "crops"];
    case "split":
      return ["kind", "height", "width", "align", "tone"];
    case "text":
      return ["kind", "width", "align", "tone"];
  }
}
