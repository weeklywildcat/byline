import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const src = path.resolve(__dirname, "../src");
const read = (relative: string) => readFileSync(path.join(src, relative), "utf8");

describe("workspace form safety", () => {
  it("guards dirty WorkspaceDialog closes and page unloads with a specific discard choice", () => {
    const source = read("workspace/dialog-shell.tsx");
    expect(source).toContain("dirty?: boolean");
    expect(source).toContain("Discard unsaved changes?");
    expect(source).toContain("Keep editing");
    expect(source).toContain("Discard changes");
    expect(source).toContain('window.addEventListener("beforeunload"');
    expect(source).toContain("if (dirty && !readOnly) setDiscardOpen(true)");
  });

  it("marks the long source, appointment and production forms dirty from their initial values", () => {
    for (const file of [
      "workspace/SourceDialog.tsx",
      "workspace/AppointmentDialog.tsx",
      "workspace/MediaDialog.tsx"
    ]) {
      const source = read(file);
      expect(source, file).toContain("const initialForm =");
      expect(source, file).toContain("const dirty = JSON.stringify(form) !== JSON.stringify(initialForm)");
      expect(source, file).toContain("dirty={dirty}");
    }
  });

  it("focuses the first invalid control after submit validation fails", () => {
    expect(read("workspace/dialog-shell.tsx")).toContain("focusFirstInvalidField");
    for (const file of [
      "workspace/SourceDialog.tsx",
      "workspace/AppointmentDialog.tsx",
      "workspace/MediaDialog.tsx"
    ]) {
      expect(read(file), file).toContain("else focusFirstInvalidField()");
    }
  });

  it("asks before throwing away a changed brief but not an unchanged one", () => {
    const source = read("workspace/BriefSection.tsx");
    expect(source).toContain("const dirty = editing && draft !== data.brief");
    expect(source).toContain("Discard unsaved brief changes?");
    expect(source).toContain("dirty ? <ConfirmRemoveDialog");
  });
});
