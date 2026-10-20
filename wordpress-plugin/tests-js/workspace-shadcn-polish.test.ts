import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const src = path.resolve(__dirname, "../src");
const read = (relative: string) => readFileSync(path.join(src, relative), "utf8");

describe("Story Workspace shadcn polish", () => {
  it("uses responsive Fields for story details instead of forcing a narrow horizontal layout", () => {
    const source = read("workspace/DetailsSection.tsx");
    expect(source).toContain('orientation="responsive"');
    expect(source).not.toContain("fieldRow");
  });

  it("keeps Empty states visually inside their Card instead of drawing a second border", () => {
    for (const file of [
      "workspace/BriefSection.tsx",
      "workspace/ReportingPlan.tsx",
      "workspace/TasksSection.tsx",
      "workspace/MediaSection.tsx",
      "workspace/ResourcesSection.tsx",
      "workspace/ActivitySection.tsx"
    ]) {
      expect(read(file), file).not.toContain('<Empty className="border">');
    }
  });

  it("uses the shared Spinner for pending dialog, peek-link and command-search states", () => {
    expect(read("workspace/dialog-shell.tsx")).toContain('<Spinner data-icon="inline-start" />');
    expect(read("story/StoryPeek.tsx")).toContain('<Spinner data-icon="inline-start" />Saving…');
    expect(read("home/HomeCommands.tsx")).toContain("<Spinner />Searching stories…");
  });
});
