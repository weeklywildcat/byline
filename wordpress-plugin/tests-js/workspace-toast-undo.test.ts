import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const src = path.resolve(__dirname, "../src");
const read = (relative: string) => readFileSync(path.join(src, relative), "utf8");

describe("Story Workspace toast + undo UX", () => {
  it("uses a ten-second Undo action backed by a real compensating mutation", () => {
    const source = read("workspace/workspace-toast.ts");
    expect(source).toContain('label: "Undo"');
    expect(source).toContain("duration: options.duration ?? 10_000");
    expect(source).toContain("options.undo()");
    expect(source).toContain("toast.error");
  });

  it("offers Undo across reversible workspace mutations", () => {
    for (const file of [
      "workspace/BriefSection.tsx",
      "workspace/DetailsSection.tsx",
      "workspace/TasksSection.tsx",
      "workspace/SourceDialog.tsx",
      "workspace/AppointmentDialog.tsx",
      "workspace/MediaDialog.tsx",
      "workspace/ResourcesSection.tsx"
    ]) {
      expect(read(file), file).toContain("workspaceUndoToast");
    }
  });

  it("uses immediate remove + Undo for low-risk links instead of a confirmation dialog", () => {
    const source = read("workspace/ResourcesSection.tsx");
    expect(source).toContain('<DropdownMenuItem variant="destructive" onClick={onRemove}>');
    expect(source).toContain('workspaceUndoToast("Link removed."');
    expect(source).not.toContain("ConfirmRemoveDialog");
  });

  it("keeps explicit confirmation for destructive records that cannot be faithfully recreated", () => {
    expect(read("workspace/SourceDialog.tsx")).toContain('<RemoveControl label="Remove source"');
    expect(read("workspace/AppointmentDialog.tsx")).toContain('<RemoveControl label="Delete appointment"');
    expect(read("workspace/MediaDialog.tsx")).toContain('<RemoveControl label="Remove assignment"');
  });
});
