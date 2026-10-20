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

  it("lazy-loads the protected workspace only after the preview opens", () => {
    const source = read("story/StoryHoverCard.tsx");
    expect(source).toContain("enabled: open && storyId > 0");
    expect(source).toContain("workspaceKey(storyId)");
    expect(source).toContain("getWorkspace");
    expect(source).toContain('data-slot="story-hover-preview"');
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
