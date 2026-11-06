import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { activeNavKey, CALENDAR_PATH, isCalendarPath, NAVIGATION, navigationFor, locationFor } from "../src/domain/navigation";
import { shellCompositionFor, shellLayoutFor, shellRouteFor, shellSidebarStyle } from "../src/ui/shell/layout";
import { CALENDAR_GEOMETRY, CALENDAR_WORKSPACE_MIN_WIDTH, CALENDAR_WORKSPACE_QUERY, SIDEBAR_WIDTH, STORY_WORKSPACE_MIN_WIDTH } from "../src/ui/shell/shell-config";
import { CALENDAR_PREFERENCES_KEY } from "../src/ui/calendar/calendar-preferences";

const root = path.resolve(__dirname, "..");
const src = (file: string) => readFileSync(path.join(root, "src", file), "utf8");

describe("the shell's compositions", () => {
  const wide = { storyWorkspace: true, calendarWorkspace: true };
  const narrow = { storyWorkspace: false, calendarWorkspace: false };

  it("the Calendar is a workspace only on its own screen, on a wide enough screen", () => {
    expect(shellLayoutFor("/admin/calendar", "/admin", wide)).toEqual({ storyId: null, calendar: true, media: false, composition: "calendar-workspace" });
    expect(shellLayoutFor("/admin/calendar/", "/admin", wide).composition).toBe("calendar-workspace");
    expect(shellLayoutFor("/admin/calendar", "/admin", narrow).composition).toBe("default");
    for (const path of ["/admin", "/admin/stories", "/admin/calendars", "/admin/collections/calendar"]) {
      expect(shellLayoutFor(path, "/admin", wide).composition).toBe("default");
    }
  });

  it("each workspace has its own breakpoint: a viewport can be wide for one and not the other", () => {
    const route = shellRouteFor("/admin/calendar", "/admin");
    expect(shellCompositionFor(route, { storyWorkspace: false, calendarWorkspace: true })).toBe("calendar-workspace");
    expect(shellCompositionFor(route, { storyWorkspace: true, calendarWorkspace: false })).toBe("default");
    const story = shellRouteFor("/admin/collections/stories/9", "/admin");
    expect(shellCompositionFor(story, { storyWorkspace: false, calendarWorkspace: true })).toBe("default");
  });

  it("reserves sidebar-09's 350px for both workspaces, with the same 48px icon rail", () => {
    expect(SIDEBAR_WIDTH.calendarWorkspace).toBe(350);
    expect(shellSidebarStyle({ composition: "calendar-workspace" })).toMatchObject({ "--sidebar-width": "350px", "--sidebar-width-icon": "48px" });
    expect(shellSidebarStyle({ composition: "default" })).toMatchObject({ "--sidebar-width": "256px" });
  });

  it("is still one SidebarProvider and one outer collapsible Sidebar, whatever the composition", () => {
    const sidebar = src("ui/shell/BylineSidebar.tsx");
    expect(sidebar.match(/<Sidebar collapsible="icon"/g)).toHaveLength(1);
    expect(sidebar).toContain("CalendarWorkspaceSidebar");
    expect(src("ui/shell/BylineShell.tsx").match(/<SidebarProvider/g)).toHaveLength(1);
    expect(src("ui/shell/CalendarWorkspaceSidebar.tsx")).not.toMatch(/SidebarProvider/);
  });

  it("reuses the one global icon rail and a non-collapsible inner pane that is inert when collapsed", () => {
    const calendar = src("ui/shell/CalendarWorkspaceSidebar.tsx");
    expect(calendar).toContain("<BylineIconRail");
    expect(calendar).toContain('collapsible="none"');
    expect(calendar).toContain("inert={collapsed}");
    expect(calendar).toContain("<CalendarControls");
    // No second navigation list: the rail renders NAVIGATION.
    expect(calendar).not.toMatch(/NAV_ICONS|navigationFor/);
  });
});

