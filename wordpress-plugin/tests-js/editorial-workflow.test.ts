import { describe, expect, it } from "vitest";

import {
  WORKFLOW_FALLBACK_ERROR,
  describeWorkflowError,
  workflowStages,
  workflowStatusLabel,
  workflowStoryPath,
  type WorkflowPayload,
  type WorkflowStatusDefinition
} from "../src/editorial-workflow-model";

const STATUSES: WorkflowStatusDefinition[] = [
  { id: "pitch", label: "Pitch", group: "main", selectable: true },
  { id: "assigned", label: "Assigned", group: "main", selectable: true },
  { id: "reporting", label: "Reporting", group: "main", selectable: true },
  { id: "writing", label: "Writing", group: "main", selectable: true },
  { id: "editing", label: "Editing", group: "main", selectable: true },
  { id: "ready", label: "Ready for Review", group: "main", selectable: true },
  { id: "on-hold", label: "On Hold", group: "sidelined", selectable: true },
  { id: "dropped", label: "Dropped", group: "sidelined", selectable: true },
  { id: "published", label: "Published", group: "derived", selectable: false }
];

function payload(status: string): WorkflowPayload {
  return {
    story: {
      postId: 1,
      status,
      storedStatus: status === "published" ? "writing" : status,
      isPublished: status === "published",
      postStatus: status === "published" ? "publish" : "draft",
      editorId: 0,
      deadline: "",
      visuals: ""
    },
    statuses: STATUSES,
    capabilities: { changeStatus: true, assign: true },
    writer: null,
    editors: [],
    discord: { threadId: "" }
  };
}

// A workflow API failure is not a reason to make the article unwritable, so the
// only requirement on an error is that a human can read it.
describe("workflow error reporting", () => {
  it("reads a WordPress REST error", () => {
    expect(describeWorkflowError({ message: "You are not allowed to change this story." })).toBe(
      "You are not allowed to change this story."
    );
  });

  it("reads a network failure", () => {
    expect(describeWorkflowError(new Error("Failed to fetch"))).toBe("Failed to fetch");
  });

  it("never surfaces a raw object, an empty message, or a null", () => {
    for (const value of [{}, { message: "" }, { message: "   " }, { code: "byline_editorial_forbidden" }, null, undefined, 42, []]) {
      const described = describeWorkflowError(value);

      expect(described).toBe(WORKFLOW_FALLBACK_ERROR);
      expect(described).not.toContain("object Object");
    }
  });

  it("uses the caller's translated fallback when there is nothing to show", () => {
    expect(describeWorkflowError({}, "Traduit")).toBe("Traduit");
  });
});

describe("workflow stages", () => {
  it("splits the main line from the sidelined states and never offers the derived one", () => {
    const { main, sidelined } = workflowStages(STATUSES, "writing");

    expect(main.map((stage) => stage.id)).toEqual(["pitch", "assigned", "reporting", "writing", "editing", "ready"]);
    expect(sidelined.map((stage) => stage.id)).toEqual(["on-hold", "dropped"]);
    expect([...main, ...sidelined].some((stage) => stage.id === "published")).toBe(false);
  });

  it("marks the current stage and everything already passed", () => {
    const { main } = workflowStages(STATUSES, "writing");

    expect(main.filter((stage) => stage.isDone).map((stage) => stage.id)).toEqual(["pitch", "assigned", "reporting"]);
    expect(main.filter((stage) => stage.isCurrent).map((stage) => stage.id)).toEqual(["writing"]);
    // Nothing ahead of the current stage is marked as progress.
    expect(main.slice(4).every((stage) => !stage.isDone && !stage.isCurrent)).toBe(true);
  });

  it("marks nothing as passed when the story is sidelined", () => {
    const { main, sidelined } = workflowStages(STATUSES, "on-hold");

    expect(main.every((stage) => !stage.isDone && !stage.isCurrent)).toBe(true);
    expect(sidelined.find((stage) => stage.id === "on-hold")?.isCurrent).toBe(true);
  });

  it("keeps every stage selectable when the stored status is unrecognised", () => {
    const { main } = workflowStages(STATUSES, "not-a-stage");

    expect(main).toHaveLength(6);
    expect(main.every((stage) => !stage.isCurrent)).toBe(true);
  });
});

describe("workflow status label", () => {
  it("reports the effective status, including the derived publication state", () => {
    expect(workflowStatusLabel(payload("writing"))).toBe("Writing");
    expect(workflowStatusLabel(payload("ready"))).toBe("Ready for Review");
    expect(workflowStatusLabel(payload("published"))).toBe("Published");
  });

  it("falls back to the identifier rather than rendering a blank control", () => {
    expect(workflowStatusLabel(payload("not-a-stage"))).toBe("not-a-stage");
    expect(workflowStatusLabel(null)).toBe("");
  });
});

describe("workflow transport", () => {
  // Workflow values are private newsroom information, so they travel over the
  // capability-protected Byline namespace rather than through public post meta.
  it("addresses the capability-protected Byline editorial endpoint", () => {
    expect(workflowStoryPath(42)).toBe("/byline/v1/editorial/stories/42");
    expect(workflowStoryPath(42)).not.toContain("/wp/v2/");
  });
});
