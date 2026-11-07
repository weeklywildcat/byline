import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { readSource } from "./source-files";

const src = path.resolve(__dirname, "../src");
const read = readSource;

describe("fast editing interactions", () => {
  it("keeps right-click actions available across story and production queues", () => {
    expect(read("planning/StoryBoard.tsx")).toContain("<StoryContextMenu");
    expect(read("media/MediaWork.tsx")).toContain("<MediaRowContext");
    expect(read("planning/ContentHealth.tsx")).toContain("<ContextMenu");
    expect(read("planning/Feedback.tsx")).toContain("<ContextMenu");
    expect(read("calendar/NeedsScheduling.tsx")).toContain("<ContextMenu");
  });

  it("makes low-risk queue edits optimistic instead of waiting for a refetch", () => {
    expect(read("media/MediaWork.tsx")).toContain("onMutate: async ({ row, changes })");
    expect(read("planning/Feedback.tsx")).toContain("onMutate: async (next)");
    expect(read("workspace/ReportingPlan.tsx")).toContain("onMutate: async ({ kind, id, status })");
    expect(read("workspace/MediaSection.tsx")).toContain("onMutate: async ({ assignment, status })");
  });

  it("uses reversible removal for lightweight relationships", () => {
    expect(read("collections/collection-query.ts")).toContain('label: "Undo"');
    expect(read("workspace/ResourcesSection.tsx")).toContain('label: "Undo"');
    expect(read("story/StoryPeek.tsx")).toContain('label: "Undo"');
    expect(read("workspace/ResourcesSection.tsx")).toContain("Copy link");
    expect(read("story/StoryPeek.tsx")).toContain("Copy link");
    expect(read("collections/CollectionAddDialog.tsx")).not.toContain("<ConfirmRemoveDialog");
    expect(read("story/StoryPeek.tsx")).toContain("<ContextMenu");
  });

  it("keeps public coverage subordinate to Collection coordination", () => {
    const source = read("collections/CollectionPublicPresentation.tsx");
    expect(source).toContain("Newsroom only");
    expect(source).toContain("Save public presentation");
    // The host's media picker (WordPress Media Library, Byline Media), never a CMS API in the shared screen.
    expect(source).toContain("host.media!.pick(");
    expect(source).not.toContain("wp.media");
    // The overview is plain text; there is no HTML escape hatch.
    expect(source).toContain("Plain text. Separate paragraphs with a blank line.");
    expect(source).not.toContain("Basic HTML");
  });

  it("lets existing workspace tasks be edited without recreating them", () => {
    const source = read("workspace/TasksSection.tsx");
    expect(source).toContain('title={task ? "Edit task" : "Add task"}');
    expect(source).toContain("editorial.updateTask(task!.id");
    expect(source).toContain("<ContextMenu");
    expect(source).toContain('label="Priority"');
    expect(source).toContain('label: "Undo"');
    expect(read("home/HomeApp.tsx")).toContain('label: "Undo"');
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
