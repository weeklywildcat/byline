import { describe, expect, it } from "vitest";
import { leadingSignals, storyAttention, type AttentionInput } from "../../src/story/attention";

const clock = { now: new Date("2026-11-09T15:00:00Z"), timeZone: "America/New_York" };
const reporter = { id: 7, isEditor: false };
const editor = { id: 2, isEditor: true };

function story(overrides: Partial<AttentionInput> = {}): AttentionInput {
  return {
    storyId: 1,
    phase: "reporting",
    deadline: null,
    scheduledAt: null,
    writerIds: [7],
    editorId: 2,
    review: null,
    sources: [],
    appointments: [],
    media: [],
    checklist: [],
    ...overrides
  };
}

describe("story attention", () => {
  it("raises nothing for a quiet story", () => {
    const result = storyAttention(story(), reporter, clock);
    expect(result.signals).toEqual([]);
    expect(result.needsViewer).toBe(false);
  });

  it("makes one Story one unit: its appointment, waiting source and media feed one result", () => {
    const result = storyAttention(story({
      appointments: [{ id: 10, title: "Principal Smith", kind: "interview", status: "confirmed", startAt: "2026-11-10T13:00:00Z", windowStart: null, assigneeIds: [7] }],
      sources: [{ id: 11, label: "District food services", status: "waiting", since: "2026-11-05T15:00:00Z", assigneeIds: [] }],
      media: [{ id: 12, title: "Exterior photo", type: "photo", status: "needed", deadline: null, assigneeIds: [] }]
    }), reporter, clock);
    expect(result.storyId).toBe(1);
    expect(result.signals.map((signal) => signal.kind)).toEqual(["appointment-soon", "waiting-on-source", "media-needed"]);
    expect(result.signals[0]).toMatchObject({ label: "Interview tomorrow · 8:00 AM", detail: "Principal Smith", mine: true, target: { view: "reporting", record: { kind: "appointment", id: 10 } } });
    expect(result.signals[1]).toMatchObject({ label: "Waiting on District food services", detail: "4 days", mine: true });
    // Media without an assignee is the editor's to staff, not the reporter's.
    expect(result.signals[2]?.mine).toBe(false);
    expect(storyAttention(story({ media: [{ id: 12, title: "exterior photo", type: "photo", status: "needed", deadline: null, assigneeIds: [] }] }), editor, clock).signals[0]).toMatchObject({ label: "Exterior photo still needed", mine: true });
  });

  it("ranks review decisions above planning and explains each signal", () => {
    const result = storyAttention(story({
      phase: "drafting",
      deadline: "2026-11-08",
      review: { state: "changes-requested", stepLabel: "Section Edit", waitingFor: "Sports Editor", reviewerIds: [], publishedComments: 2, since: "2026-11-09T14:40:00Z", failure: null }
    }), reporter, clock);
    expect(result.signals.map((signal) => signal.kind)).toEqual(["changes-requested", "deadline-overdue"]);
    expect(result.signals[0]).toMatchObject({ label: "Changes requested", detail: "2 comments", target: { view: "feedback" }, mine: true });
    expect(result.signals[0]?.explanation).toContain("Sports Editor");
    expect(result.signals[1]).toMatchObject({ label: "Overdue", detail: "Was due yesterday" });
  });

  it("asks the routed reviewer, and tells everyone else who it waits for", () => {
    const review = { state: "waiting" as const, stepLabel: "Copy Review", waitingFor: "Copy Desk", reviewerIds: [2, 3], publishedComments: 0, since: null, failure: null };
    expect(storyAttention(story({ phase: "review", review }), editor, clock).signals[0]).toMatchObject({ kind: "review-assigned", label: "Ready for your review", mine: true });
    expect(storyAttention(story({ phase: "review", review }), reporter, clock).signals[0]).toMatchObject({ label: "Waiting for Copy Desk", mine: false });
  });

  it("flags routing failures to editors and writers", () => {
    const review = { state: "routing-failed" as const, stepLabel: null, waitingFor: null, reviewerIds: [], publishedComments: 0, since: null, failure: "Sports has no active Section Editor for 2026–27." };
    const result = storyAttention(story({ phase: "drafting", review }), reporter, clock);
    expect(result.signals[0]).toMatchObject({ kind: "routing-failed", detail: "Sports has no active Section Editor for 2026–27.", mine: true });
    expect(storyAttention(story({ phase: "drafting", review }), { id: 99, isEditor: true }, clock).signals[0]?.mine).toBe(true);
  });

  it("offers Ready stories to editors until they are scheduled", () => {
    expect(storyAttention(story({ phase: "ready" }), editor, clock).signals[0]).toMatchObject({ kind: "ready-to-publish", mine: true });
    expect(storyAttention(story({ phase: "ready", scheduledAt: "2026-11-10T12:00:00Z" }), editor, clock).signals).toEqual([]);
  });

  it("stays quiet on sidelined and published stories", () => {
    const busy = { deadline: "2026-11-01", media: [{ id: 1, title: "Photo", type: "photo", status: "needed", deadline: null, assigneeIds: [] }] };
    expect(storyAttention(story({ phase: "on-hold", ...busy }), editor, clock).signals).toEqual([]);
    expect(storyAttention(story({ phase: "published", ...busy }), editor, clock).signals).toEqual([]);
  });

  it("puts the reader's own signal first in compact surfaces", () => {
    const result = storyAttention(story({
      deadline: "2026-11-10",
      media: [{ id: 12, title: "Exterior photo", type: "photo", status: "needed", deadline: null, assigneeIds: [] }],
      checklist: [{ id: 5, title: "Confirm regulation number", due: "2026-11-09T20:00:00Z", done: false, assigneeIds: [7] }]
    }), reporter, clock);
    expect(leadingSignals(result, 2).map((signal) => signal.kind)).toEqual(["checklist-due", "deadline-soon"]);
  });

  it("is deterministic for equal inputs", () => {
    const input = story({ sources: [
      { id: 2, label: "B", status: "waiting", since: "2026-11-01T12:00:00Z", assigneeIds: [] },
      { id: 1, label: "A", status: "contacted", since: "2026-11-01T12:00:00Z", assigneeIds: [] }
    ] });
    expect(storyAttention(input, reporter, clock)).toEqual(storyAttention(input, reporter, clock));
    expect(storyAttention(input, reporter, clock).signals[0]?.label).toBe("Waiting on A");
  });
});
