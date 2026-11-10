import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { activeNavKey, isMediaPath, locationFor, MEDIA_PATH, NAVIGATION, navigationFor } from "../src/domain/navigation";
import { shellCompositionFor, shellLayoutFor, shellRouteFor, shellSidebarStyle } from "../src/ui/shell/layout";
import { MEDIA_GEOMETRY, MEDIA_INSPECTOR_MIN_WIDTH, MEDIA_INSPECTOR_QUERY, MEDIA_WORKSPACE_MIN_WIDTH, MEDIA_WORKSPACE_QUERY, SIDEBAR_WIDTH } from "../src/ui/shell/shell-config";
import { MEDIA_PREFERENCES_KEY } from "../src/ui/media/payload-media-fetchers";

const root = path.resolve(__dirname, "..");
const src = (file: string) => readFileSync(path.join(root, "src", file), "utf8");

describe("Media in the newsroom", () => {
  it("is a destination after Calendar, for everyone, with no Planning and no raw Media collection", () => {
    expect(navigationFor("staff").map((item) => item.key)).toEqual(["home", "stories", "calendar", "media", "collections", "data"]);
    expect(NAVIGATION.find((item) => item.key === "media")).toEqual({ key: "media", label: "Media", path: "/media", minimumRole: "staff" });
    expect(navigationFor("staff").some((item) => item.path.startsWith("/collections/"))).toBe(false);
    expect(locationFor("/admin/media", "/admin")).toEqual([{ label: "Media" }]);
    expect(activeNavKey(navigationFor("staff"), "/admin/media", "/admin")).toBe("media");
  });

  it("is a supported Payload custom view at /media that checks the account", () => {
    const config = src("payload.config.ts");
    expect(config).toContain('media: { Component: "/components/BylineMedia#BylineMedia", path: "/media", meta: { title: "Media" } }');
    const view = src("components/BylineMedia.tsx");
    expect(view).toContain("requestUser(req)");
    expect(view).toContain("<DefaultTemplate");
  });

  it("is one route whatever the view, folder or asset (those are its query)", () => {
    for (const address of ["/admin/media", "/admin/media/", "/admin/media?view=work&scope=due", "/admin/media?folder=4&asset=9"]) expect(isMediaPath(address, "/admin")).toBe(true);
    for (const address of ["/admin/collections/media", "/admin/media-desk", "/admin/calendar"]) expect(isMediaPath(address, "/admin")).toBe(false);
    expect(MEDIA_PATH).toBe("/media");
  });
});

