import { describe, expect, it } from "vitest";
import { deskNote, hasLiveCoverage, LiveTransitionError, normalizeLiveSettings, publishBlock, STANDARD_SETTINGS, transition, type LiveSettings } from "../src/domain/live-coverage";

const at = (iso: string) => ({ storyPublic: true, now: iso });
const live = (over: Partial<LiveSettings> = {}): LiveSettings => ({ mode: "live", state: "live", startedAt: "2026-11-06T23:00:00.000Z", endedAt: null, ...over });

describe("live coverage rules", () => {
  it("keeps Story mode and coverage state separate", () => {
    // Live mode is valid in every coverage state; Standard keeps whatever coverage state it had.
    for (const state of ["off", "live", "ended"] as const) expect(normalizeLiveSettings({ mode: "live", state }).state).toBe(state);
    expect(normalizeLiveSettings(undefined)).toEqual(STANDARD_SETTINGS);
    expect(normalizeLiveSettings({ mode: "nonsense", state: "nonsense" })).toEqual(STANDARD_SETTINGS);
  });

  it("allows a public update only on a public Story in Live mode with coverage Live now", () => {
    expect(publishBlock(live(), true)).toBeNull();
    expect(publishBlock(live(), false)).toBe("story-not-public");
    expect(publishBlock(live({ mode: "standard" }), true)).toBe("not-live-mode");
    expect(publishBlock(live({ state: "off", startedAt: null }), true)).toBe("coverage-not-started");
    expect(publishBlock(live({ state: "ended", endedAt: "2026-11-07T04:30:00.000Z" }), true)).toBe("coverage-ended");
    // The Story being unpublished outranks everything else.
    expect(publishBlock(live({ state: "ended" }), false)).toBe("story-not-public");
  });

  it("shows live coverage to readers only in Live mode, once started", () => {
    expect(hasLiveCoverage(live())).toBe(true);
    expect(hasLiveCoverage(live({ state: "ended" }))).toBe(true);
    expect(hasLiveCoverage(live({ state: "off" }))).toBe(false);
    expect(hasLiveCoverage(live({ mode: "standard" }))).toBe(false);
  });

  it("choosing Live never starts coverage", () => {
    expect(transition(STANDARD_SETTINGS, "set-live-mode", at("2026-11-06T22:00:00.000Z"))).toEqual({ mode: "live", state: "off", startedAt: null, endedAt: null });
  });

  it("sets the start once, clears the end on resume, and ending does not switch to Standard", () => {
    const first = transition({ ...STANDARD_SETTINGS, mode: "live" }, "start", at("2026-11-06T23:00:00.000Z"));
    expect(first).toEqual({ mode: "live", state: "live", startedAt: "2026-11-06T23:00:00.000Z", endedAt: null });
    const ended = transition(first, "end", at("2026-11-07T04:30:00.000Z"));
    expect(ended).toEqual({ mode: "live", state: "ended", startedAt: "2026-11-06T23:00:00.000Z", endedAt: "2026-11-07T04:30:00.000Z" });
    const resumed = transition(ended, "start", at("2026-11-07T05:00:00.000Z"));
    expect(resumed).toEqual({ mode: "live", state: "live", startedAt: "2026-11-06T23:00:00.000Z", endedAt: null });
    // Ending twice changes nothing.
    expect(transition(ended, "end", at("2026-11-07T06:00:00.000Z"))).toBe(ended);
  });

  it("refuses to go live on a Story readers cannot see", () => {
    expect(() => transition({ ...STANDARD_SETTINGS, mode: "live" }, "start", { storyPublic: false, now: "2026-11-06T23:00:00.000Z" })).toThrow(LiveTransitionError);
    expect(() => transition(STANDARD_SETTINGS, "end", at("x"))).toThrow(/Live mode/);
  });

  it("switching to Standard ends running coverage and keeps an ended session ended", () => {
    expect(transition(live(), "set-standard-mode", at("2026-11-07T04:30:00.000Z"))).toEqual({ mode: "standard", state: "ended", startedAt: "2026-11-06T23:00:00.000Z", endedAt: "2026-11-07T04:30:00.000Z" });
    const ended = live({ state: "ended", endedAt: "2026-11-07T04:30:00.000Z" });
    const standard = transition(ended, "set-standard-mode", at("2026-11-08T00:00:00.000Z"));
    expect(standard).toEqual({ ...ended, mode: "standard" });
    // Back to Live restores the ended session; it stays Ended until deliberately resumed.
    expect(transition(standard, "set-live-mode", at("2026-11-08T01:00:00.000Z"))).toEqual(ended);
  });

  it("says why a queued Publish now went to the desk", () => {
    expect(deskNote("coverage-ended")).toBe("coverage ended before this sent");
    expect(deskNote("permission-revoked")).toMatch(/no longer publish/);
    expect(deskNote(undefined)).toBe("");
  });
});
