import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const src = path.resolve(__dirname, "../src");
const read = (relative: string) => readFileSync(path.join(src, relative), "utf8");

describe("story hover previews", () => {
  it("uses the shadcn Base UI preview-card primitive inside the private admin portal", () => {
    const source = read("admin-ui/ui/hover-card.tsx");
    expect(source).toContain('@base-ui/react/preview-card');
    expect(source).toContain("useAdminPortal");
    expect(source).toContain("<PreviewCardPrimitive.Portal container={useAdminPortal()}>");
  });

  it("only enters React Query after a hover provider exists, then lazy-loads on open", () => {
    const source = read("story/StoryHoverCard.tsx");
    expect(source).toContain("if (!context?.fetchers.getWorkspace || props.storyId <= 0) return props.children");
    expect(source).toContain("function StoryHoverCardQuery");
    expect(source).toContain("enabled: open");
    expect(source).toContain("workspaceKey(storyId)");
    expect(source).toContain("getWorkspace");
    expect(source).toContain('data-slot="story-hover-preview"');
  });

  it("provides hover data in Planning as well as Home", () => {
    expect(read("home/HomeApp.tsx")).toContain("<StoryHoverProvider");
    expect(read("planning/PlanningApp.tsx")).toContain("<StoryHoverProvider");
  });

  it("covers persistent story references across Home and Planning", () => {
    for (const file of [
      "home/components/rows.tsx",
      "story/rows.tsx",
      "planning/StoryBoard.tsx",
      "planning/StoryList.tsx",
      "planning/MediaDesk.tsx",
      "planning/Coverage.tsx",
      "planning/ContentHealth.tsx",
      "planning/NeedsScheduling.tsx",
      "planning/Feedback.tsx",
      "planning/Performance.tsx",
      "planning/calendar-events.tsx"
    ]) {
      expect(read(file), file).toContain("StoryHoverCard");
    }
  });

  it("keeps hover cards supplemental instead of putting a second navigation surface in the popup", () => {
    const source = read("story/StoryHoverCard.tsx");
    expect(source).not.toContain(">Open details<");
    expect(source).not.toContain(">Workspace<");
    expect(source).not.toContain("buttonVariants");
  });
});