describe("the Media workspace composition", () => {
  const wide = { storyWorkspace: true, calendarWorkspace: true, mediaWorkspace: true };
  const narrow = { storyWorkspace: false, calendarWorkspace: false, mediaWorkspace: false };

  it("is the rail plus the Media navigator on a wide enough Media screen, and the ordinary sidebar otherwise", () => {
    expect(shellLayoutFor("/admin/media", "/admin", wide)).toEqual({ storyId: null, stories: false, calendar: false, media: true, collections: false, collectionId: null, composition: "media-workspace" });
    expect(shellLayoutFor("/admin/media", "/admin", narrow).composition).toBe("default");
    for (const address of ["/admin", "/admin/stories", "/admin/collections/media"]) expect(shellLayoutFor(address, "/admin", wide).composition).toBe("default");
  });

  it("has its own breakpoint, independent of the Story and Calendar workspaces", () => {
    const route = shellRouteFor("/admin/media", "/admin");
    expect(shellCompositionFor(route, { storyWorkspace: false, calendarWorkspace: false, mediaWorkspace: true })).toBe("media-workspace");
    expect(shellCompositionFor(route, { storyWorkspace: true, calendarWorkspace: true, mediaWorkspace: false })).toBe("default");
    expect(shellCompositionFor(shellRouteFor("/admin/calendar", "/admin"), { storyWorkspace: false, calendarWorkspace: true, mediaWorkspace: true })).toBe("calendar-workspace");
  });

  it("reserves 320px (rail + navigator) on the one sidebar", () => {
    expect(SIDEBAR_WIDTH.mediaWorkspace).toBe(MEDIA_GEOMETRY.sidebar);
    expect(shellSidebarStyle({ composition: "media-workspace" })).toMatchObject({ "--sidebar-width": "320px", "--sidebar-width-icon": "48px" });
  });

  it("leaves at least three comfortable thumbnails beside the navigator, and room for the inspector only on large screens", () => {
    const { sidebar, sidePadding, tileMin, gap, inspectorMin } = MEDIA_GEOMETRY;
    const grid = (viewport: number, inspector = 0) => viewport - sidebar - sidePadding - inspector;
    const columns = (width: number) => Math.floor((width + gap) / (tileMin + gap));
    expect(columns(grid(MEDIA_WORKSPACE_MIN_WIDTH))).toBeGreaterThanOrEqual(3);
    expect(MEDIA_WORKSPACE_MIN_WIDTH).toBe(1024);
    expect(MEDIA_WORKSPACE_QUERY).toBe("(min-width: 1024px)");
    // The persistent inspector: three comfortable columns at its minimum width, from 1440 (not 1366).
    expect(columns(grid(MEDIA_INSPECTOR_MIN_WIDTH, inspectorMin) - 16)).toBeGreaterThanOrEqual(3);
    expect(MEDIA_INSPECTOR_MIN_WIDTH).toBeGreaterThan(1366);
    expect(MEDIA_INSPECTOR_QUERY).toBe("(min-width: 1440px)");
  });

  it("is still one SidebarProvider and one outer Sidebar, with the global rail and an inert pane", () => {
    expect(src("ui/shell/BylineSidebar.tsx").match(/<Sidebar collapsible="icon"/g)).toHaveLength(1);
    expect(src("ui/shell/BylineSidebar.tsx")).toContain("MediaWorkspaceSidebar");
    expect(src("ui/shell/BylineShell.tsx").match(/<SidebarProvider/g)).toHaveLength(1);
    const media = src("ui/shell/MediaWorkspaceSidebar.tsx");
    expect(media).toContain("<BylineIconRail");
    expect(media).toContain('collapsible="none"');
    expect(media).toContain("inert={collapsed}");
    expect(media).not.toMatch(/SidebarProvider|NAV_ICONS|navigationFor/);
  });

  it("renders the same navigator in the pane and the narrow sheet, and the inspector in a resizable panel or a sheet", () => {
    expect(src("ui/shell/MediaWorkspaceSidebar.tsx")).toContain("<MediaNavigator />");
    const screen = src("ui/media/NewsroomMediaScreen.tsx");
    expect(screen).toContain("<MediaNavigator onNavigated=");
    expect(screen).toContain("<ResizablePanelGroup");
    expect(screen.match(/<MediaInspectorContent/g)).toHaveLength(1);
    expect(screen).not.toMatch(/SidebarProvider/);
  });

  it("keeps the reader's Media preferences in Payload Preferences under a versioned key", () => {
    expect(MEDIA_PREFERENCES_KEY).toBe("byline:media:preferences:v1");
    expect(src("ui/media/MediaWorkspaceShell.tsx")).toContain("usePreferences()");
  });

  it("links production files through Byline's picker everywhere, never Payload's Media list", () => {
    expect(src("ui/story/StoryScreen.tsx")).toContain("media={media}");
    expect(src("ui/media/NewsroomMediaScreen.tsx")).toContain("media={picker}");
    for (const file of ["ui/media/NewsroomMediaScreen.tsx", "ui/media/MediaWorkspaceShell.tsx", "ui/story/StoryScreen.tsx"]) expect(src(file)).not.toContain("/collections/media");
  });

  it("opens the canonical Media inspector over a Story without leaving the article", () => {
    const shell = src("ui/media/MediaWorkspaceShell.tsx");
    expect(shell).toContain("editDetails");
    expect(shell).toContain("<InlineMediaDetailsSheet");
    expect(shell).toContain("<MediaArtDirectionDialog");

    const inline = src("ui/media/InlineMediaDetailsSheet.tsx");
    expect(inline).toContain("<MediaInspectorContent");
    expect(inline).toContain("guardRef={guard}");
    expect(inline).toContain("Save your changes to this file?");

    const host = src("ui/story/editor-host.tsx");
    expect(host).toContain("editMediaDetails:");
    expect(host).toContain('queryKey: ["byline", "story-media-readiness"]');
  });
});
