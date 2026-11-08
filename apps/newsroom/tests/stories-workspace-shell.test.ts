import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { activeNavKey, isStoriesPath, NAVIGATION, navigationFor, STORIES_PATH } from "../src/domain/navigation";
import { shellCompositionFor, shellLayoutFor, shellRouteFor, shellSidebarStyle } from "../src/ui/shell/layout";
import { SIDEBAR_WIDTH, STORIES_GEOMETRY, STORIES_WORKSPACE_MIN_WIDTH, STORIES_WORKSPACE_QUERY } from "../src/ui/shell/shell-config";

const root = path.resolve(__dirname, "..");
const src = (file: string) => readFileSync(path.join(root, "src", file), "utf8");

describe("Stories in the shell", () => {
  it("is one route whatever the view or filters (those are its query), and never a story's own screen", () => {
    for (const address of ["/admin/stories", "/admin/stories/", "/admin/stories?view=list", "/admin/stories?needs_review=1"]) expect(isStoriesPath(address, "/admin")).toBe(true);
    for (const address of ["/admin", "/admin/collections/stories", "/admin/collections/stories/12", "/admin/stories-archive", "/admin/calendar"]) expect(isStoriesPath(address, "/admin")).toBe(false);
    expect(NAVIGATION.find((item) => item.key === "stories")?.path).toBe(STORIES_PATH);
    expect(activeNavKey(navigationFor("staff"), "/admin/stories", "/admin")).toBe("stories");
  });
});

describe("the Stories workspace composition", () => {
  const wide = { storyWorkspace: true, calendarWorkspace: true, mediaWorkspace: true, storiesWorkspace: true };
  const narrow = { storyWorkspace: false, calendarWorkspace: false, mediaWorkspace: false, storiesWorkspace: false };

  it("is the rail plus the Stories pane on a wide enough Stories screen, and the ordinary sidebar otherwise", () => {
    expect(shellLayoutFor("/admin/stories", "/admin", wide)).toEqual({ storyId: null, stories: true, calendar: false, media: false, collections: false, collectionId: null, composition: "stories-workspace" });
    expect(shellLayoutFor("/admin/stories?view=list", "/admin", wide).composition).toBe("stories-workspace");
    expect(shellLayoutFor("/admin/stories", "/admin", narrow).composition).toBe("default");
    for (const address of ["/admin", "/admin/calendar", "/admin/collections/stories"]) expect(shellLayoutFor(address, "/admin", wide).composition).not.toBe("stories-workspace");
    // A saved story's own screen stays the Story workspace.
    expect(shellLayoutFor("/admin/collections/stories/12", "/admin", wide).composition).toBe("story-workspace");
  });

  it("has its own breakpoint, independent of the other workspaces", () => {
    const route = shellRouteFor("/admin/stories", "/admin");
    expect(shellCompositionFor(route, { storyWorkspace: false, calendarWorkspace: false, storiesWorkspace: true })).toBe("stories-workspace");
    expect(shellCompositionFor(route, { storyWorkspace: true, calendarWorkspace: true, mediaWorkspace: true })).toBe("default");
  });

  it("reserves 300px (a 48px rail and a 252px pane) on the one sidebar", () => {
    expect(SIDEBAR_WIDTH.storiesWorkspace).toBe(STORIES_GEOMETRY.sidebar);
    expect(shellSidebarStyle({ composition: "stories-workspace" })).toMatchObject({ "--sidebar-width": "300px", "--sidebar-width-icon": "48px" });
  });

  it("pins the measured geometry: the default Lanes board needs no sideways scroll at the breakpoint", () => {
    const { sidebar, sidePadding, laneMin, railWidth, divider, gap, expandedLanes, rails } = STORIES_GEOMETRY;
    const items = expandedLanes + rails + 1; // the divider is an item too
    const board = expandedLanes * laneMin + rails * railWidth + divider + (items - 1) * gap;
    expect(board).toBe(985);
    // Measured: the frame is the viewport minus the sidebar and the screen's side padding (932 at 1280).
    expect(1280 - sidebar - sidePadding).toBe(932);
    expect(STORIES_WORKSPACE_MIN_WIDTH - sidebar - sidePadding).toBeGreaterThanOrEqual(board);
    expect(1280 - sidebar - sidePadding).toBeLessThan(board);
    expect(STORIES_WORKSPACE_QUERY).toBe(`(min-width: ${STORIES_WORKSPACE_MIN_WIDTH}px)`);
  });

  it("is still one SidebarProvider and one outer Sidebar, with the global rail and an inert pane", () => {
    expect(src("ui/shell/BylineSidebar.tsx").match(/<Sidebar collapsible="icon"/g)).toHaveLength(1);
    expect(src("ui/shell/BylineSidebar.tsx")).toContain("StoriesWorkspaceSidebar");
    expect(src("ui/shell/BylineShell.tsx").match(/<SidebarProvider/g)).toHaveLength(1);
    expect(src("ui/shell/BylineShell.tsx")).toContain("<StoriesWorkspaceShell>");
    const pane = src("ui/shell/StoriesWorkspaceSidebar.tsx");
    expect(pane).toContain("<BylineIconRail");
    expect(pane).toContain('collapsible="none"');
    expect(pane).toContain("inert={collapsed}");
    expect(pane).toContain("data-byline-stories-pane");
    expect(pane).not.toMatch(/SidebarProvider|NAV_ICONS|navigationFor/);
  });

  it("hands the shell's one workspace to the Stories screen, and hides the picker only while the pane shows", () => {
    const host = src("ui/stories/NewsroomStories.tsx");
    expect(host).toContain("workspace={workspace}");
    expect(host).toContain("showViewsPicker={!paneOwnsViews}");
    expect(host).toContain('composition === "stories-workspace" && state === "expanded"');
    expect(host).toContain("<StoriesNavigator workspace={workspace}");
  });
});
