/**
 * Live coverage, as pure rules (docs/live-coverage.md).
 *
 * Two separate concepts, never one enum:
 *
 * - **Story mode**: `standard` | `live`. A Story is always one Story; Live is a
 *   mode of it, not a content type.
 * - **Coverage state**: `off` (Not started) | `live` (Live now) | `ended`.
 *
 * Live mode with any coverage state is valid. After a game ends the Story stays
 * in Live mode with its timeline until an editor deliberately switches to
 * Standard. Both live on the unversioned `story-plans` record so starting,
 * ending or resuming coverage never touches (or publishes) unpublished article
 * copy. Every decision about "may this update become public now" is
 * `publishBlock`, used by the live desk, the Field endpoint and the
 * `live-updates` collection, so Write and Field cannot disagree.
 */

export const LIVE_MODES = ["standard", "live"] as const;
export const COVERAGE_STATES = ["off", "live", "ended"] as const;

export type LiveMode = (typeof LIVE_MODES)[number];
export type CoverageState = (typeof COVERAGE_STATES)[number];

export const LIVE_MODE_OPTIONS = [
  { value: "standard", label: "Standard" },
  { value: "live", label: "Live" }
] as const;

export const COVERAGE_STATE_OPTIONS = [
  { value: "off", label: "Not started" },
  { value: "live", label: "Live now" },
  { value: "ended", label: "Ended" }
] as const;

export type LiveSettings = {
  mode: LiveMode;
  state: CoverageState;
  /** The first time coverage went live; kept on resume. */
  startedAt: string | null;
  /** Set when coverage ends; cleared on resume. */
  endedAt: string | null;
};

export const STANDARD_SETTINGS: LiveSettings = { mode: "standard", state: "off", startedAt: null, endedAt: null };

export function normalizeLiveSettings(value: unknown): LiveSettings {
  const row = (value && typeof value === "object" ? value : {}) as Partial<Record<keyof LiveSettings, unknown>>;
  const mode: LiveMode = row.mode === "live" ? "live" : "standard";
  const state: CoverageState = row.state === "live" || row.state === "ended" ? row.state : "off";
  const date = (input: unknown) => (typeof input === "string" && input ? input : null);
  return { mode, state, startedAt: date(row.startedAt), endedAt: date(row.endedAt) };
}

/** Live coverage reaches readers only in Live mode, once started (running or ended). */
export function hasLiveCoverage(settings: LiveSettings | undefined | null) {
  return settings?.mode === "live" && (settings.state === "live" || settings.state === "ended");
}

/** Why an update cannot become public right now. `permission-revoked` is decided by the caller (it is about the person). */
export type PublishBlock = "story-not-public" | "not-live-mode" | "coverage-not-started" | "coverage-ended" | "permission-revoked";

/**
 * The one rule for "can a live update become public now": the Story is public,
 * it is in Live mode and coverage is Live now. Null means yes.
 */
export function publishBlock(settings: LiveSettings, storyPublic: boolean): Exclude<PublishBlock, "permission-revoked"> | null {
  if (!storyPublic) return "story-not-public";
  if (settings.mode !== "live") return "not-live-mode";
  if (settings.state === "off") return "coverage-not-started";
  if (settings.state === "ended") return "coverage-ended";
  return null;
}

/** Every reason an update can be sent to the desk instead of published (stored on the update). */
export const DESK_REASON_OPTIONS = ["story-not-public", "not-live-mode", "coverage-not-started", "coverage-ended", "permission-revoked"] as const;

export const PUBLISH_BLOCK_COPY: Record<PublishBlock, string> = {
  "story-not-public": "the story isn't published yet",
  "not-live-mode": "the story isn't in Live mode",
  "coverage-not-started": "coverage hasn't started",
  "coverage-ended": "coverage ended",
  "permission-revoked": "your publishing permission changed"
};

/** "Sent to live desk — coverage ended before this sent." */
export function deskNote(reason: PublishBlock | undefined): string {
  switch (reason) {
    case "coverage-ended": return "coverage ended before this sent";
    case "coverage-not-started": return "coverage hadn't started when this sent";
    case "not-live-mode": return "the story is no longer in Live mode";
    case "story-not-public": return "the story isn't published";
    case "permission-revoked": return "you can no longer publish live updates on this story";
    default: return "";
  }
}

export type CoverageAction = "set-live-mode" | "start" | "end" | "set-standard-mode";

export class LiveTransitionError extends Error {
  constructor(message: string, readonly code: "story-not-public" | "not-live-mode" | "invalid") {
    super(message);
  }
}

/**
 * The next settings for an action. `startedAt` is set exactly once (the first
 * start); `endedAt` is set on end and cleared on resume. Choosing Live mode
 * never starts coverage; choosing Standard ends coverage that is running and
 * keeps everything else (an ended session stays Ended until deliberately
 * resumed). Starting needs a public Story.
 */
export function transition(current: LiveSettings, action: CoverageAction, options: { storyPublic: boolean; now: string }): LiveSettings {
  const { now, storyPublic } = options;
  switch (action) {
    case "set-live-mode":
      return { ...current, mode: "live" };
    case "set-standard-mode":
      return current.state === "live"
        ? { mode: "standard", state: "ended", startedAt: current.startedAt ?? now, endedAt: now }
        : { ...current, mode: "standard" };
    case "start":
      if (!storyPublic) throw new LiveTransitionError("Publish the story before going live: coverage can't be live on a story readers can't see.", "story-not-public");
      return { mode: "live", state: "live", startedAt: current.startedAt ?? now, endedAt: null };
    case "end":
      if (current.mode !== "live") throw new LiveTransitionError("This story isn't in Live mode.", "not-live-mode");
      if (current.state !== "live") return current;
      return { ...current, state: "ended", endedAt: now };
  }
}

/** The label the UI shows for the coverage state. */
export function coverageLabel(state: CoverageState): string {
  return state === "live" ? "Live now" : state === "ended" ? "Ended" : "Not started";
}
