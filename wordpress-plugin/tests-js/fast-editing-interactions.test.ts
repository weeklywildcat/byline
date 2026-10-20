import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const src = path.resolve(__dirname, "../src");
const read = (relative: string) => readFileSync(path.join(src, relative), "utf8");

describe("fast editing interactions", () => {
  it("keeps right-click actions available across story and production queues", () => {
    expect(read("planning/StoryBoard.tsx")).toContain("<StoryContextMenu");
    expect(read("planning/MediaDesk.tsx")).toContain("<MediaRowContext");
    expect(read("planning/ContentHealth.tsx")).toContain("<ContextMenu");
    expect(read("planning/Feedback.tsx")).toContain("<ContextMenu");
  });

  it("makes low-risk queue edits optimistic instead of waiting for a refetch", () => {
    expect(read("planning/MediaDesk.tsx")).toContain("onMutate: async ({ row, changes })");
    expect(read("planning/Feedback.tsx")).toContain("onMutate: async (next)");
    expect(read("workspace/ReportingPlan.tsx")).toContain("onMutate: async ({ kind, id, status })");
    expect(read("workspace/MediaSection.tsx")).toContain("onMutate: async ({ assignment, status })");
  });

  it("uses reversible removal for lightweight relationships", () => {
    expect(read("planning/Coverage.tsx")).toContain('label: __("Undo"');
    expect(read("workspace/ResourcesSection.tsx")).toContain('label: "Undo"');
    expect(read("story/StoryPeek.tsx")).toContain('label: "Undo"');
    expect(read("planning/Coverage.tsx")).not.toContain("<ConfirmRemoveDialog");
    expect(read("story/StoryPeek.tsx")).toContain("<ContextMenu");
  });

  it("removes extra submit clicks from coverage linking", () => {
    const source = read("planning/Coverage.tsx");
    expect(source).toContain("onValueChange={(story) => {");
    expect(source).toContain('placeholder={run.isPending ? __("Adding…"');
    expect(source).toContain('<form className="flex gap-2" onSubmit=');
  });

  it("lets existing workspace tasks be edited without recreating them", () => {
    const source = read("workspace/TasksSection.tsx");
    expect(source).toContain('title={task ? "Edit task" : "Add task"}');
    expect(source).toContain("editorial.updateTask(task!.id");
    expect(source).toContain("<ContextMenu");
    expect(source).toContain('label="Priority"');
  });

  it("adds status accelerators to reporting and production rows", () => {
    expect(read("workspace/ReportingPlan.tsx")).toContain("<QuickStatusContext");
    expect(read("workspace/MediaSection.tsx")).toContain("<ContextMenuRadioGroup");
  });

  it("expands the command palette to secondary newsroom destinations", () => {
    const source = read("home/HomeCommands.tsx");
    expect(source).toContain("Open Media Desk");
    expect(source).toContain("Open Feedback");
    expect(source).toContain("Open Content Health");
  });
});
