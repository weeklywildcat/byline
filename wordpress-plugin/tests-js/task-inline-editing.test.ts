import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const src = path.resolve(__dirname, "../src");
const read = (relative: string) => readFileSync(path.join(src, relative), "utf8");

describe("direct task editing", () => {
  it("uses one shared quick-field component for assignee, priority and due date", () => {
    const source = read("story/TaskQuickFields.tsx");
    expect(source).toContain("<AssigneePicker");
    expect(source).toContain('aria-label={`Task priority:');
    expect(source).toContain("<DatePicker");
    expect(source).toContain('appearance="value"');
    for (const priority of ["low", "normal", "high", "urgent"]) expect(source).toContain(`value: "${priority}"`);
  });

  it("exposes quick edits from Home, Story Peek and the full Workspace", () => {
    expect(read("home/HomeApp.tsx")).toContain("onUpdate={fetchers.editorial");
    expect(read("story/StoryPeek.tsx")).toContain("onUpdateTask");
    expect(read("workspace/TasksSection.tsx")).toContain("<TaskQuickFields");
  });

  it("keeps full task editing available for the title and all common fields", () => {
    const source = read("story/TaskEditDialog.tsx");
    expect(source).toContain("<DialogTitle>Edit task</DialogTitle>");
    expect(source).toContain('id="task-edit-title"');
    expect(source).toContain("<AssigneePicker");
    expect(source).toContain("<DatePicker");
    expect(source).toContain("TASK_PRIORITY_OPTIONS");
  });

  it("updates shared Home and workspace caches optimistically and restores failures", () => {
    const source = read("story/use-update-task.ts");
    expect(source).toContain("replaceHomeTask");
    expect(source).toContain("replaceWorkspaceTask");
    expect(source).toContain("context?.previous");
    expect(source).toContain("invalidateStoryData");
  });
});
