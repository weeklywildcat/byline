import { DESTINATION_KINDS, DESTINATIONS, isDestinationKind, joined, type DestinationDescriptor, type DestinationKind, type StoryFacts } from "./destinations";

/**
 * Distribution's pure rules (docs/distribution.md): settings and policy,
 * inheritance, readiness, state transitions, "needs attention" and the sent
 * snapshot. The Payload side is `server.ts`; nothing here reads a database.
 *
 * Product law: pending channel content inherits the Story; a slot diverges
 * only when someone chooses Custom; what actually went out is frozen at the
 * Posted boundary.
 */

/* ------------------------------------------------------------------ settings */

/** prepare: seeded as work to do. eligible: seeded, not urgent. optional: suggested on the Story, never seeded. */
export const DISTRIBUTION_LEVELS = ["prepare", "eligible", "optional"] as const;
export type DistributionLevel = (typeof DISTRIBUTION_LEVELS)[number];

export type DestinationSetting = { kind: DestinationKind; enabled: boolean; label: string; accountUrl: string | null; requiresApproval: boolean };
export type PolicyRule = { destination: DestinationKind; level: DistributionLevel; presets: string[]; sections: number[] };
export type DistributionSettings = { destinations: Record<DestinationKind, DestinationSetting>; rules: PolicyRule[] };

const destinationDefaults = (kind: DestinationKind, enabled: boolean, requiresApproval: boolean): DestinationSetting => ({ kind, enabled, label: DESTINATIONS[kind].label, accountUrl: null, requiresApproval });

/**
 * The starter configuration, used until an administrator saves Distribution
 * settings (and shown there as the defaults): Instagram and Facebook are
 * prepared for every published Story and need an editor's approval when a
 * staff member prepared them; the newsletter is eligible; School TVs are
 * offered. Discord, YouTube and Other are off until configured. No account
 * addresses: those are the publication's to enter.
 */
export function defaultDistributionSettings(): DistributionSettings {
  return {
    destinations: {
      instagram: destinationDefaults("instagram", true, true),
      facebook: destinationDefaults("facebook", true, true),
      newsletter: destinationDefaults("newsletter", true, false),
      "school-tvs": destinationDefaults("school-tvs", true, false),
      discord: destinationDefaults("discord", false, false),
      youtube: destinationDefaults("youtube", false, false),
      other: destinationDefaults("other", false, false)
    },
    rules: [
      { destination: "instagram", level: "prepare", presets: [], sections: [] },
      { destination: "facebook", level: "prepare", presets: [], sections: [] },
      { destination: "newsletter", level: "eligible", presets: [], sections: [] },
      { destination: "school-tvs", level: "optional", presets: [], sections: [] }
    ]
  };
}

const httpsUrl = (value: unknown): string | null => {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" && !url.username && !url.password ? url.toString() : null;
  } catch {
    return null;
  }
};
const ids = (value: unknown): number[] => (Array.isArray(value) ? value : []).map((item) => Number(typeof item === "object" && item ? (item as { id?: unknown }).id : item)).filter((id) => Number.isSafeInteger(id) && id > 0);

/**
 * The stored Global as settings. Until it has been saved once (`customized`),
 * the starter configuration applies; afterwards it is exactly what was saved
 * (a destination missing from the list is off).
 */
export function distributionSettingsFrom(raw: unknown): DistributionSettings {
  const doc = (raw && typeof raw === "object" ? raw : {}) as { customized?: unknown; destinations?: unknown; rules?: unknown };
  if (doc.customized !== true) return defaultDistributionSettings();
  const destinations = Object.fromEntries(DESTINATION_KINDS.map((kind) => [kind, destinationDefaults(kind, false, false)])) as Record<DestinationKind, DestinationSetting>;
  for (const row of Array.isArray(doc.destinations) ? doc.destinations : []) {
    const value = row as Record<string, unknown>;
    if (!isDestinationKind(value.kind)) continue;
    const label = typeof value.label === "string" && value.label.trim() ? value.label.trim().slice(0, 60) : DESTINATIONS[value.kind].label;
    destinations[value.kind] = { kind: value.kind, enabled: value.enabled === true, label, accountUrl: httpsUrl(value.accountUrl), requiresApproval: value.requiresApproval === true };
  }
  const rules: PolicyRule[] = [];
  for (const row of Array.isArray(doc.rules) ? doc.rules : []) {
    const value = row as Record<string, unknown>;
    if (!isDestinationKind(value.destination) || !(DISTRIBUTION_LEVELS as readonly string[]).includes(String(value.level))) continue;
    rules.push({ destination: value.destination, level: value.level as DistributionLevel, presets: (Array.isArray(value.presets) ? value.presets : []).filter((preset): preset is string => typeof preset === "string"), sections: ids(value.sections) });
  }
  return { destinations, rules };
}

