import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { readSource } from "./source-files";

const src = path.resolve(__dirname, "../src");
const read = readSource;

describe("Settings shadcn sidebar", () => {
  it("uses the shared shadcn Sidebar primitives instead of the legacy settings rail", () => {
    const admin = read("index.tsx");
    const sidebar = read("settings/SettingsSidebar.tsx");

    expect(admin).toContain('from "./settings/SettingsSidebar"');
    expect(admin).toContain("<SettingsSidebar groups={sidebarGroups}");
    expect(admin).not.toContain('className="byline-settings-rail"');

    expect(sidebar).toContain('from "@byline/newsroom-ui/ui/sidebar"');
    expect(sidebar).toContain("<SidebarProvider");
    expect(sidebar).toContain("<SidebarGroupLabel>");
    expect(sidebar).toContain("<SidebarMenuButton");
  });

  it("keeps Nova styling isolated from the legacy WordPress settings forms", () => {
    const sidebar = read("settings/SettingsSidebar.tsx");
    const settingsStyle = read("settings/style.css");

    expect(sidebar).toContain('className="byline-ui-root byline-settings-sidebar-root"');
    expect(sidebar).toContain("<AdminPortalContext.Provider");
    expect(settingsStyle).toContain('@import "@byline/newsroom-ui/styles.css"');
  });

  it("uses the Sidebar mobile sheet instead of stacking the entire settings navigation", () => {
    const sidebar = read("settings/SettingsSidebar.tsx");
    expect(sidebar).toContain('collapsible={isMobile ? "offcanvas" : "none"}');
    expect(sidebar).toContain("<SidebarTrigger");
  });

  it("keeps its own sheet labels now that the shared primitive is generic", () => {
    const sidebar = read("settings/SettingsSidebar.tsx");
    expect(sidebar).toContain('mobileTitle="Settings sections"');
    expect(sidebar).toContain('<SidebarTrigger variant="outline" label="Open settings navigation" />');
  });
});

describe("shared shadcn Sidebar primitive", () => {
  const primitive = readFileSync(path.resolve(__dirname, "../../packages/newsroom-ui/src/ui/sidebar.tsx"), "utf8");

  it("names no product or screen, and leaves the shortcut and cookie to the host", () => {
    expect(primitive).not.toMatch(/Settings sections|settings navigation|Byline settings/);
    expect(primitive).toContain("keyboardShortcut = false");
    expect(primitive).toContain("persistCookie");
    expect(primitive).toContain('mobileTitle = "Navigation"');
  });

  it("exports the full application-shell composition", () => {
    for (const name of ["SidebarProvider", "Sidebar", "SidebarHeader", "SidebarContent", "SidebarFooter", "SidebarGroup", "SidebarGroupLabel", "SidebarGroupAction", "SidebarGroupContent", "SidebarMenu", "SidebarMenuItem", "SidebarMenuButton", "SidebarMenuAction", "SidebarMenuBadge", "SidebarMenuSub", "SidebarMenuSubItem", "SidebarMenuSubButton", "SidebarRail", "SidebarInset", "SidebarTrigger", "SidebarInput", "SidebarSeparator", "SidebarMenuSkeleton", "useSidebar"]) {
      expect(primitive).toMatch(new RegExp(`^  ${name},$`, "m"));
    }
  });

  it("hides collapsed-only tooltips without relying on Preflight", () => {
    expect(primitive).toContain('className={cn(hidden && "hidden", content.className)}');
  });
});
