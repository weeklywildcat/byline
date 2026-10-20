import { describe, expect, it } from "vitest";
import { appendNewTasks, applyBrief, applyReporting, applyResources, applyTask, applyWorkflowPayload } from "./workspace-cache";
import { isHttpUrl, resourceSubtitle, validateLink, workingDraft } from "./resource-model";
import { workspaceError } from "./workspace-errors";
import type { StoryWorkspace } from "./workspace-types";

const data = {
  story: { id: 5, workflow: { id: "reporting", label: "Reporting", group: "main", selectable: true }, deadline: null, plannedPublication: null, editor: null, reporting: null },
  revision: 3, brief: "Old", statuses: [{ id: "reporting", label: "Reporting", group: "main", selectable: true }, { id: "writing", label: "Writing", group: "main", selectable: true }],
  people: [{ id: 9, kind: "user", name: "Eddie Editor" }], tasks: [{ id: 1, title: "A", state: "open", priority: "normal", order: 0, storyId: 5 }], sources: [], appointments: [], resources: [], reporting: null
} as unknown as StoryWorkspace;

describe("workspace cache transforms", () => {
  it("replaces only the reporting slice and its roll-up", () => {
    const summary = { sources: 1, interviewed: 0, needsScheduling: 0, toSchedule: 0, nextAppointment: null };
    const next = applyReporting(data, { sources: [{ id: "s" } as never], appointments: [], summary })!;
    expect(next.sources).toHaveLength(1);
    expect(next.story.reporting).toEqual(summary);
    expect(next.tasks).toBe(data.tasks);
  });
  it("replaces a task, a brief and resources without touching the rest", () => {
    expect(applyTask(data, { ...data.tasks[0], state: "completed" })!.tasks[0].state).toBe("completed");
    expect(applyBrief(data, "New")!.brief).toBe("New");
    expect(applyResources(data, [{ id: "r", label: "L", url: "https://x.test", kind: "Link", purpose: "other" }])!.resources).toHaveLength(1);
  });
  it("appends only tasks it has not seen", () => {
    const next = appendNewTasks(data, [data.tasks[0], { ...data.tasks[0], id: 2, title: "B" }, { ...data.tasks[0], id: 3, storyId: 99 }])!;
    expect(next.tasks.map((task) => task.id)).toEqual([1, 2]);
  });
  it("folds a workflow response into the story and revision", () => {
    const next = applyWorkflowPayload(data, { story: { status: "writing", revision: 4, deadline: "2026-10-30", editorId: 9 }, capabilities: { changeStatus: true } } as never)!;
    expect(next.revision).toBe(4);
    expect(next.story.workflow.id).toBe("writing");
    expect(next.story.deadline).toBe("2026-10-30");
    expect(next.story.editor).toMatchObject({ id: 9, name: "Eddie Editor" });
  });
});

describe("links", () => {
  it("accepts only plain http(s) links", () => {
    expect(isHttpUrl("https://docs.google.com/document/d/1")).toBe(true);
    expect(isHttpUrl("javascript:alert(1)")).toBe(false);
    expect(isHttpUrl("https://user:pass@example.com")).toBe(false);
    expect(validateLink({ label: "", url: "ftp://x" })).toMatchObject({ label: expect.any(String), url: expect.any(String) });
  });
  it("finds a single working draft and shows kind and purpose", () => {
    const draft = { id: "1", label: "Draft", url: "https://x.test", kind: "Google Doc", purpose: "draft" as const };
    expect(workingDraft([draft, { ...draft, id: "2", purpose: "research" }])).toBe(draft);
    expect(workingDraft([draft, { ...draft, id: "2" }])).toBeNull();
    expect(resourceSubtitle(draft)).toBe("Google Doc · Draft");
    expect(resourceSubtitle({ kind: "Link", purpose: "other" })).toBe("Link");
  });
});

describe("error classification", () => {
  it("recognises a stale-edit conflict and a missing membership", () => {
    expect(workspaceError({ code: "byline_stale_record", message: "Someone else changed this while you were editing it.", data: { status: 409 } })).toMatchObject({ conflict: true, forbidden: false });
    expect(workspaceError({ code: "byline_story_context_forbidden", message: "You are not part of this story.", data: { status: 403 } })).toMatchObject({ forbidden: true, conflict: false });
  });
  it("never leaks a raw response", () => {
    expect(workspaceError({ message: "<html><body>Fatal error</body></html>" }, "Try again.").message).not.toContain("<html");
  });
});
