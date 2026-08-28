import { describe, expect, it } from "vitest";
import {
  DEFAULT_WORKFLOW_STATUSES,
  buildDistributionCopy,
  canAssignTask,
  canUseDistributionAction,
  describeDeadline,
  effectiveWorkflowStatus,
  moveContributor,
  normalizeCorrectionRecords,
  orderContributors,
  projectContributorPublic,
  selectableWorkflowStatuses,
  setTaskCompletionState,
  summarizeReadiness,
  type ContributorEntry,
  type DistributionChannel,
  type EditorialTask,
  type ReadinessCheck,
  type TaskPermissionContext
} from "./editorial-model";

describe("editorial status and date semantics", () => {
  const now = new Date(2026, 7, 28, 12, 0, 0);

  it("keeps publication derived and out of move targets", () => {
    expect(selectableWorkflowStatuses()).not.toContainEqual(expect.objectContaining({ id: "published" }));
    expect(effectiveWorkflowStatus({ status: "writing", postStatus: "publish", isPublished: false })).toBe("published");
    expect(effectiveWorkflowStatus({ status: "writing", postStatus: "draft", isPublished: false })).toBe("writing");
  });

  it("uses relative deadline text while supporting exact dates elsewhere", () => {
    expect(describeDeadline("2026-08-28", now)).toBe("Today");
    expect(describeDeadline("2026-08-29", now)).toBe("Tomorrow");
    expect(describeDeadline("2026-08-26", now)).toContain("2 days overdue");
    expect(describeDeadline("not-a-date", now)).toBe("No deadline");
    expect(DEFAULT_WORKFLOW_STATUSES.find((status) => status.id === "ready")?.label).toBe("Ready for Review");
  });
});

describe("readiness summaries", () => {
  const checks: ReadinessCheck[] = [
    { id: "headline", label: "Headline", state: "pass", explanation: "Present." },
    { id: "alt", label: "Image alt text", state: "warning", explanation: "Missing.", fix: { label: "Open media" } },
    { id: "links", label: "Links", state: "error", explanation: "A broken link was found." }
  ];

  it("counts states and blocks only on errors", () => {
    expect(summarizeReadiness(checks)).toMatchObject({ passed: 1, warnings: 1, errors: 1, total: 3, label: "1/3 ready", canPublish: false });
    expect(summarizeReadiness(checks.slice(0, 2)).canPublish).toBe(true);
  });
});

describe("task idempotence and permissions", () => {
  const task: EditorialTask = {
    id: 4,
    title: "Check photo credit",
    state: "open",
    priority: "high",
    storyId: 12,
    order: 0
  };
  const linkedEditor: TaskPermissionContext = {
    canEditLinkedStory: true,
    canAssign: false,
    canDelete: true,
    canManageUnlinked: false
  };

  it("allows linked-story work without allowing assignment", () => {
    expect(canAssignTask(task, linkedEditor)).toBe(false);
    expect(setTaskCompletionState(task, "open", "2026-08-28T12:00:00Z")).toBe(task);
    expect(setTaskCompletionState(task, "completed", "2026-08-28T12:00:00Z")).toMatchObject({ state: "completed", completedAt: "2026-08-28T12:00:00Z" });
  });

  it("does not grant an unlinked task through linked-story access", () => {
    expect(canAssignTask({ ...task, storyId: null }, linkedEditor)).toBe(false);
  });
});

describe("contributor ordering and privacy-safe projection", () => {
  const entries: ContributorEntry[] = [
    { id: "guest-1", kind: "guest", name: "Guest Writer", email: "private@example.test", order: 2 },
    { id: 7, kind: "user", name: "Primary Writer", internalNotes: "Do not publish", order: 0 },
    { id: 8, kind: "user", name: "Editor", order: 1 }
  ];

  it("normalizes order and supports keyboard-friendly movement", () => {
    expect(orderContributors(entries).map((entry) => entry.name)).toEqual(["Primary Writer", "Editor", "Guest Writer"]);
    expect(moveContributor(entries, 2, "up").map((entry) => entry.name)).toEqual(["Primary Writer", "Guest Writer", "Editor"]);
  });

  it("omits private fields from public contributor data", () => {
    const projected = projectContributorPublic(entries[1]);
    expect(projected).toEqual({ id: 7, kind: "user", name: "Primary Writer" });
    expect(projected).not.toHaveProperty("email");
    expect(projected).not.toHaveProperty("internalNotes");
  });
});

describe("correction legacy compatibility", () => {
  it("shows a legacy notice when no structured records exist", () => {
    expect(normalizeCorrectionRecords([], "The score was corrected.")).toEqual([
      expect.objectContaining({ id: "legacy-correction-notice", legacy: true, publicText: "The score was corrected." })
    ]);
  });

  it("does not duplicate legacy text once structured records exist", () => {
    const structured = [{ id: 9, type: "correction" as const, publicText: "Updated text." }];
    expect(normalizeCorrectionRecords(structured, "Updated text.")).toEqual(structured);
  });
});

describe("distribution capability gating", () => {
  const channel: DistributionChannel = {
    id: "discord",
    label: "Discord",
    status: "not-configured",
    configured: false,
    capabilities: { copy: true, markDistributed: true, send: true, schedule: true }
  };

  it("keeps copy available but hides provider actions when unconfigured", () => {
    expect(canUseDistributionAction(channel, "copy")).toBe(true);
    expect(canUseDistributionAction(channel, "markDistributed")).toBe(false);
    expect(canUseDistributionAction(channel, "send")).toBe(false);
    expect(buildDistributionCopy("headline-url", "A headline", "https://example.test/story")).toBe("A headline\nhttps://example.test/story");
  });

  it("honours explicit capability omissions for configured providers", () => {
    expect(canUseDistributionAction({ ...channel, configured: true, capabilities: { copy: true } }, "send")).toBe(false);
  });
});
