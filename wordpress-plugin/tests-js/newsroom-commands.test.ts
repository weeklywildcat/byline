import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "../..");
const read = (relative: string) => readFileSync(path.join(root, relative), "utf8");

describe("universal newsroom command palette", () => {
  it("uses the shared palette and exposes the shortcut on WordPress screens", () => {
    const source = read("wordpress-plugin/src/newsroom-search.tsx");
    expect(source).toContain("home/HomeCommands");
    expect(source).toContain("<HomeCommands");
    expect(source).toContain("(event.metaKey || event.ctrlKey)");
    expect(source).toContain('aria-keyshortcuts="Control+K Meta+K"');
  });

  it("makes the same palette available from Planning and Story Workspace", () => {
    const planning = read("wordpress-plugin/src/planning/PlanningApp.tsx");
    expect(planning).toContain("<PlanningHeaderActions.Provider");
    expect(planning).toContain("<WordPressNewsroomSearch");
    const workspace = read("wordpress-plugin/src/story-workspace-entry.tsx");
    expect(workspace).toContain("<WordPressNewsroomSearch");
    expect(workspace).toContain("workspaceUrlFor(storiesUrl, id)");
    expect(workspace).toContain("Edit current article");
    expect(workspace).toContain("Preview current article");
  });

  it("uses the protected search endpoint through the shared Home fetchers", () => {
    const source = read("packages/newsroom-screens/src/home/home-api.ts");
    expect(source).toContain("searchStories?:");
    expect(source).toContain("/byline/v1/editorial/home/search?query=");
  });
});
