import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const src = path.resolve(__dirname, "../src");
const read = (relative: string) => readFileSync(path.join(src, relative), "utf8");

describe("universal newsroom command palette", () => {
  it("listens for both Meta+K and Control+K and exposes the shortcut visibly", () => {
    const source = read("story/NewsroomCommands.tsx");
    expect(source).toContain("(event.metaKey || event.ctrlKey)");
    expect(source).toContain('event.key.toLowerCase() === "k"');
    expect(source).toContain('aria-keyshortcuts="Control+K Meta+K"');
    expect(source).toContain("Search stories and actions");
  });

  it("is available from every Planning header rather than only Stories", () => {
    const page = read("planning/PlanningPage.tsx");
    const app = read("planning/PlanningApp.tsx");
    expect(page).toContain("<NewsroomSearchButton");
    expect(page).toContain("PlanningSearchProvider");
    expect(app).toContain("<PlanningSearchProvider");
    expect(app).toContain("<NewsroomCommands");
  });

  it("is available from Story Workspace and can search other stories", () => {
    expect(read("workspace/WorkspaceHeader.tsx")).toContain("<NewsroomSearchButton");
    const workspace = read("workspace/StoryWorkspace.tsx");
    expect(workspace).toContain("<NewsroomCommands");
    expect(workspace).toContain("workspaceUrlFor(env.storiesUrl, id)");
    expect(workspace).toContain("Edit current article");
    expect(workspace).toContain("Preview current article");
  });

  it("uses the protected story-search endpoint through shared Story fetchers", () => {
    const source = read("story/story-fetchers.ts");
    expect(source).toContain("searchStories?:");
    expect(source).toContain("/byline/v1/editorial/home/search?query=");
  });
});
