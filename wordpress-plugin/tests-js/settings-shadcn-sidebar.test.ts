import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const src = path.resolve(__dirname, "../src");
const read = (relative: string) => readFileSync(path.join(src, relative), "utf8");

describe("Settings shadcn sidebar", () => {
  it("uses the shared shadcn Sidebar primitives instead of the legacy settings rail", () => {
    const admin = read("index.tsx");
    const sidebar = read("settings/SettingsSidebar.tsx");

    expect(admin).toContain('from "./settings/SettingsSidebar"');
    expect(admin).toContain("<SettingsSidebar groups={sidebarGroups}");
    expect(admin).not.toContain('className="byline-settings-rail"');

    expect(sidebar).toContain('from "../admin-ui/ui/sidebar"');
    expect(sidebar).toContain("<SidebarProvider");
    expect(sidebar).toContain("<SidebarGroupLabel>");
    expect(sidebar).toContain("<SidebarMenuButton");
  });

  it("keeps Nova styling isolated from the legacy WordPress settings forms", () => {
    const sidebar = read("settings/SettingsSidebar.tsx");
    const settingsStyle = read("settings/style.css");

    expect(sidebar).toContain('className="byline-ui-root byline-settings-sidebar-root"');
    expect(sidebar).toContain("<AdminPortalContext.Provider");
    expect(settingsStyle).toContain('@import "../admin-ui/admin-ui.css"');
  });

  it("uses the Sidebar mobile sheet instead of stacking the entire settings navigation", () => {
    const sidebar = read("settings/SettingsSidebar.tsx");
    expect(sidebar).toContain('collapsible={isMobile ? "offcanvas" : "none"}');
    expect(sidebar).toContain("<SidebarTrigger");
  });
});