/* -------------------------------------------------------------------- policy */

export type PolicyStory = { preset: string | null; section: number | null };
export type PolicyResult = { kind: DestinationKind; level: DistributionLevel };

/**
 * What the configured policy expects for a Story: for each enabled
 * destination, the first rule that matches (an empty preset or section list
 * matches every Story). Destinations no rule names are not expected. Pure and
 * explicit: nothing is inferred from a Story's subject.
 */
export function policyFor(settings: DistributionSettings, story: PolicyStory): PolicyResult[] {
  const result = new Map<DestinationKind, DistributionLevel>();
  for (const rule of settings.rules) {
    if (result.has(rule.destination) || !settings.destinations[rule.destination]?.enabled) continue;
    if (rule.presets.length && !(story.preset && rule.presets.includes(story.preset))) continue;
    if (rule.sections.length && !(story.section !== null && rule.sections.includes(story.section))) continue;
    result.set(rule.destination, rule.level);
  }
  return DESTINATION_KINDS.flatMap((kind) => (result.has(kind) ? [{ kind, level: result.get(kind)! }] : []));
}

/** The intents to create: expected (prepare/eligible) destinations the Story does not have yet. Never duplicates, never replaces. */
export function missingIntents(expected: readonly PolicyResult[], existing: Iterable<string>): PolicyResult[] {
  const have = new Set(existing);
  return expected.filter((item) => item.level !== "optional" && !have.has(item.kind));
}

/* ---------------------------------------------------------------- the record */

export const DISTRIBUTION_STATES = ["planned", "draft", "ready", "scheduled", "posted", "skipped", "failed"] as const;
export type DistributionState = (typeof DISTRIBUTION_STATES)[number];
export const isDistributionState = (value: unknown): value is DistributionState => typeof value === "string" && (DISTRIBUTION_STATES as readonly string[]).includes(value);

export type SlotMode = "story" | "custom";
export type MediaMode = "story" | "custom" | "none";

/** What actually went out, frozen at the Posted boundary. Later Story changes never touch it. */
export type SentSnapshot = {
  at: string;
  by: number | null;
  destination: DestinationKind;
  label: string;
  headline: string | null;
  text: string | null;
  mediaIds: number[];
  storyUrl: string | null;
  permalink: string | null;
};

export type DistributionRecord = {
  kind: DestinationKind;
  state: DistributionState;
  expectation: DistributionLevel;
  owner: number | null;
  headlineMode: SlotMode;
  headline: string | null;
  textMode: SlotMode;
  text: string | null;
  mediaMode: MediaMode;
  media: number | null;
  plannedFor: string | null;
  scheduledFor: string | null;
  permalink: string | null;
  approvedAt: string | null;
  sent: SentSnapshot[];
  failure: string | null;
};

export type StoryState = StoryFacts & { featuredMedia: number | null; published: boolean; everPublished: boolean };

export type EffectiveContent = { headline: string | null; text: string | null; mediaId: number | null; url: string | null };

/** The values that would go out now: inherited slots read the Story as it is, custom slots their own value. */
export function effectiveContent(record: Pick<DistributionRecord, "kind" | "headlineMode" | "headline" | "textMode" | "text" | "mediaMode" | "media">, story: StoryState): EffectiveContent {
  const descriptor = DESTINATIONS[record.kind];
  const slot = (definition: DestinationDescriptor["text"], mode: SlotMode, custom: string | null) => (definition ? (mode === "custom" ? (custom ?? "") : definition.inherit(story)) : null);
  const mediaId = descriptor.media === "none" ? null : record.mediaMode === "custom" ? record.media : record.mediaMode === "none" && descriptor.media === "optional" ? null : story.featuredMedia;
  return { headline: slot(descriptor.headline, record.headlineMode, record.headline), text: slot(descriptor.text, record.textMode, record.text), mediaId, url: story.url };
}