describe("the Calendar breakpoint", () => {
  it("derives from the measured geometry: the sidebar, the screen's padding and Schedule-X's week grid", () => {
    const { sidebar, sidePadding, weekAxis, weekColumnMin, monthCellMin } = CALENDAR_GEOMETRY;
    const weekNeeds = sidebar + sidePadding + weekAxis + 7 * weekColumnMin;
    const monthNeeds = sidebar + sidePadding + 7 * monthCellMin;
    expect(CALENDAR_WORKSPACE_MIN_WIDTH).toBe(Math.max(weekNeeds, monthNeeds));
    expect(CALENDAR_WORKSPACE_MIN_WIDTH).toBe(1320);
    expect(CALENDAR_WORKSPACE_QUERY).toBe("(min-width: 1320px)");
    expect(sidebar).toBe(SIDEBAR_WIDTH.calendarWorkspace);
  });

  it("is its own number, not the Story workspace's", () => {
    expect(STORY_WORKSPACE_MIN_WIDTH).toBe(1300);
    expect(CALENDAR_WORKSPACE_MIN_WIDTH).not.toBe(STORY_WORKSPACE_MIN_WIDTH);
  });

  it("the Calendar screen's side padding is the one the breakpoint assumes (lg:px-6 each side)", () => {
    expect(src("ui/calendar/NewsroomCalendarScreen.tsx")).toContain("lg:px-6");
    expect(CALENDAR_GEOMETRY.sidePadding).toBe(24 * 2);
  });
});

describe("Calendar navigation", () => {
  it("is Home, Stories, Calendar, Media: a destination of its own, with no generic Planning", () => {
    expect(navigationFor("staff").map((item) => item.key)).toEqual(["home", "stories", "calendar", "media"]);
    expect(NAVIGATION.find((item) => item.key === "calendar")).toEqual({ key: "calendar", label: "Calendar", path: "/calendar", minimumRole: "staff" });
    expect(NAVIGATION.map((item) => item.key)).not.toContain("planning");
  });

  it("knows the Calendar's address, highlights it and names it in the header", () => {
    expect(CALENDAR_PATH).toBe("/calendar");
    expect(isCalendarPath("/admin/calendar", "/admin")).toBe(true);
    expect(isCalendarPath("/admin/calendar?x=1", "/admin")).toBe(true);
    expect(isCalendarPath("/admin/stories", "/admin")).toBe(false);
    expect(activeNavKey(NAVIGATION, "/admin/calendar", "/admin")).toBe("calendar");
    expect(locationFor("/admin/calendar", "/admin")).toEqual([{ label: "Calendar" }]);
  });

  it("is a custom root view registered with Payload like Home and Stories", () => {
    const config = src("payload.config.ts");
    expect(config).toContain('calendar: { Component: "/components/BylineCalendar#BylineCalendar", path: "/calendar" }');
    expect(src("app/(payload)/admin/importMap.js")).toContain("/components/BylineCalendar#BylineCalendar");
    expect(src("components/BylineCalendar.tsx")).toContain("DefaultTemplate");
  });
});

describe("the Calendar screen", () => {
  const screen = src("ui/calendar/NewsroomCalendarScreen.tsx");
  it("uses the shell's query cache, Story Peek and navigation, and mounts no QueryClient of its own", () => {
    expect(screen).not.toMatch(/new QueryClient|createAdminQueryClient|QueryClientProvider/);
    expect(screen).toContain("<StoryPeekHost");
    expect(screen).toContain("useShellNavigation");
    expect(screen).toContain("?appointment=");
  });

  it("keeps the Calendar's state in the shell and its preferences in Payload Preferences", () => {
    expect(src("ui/shell/BylineShell.tsx")).toContain("<CalendarWorkspaceShell>");
    expect(src("ui/calendar/CalendarWorkspaceShell.tsx")).toContain("usePreferences");
    expect(CALENDAR_PREFERENCES_KEY).toBe("byline:calendar:preferences:v1");
  });

  it("shows the contextual pane's controls in the toolbar's sheet whenever the pane is not showing", () => {
    expect(screen).toMatch(/paneShowing \? "external" : "sheet"/);
    expect(screen).toContain('state === "expanded"');
  });
});

describe("Schedule-X styling", () => {
  it("inherits the grid heights Schedule-X sets on <html>, which its theme would otherwise zero (blank Week and Day grids)", () => {
    const css = readFileSync(path.resolve(root, "../../packages/newsroom-screens/src/calendar/calendar.css"), "utf8");
    expect(css).toMatch(/--sx-week-grid-height:\s*inherit/);
    expect(css).toMatch(/--sx-week-grid-hour-height:\s*inherit/);
    expect(src("ui/newsroom.css")).toContain("@byline/newsroom-screens/calendar/calendar.css");
  });
});
