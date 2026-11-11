import { describe, expect, it } from "vitest";
import { routeSidebarWidthRule, shellRouteFor, shellSidebarStyle } from "../src/ui/shell/layout";

describe("route sidebar width before hydration", () => {
  it("gives a saved story's server render the Story workspace width above its breakpoint", () => {
    expect(routeSidebarWidthRule(shellRouteFor("/admin/collections/stories/3", "/admin"))).toBe("@media (min-width: 1300px) { :root { --byline-route-sidebar-width: 350px; } }");
  });

  it("never applies a workspace width below the adaptive navigation breakpoint", () => {
    expect(routeSidebarWidthRule(shellRouteFor("/admin/media", "/admin"))).toContain("min-width: 1200px");
  });

  it("has no rule for screens without a workspace", () => {
    expect(routeSidebarWidthRule(shellRouteFor("/admin", "/admin"))).toBeNull();
    expect(routeSidebarWidthRule(shellRouteFor("/admin/people", "/admin"))).toBeNull();
  });

  it("reads the width from the route rule until hydrated", () => {
    expect(shellSidebarStyle({ composition: "default" }, { fromRoute: true })).toMatchObject({ "--sidebar-width": "var(--byline-route-sidebar-width, 256px)" });
  });
});