/**
 * What Copy puts on the clipboard for a destination: its effective text, and
 * the Story's URL where links work (never on Instagram or School TVs, and not
 * twice when the text already carries it).
 */
export function copyText(kind: DestinationKind, effective: EffectiveContent): string {
  const text = joined(effective.headline, effective.text);
  if (kind === "instagram" || kind === "school-tvs" || !effective.url || (effective.text ?? "").includes(effective.url)) return text;
  return joined(text, effective.url);
}

/** "Using Story caption · Featured image", "Custom caption · No image". */
export function contentSummary(record: Pick<DistributionRecord, "kind" | "headlineMode" | "textMode" | "mediaMode">): string {
  const descriptor = DESTINATIONS[record.kind];
  const parts: string[] = [];
  const slots = [descriptor.headline && { slot: descriptor.headline, mode: record.headlineMode }, descriptor.text && { slot: descriptor.text, mode: record.textMode }].filter(Boolean) as Array<{ slot: NonNullable<DestinationDescriptor["text"]>; mode: SlotMode }>;
  const custom = slots.filter((entry) => entry.mode === "custom");
  if (slots.length && !custom.length) parts.push(slots.length === 1 ? `Using Story ${slots[0].slot.noun}` : "Using Story text");
  else if (slots.length) parts.push(custom.length === slots.length && slots.length > 1 ? "Custom text" : custom.map((entry) => `Custom ${entry.slot.noun}`).join(", "));
  if (descriptor.media !== "none") parts.push(record.mediaMode === "custom" ? "Custom image" : record.mediaMode === "none" && descriptor.media === "optional" ? "No image" : "Featured image");
  return parts.join(" · ");
}

/* ----------------------------------------------------------------- readiness */

export type Problem = { message: string; blocks: "ready" | "post" };

/**
 * Why this can't be Ready, or can't go out yet. `mediaIssues` are the
 * server's normal Media checks on the effective image (missing, not an image,
 * metadata gaps); this never invents a second rights or alt system.
 */
export function distributionProblems(record: Pick<DistributionRecord, "kind">, effective: EffectiveContent, story: Pick<StoryState, "published" | "everPublished">, mediaIssues: readonly string[] = []): Problem[] {
  const descriptor = DESTINATIONS[record.kind];
  const problems: Problem[] = [];
  for (const [slot, value] of [[descriptor.headline, effective.headline], [descriptor.text, effective.text]] as const) {
    if (!slot) continue;
    const length = (value ?? "").trim().length;
    if (slot.required && !length) problems.push({ message: `Add a ${slot.noun}.`, blocks: "ready" });
    if (length > slot.max) problems.push({ message: `The ${slot.noun} is ${length.toLocaleString("en-US")} characters; ${descriptor.label} allows ${slot.max.toLocaleString("en-US")}.`, blocks: "ready" });
  }
  if (descriptor.media === "required" && effective.mediaId === null) problems.push({ message: "Choose an image.", blocks: "ready" });
  if (effective.mediaId !== null) for (const issue of mediaIssues) problems.push({ message: issue, blocks: "ready" });
  if (descriptor.requiresPublishedStory && !story.published) {
    problems.push({ message: story.everPublished ? "The Story is unpublished. Nothing new goes out until it is published again." : "Publish the Story before it goes out.", blocks: "post" });
  }
  return problems;
}

/* --------------------------------------------------------------- transitions */

const EDGES: Record<DistributionState, readonly DistributionState[]> = {
  planned: ["draft", "ready", "scheduled", "posted", "skipped"],
  draft: ["ready", "scheduled", "posted", "skipped"],
  ready: ["draft", "scheduled", "posted", "skipped"],
  scheduled: ["ready", "posted", "skipped"],
  failed: ["draft", "ready", "skipped"],
  // Reopening keeps every sent snapshot; a repost adds another.
  posted: ["draft"],
  skipped: ["planned"]
};

/** Edges only an editor takes: deciding not to promote, bringing it back, reopening what went out, fixing a failure. */
const EDITOR_ONLY = (from: DistributionState, to: DistributionState) => to === "skipped" || from === "skipped" || from === "posted" || from === "failed";

export type Actor = { editor: boolean };

/** Why `from → to` is not allowed for this person, or null. Failure is recorded only by delivery (`markFailed`), never chosen. */
export function transitionProblem(from: DistributionState, to: DistributionState, actor: Actor): string | null {
  if (from === to) return null;
  if (to === "failed") return "Only a delivery can fail.";
  if (!EDGES[from].includes(to)) return `A ${stateLabel(from).toLowerCase()} distribution can't become ${stateLabel(to).toLowerCase()}.`;
  if (EDITOR_ONLY(from, to) && !actor.editor) return "Only an editor can do that.";
  return null;
}

/** Posting or scheduling by someone who is not an editor needs an editor's approval when the destination asks for it. */
export function needsApproval(setting: Pick<DestinationSetting, "requiresApproval">, record: Pick<DistributionRecord, "approvedAt">, actor: Actor): boolean {
  return setting.requiresApproval && !record.approvedAt && !actor.editor;
}

export function stateLabel(state: DistributionState, kind?: DestinationKind): string {
  if (state === "posted") return kind ? DESTINATIONS[kind].postedLabel : "Posted";
  return { planned: "Planned", draft: "Draft", ready: "Ready", scheduled: "Scheduled", skipped: "Skipped", failed: "Failed" }[state];
}

/* ------------------------------------------------------- attention and action */

const OVERDUE_GRACE_MS = 2 * 60 * 60 * 1000;

/**
 * Why this needs someone now, or null. Not every pending row: eligible work
 * nobody planned, Ready work an editor approved and future plans are not
 * attention, they are the queue.
 */
export function attentionReason(record: Pick<DistributionRecord, "state" | "expectation" | "plannedFor" | "scheduledFor" | "approvedAt">, problems: readonly Problem[], context: { now: number; requiresApproval: boolean }): string | null {
  const due = (value: string | null, grace = 0) => value !== null && Date.parse(value) + grace < context.now;
  switch (record.state) {
    case "failed":
      return "Failed";
    case "ready":
      if (context.requiresApproval && !record.approvedAt) return "Needs approval";
      return due(record.plannedFor) ? "Overdue" : null;
    case "scheduled":
      return due(record.scheduledFor, OVERDUE_GRACE_MS) ? "Not confirmed" : null;
    case "draft": {
      if (due(record.plannedFor)) return "Overdue";
      const missing = problems.find((problem) => problem.blocks === "ready");
      return missing ? missing.message.replace(/\.$/, "") : null;
    }
    case "planned":
      if (due(record.plannedFor)) return "Overdue";
      return record.expectation === "prepare" ? "Not started" : null;
    default:
      return null;
  }
}

/** The desk's Next action column. */
export function nextAction(record: Pick<DistributionRecord, "state" | "kind" | "approvedAt">, requiresApproval: boolean): string {
  const verb = DESTINATIONS[record.kind].verb;
  switch (record.state) {
    case "planned": return "Prepare";
    case "draft": return "Finish";
    case "ready": return requiresApproval && !record.approvedAt ? "Approve" : verb;
    case "scheduled": return "Confirm";
    case "failed": return "Fix";
    case "posted": return "View";
    case "skipped": return "—";
  }
}

/* ------------------------------------------------------------------ snapshot */

export function sentSnapshot(record: Pick<DistributionRecord, "kind">, effective: EffectiveContent, details: { at: string; by: number | null; label: string; permalink: string | null }): SentSnapshot {
  return {
    at: details.at, by: details.by, destination: record.kind, label: details.label,
    headline: effective.headline, text: effective.text, mediaIds: effective.mediaId === null ? [] : [effective.mediaId],
    storyUrl: effective.url, permalink: details.permalink
  };
}

/** Stored snapshots, tolerant of anything; never rewritten, only appended to. */
export function sentHistory(value: unknown): SentSnapshot[] {
  return (Array.isArray(value) ? value : []).filter((entry): entry is SentSnapshot => Boolean(entry) && typeof entry === "object" && typeof (entry as SentSnapshot).at === "string" && isDestinationKind((entry as SentSnapshot).destination));
}
