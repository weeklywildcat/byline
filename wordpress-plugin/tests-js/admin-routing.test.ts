import { describe, expect, it } from "vitest";
import {
  ADMIN_PAGE_SLUGS,
  adminScreenRoute,
  legacyHashDestination,
  normalizeAdminPage,
  normalizeAdminRoute,
  normalizeAdminTab
} from "../src/admin-routing";

describe("Byline admin local routing", () => {
  it("uses one Settings page for publication, integrations, and advanced configuration", () => {
    expect(normalizeAdminPage("byline-settings")).toBe(ADMIN_PAGE_SLUGS.settings);
    expect(normalizeAdminPage("not-a-byline-page")).toBe(ADMIN_PAGE_SLUGS.dashboard);
    expect(normalizeAdminTab(ADMIN_PAGE_SLUGS.settings, undefined)).toBe("identity");
    expect(normalizeAdminTab(ADMIN_PAGE_SLUGS.settings, "branding")).toBe("branding");
    expect(normalizeAdminTab(ADMIN_PAGE_SLUGS.settings, "analytics")).toBe("analytics");
    expect(normalizeAdminTab(ADMIN_PAGE_SLUGS.settings, "newsletter")).toBe("newsletter");
    expect(normalizeAdminTab(ADMIN_PAGE_SLUGS.settings, "invalid")).toBe("identity");
    expect(normalizeAdminTab(ADMIN_PAGE_SLUGS.planning, undefined)).toBe("today");

    expect(adminScreenRoute(ADMIN_PAGE_SLUGS.settings, "identity")).toBe("/publication/identity");
    expect(adminScreenRoute(ADMIN_PAGE_SLUGS.settings, "branding")).toBe("/publication/branding");
    expect(adminScreenRoute(ADMIN_PAGE_SLUGS.settings, "newsletter")).toBe("/integrations/newsletter");
    expect(adminScreenRoute(ADMIN_PAGE_SLUGS.settings, "analytics")).toBe("/integrations/analytics");
    expect(adminScreenRoute(ADMIN_PAGE_SLUGS.settings, "deployment")).toBe("/integrations/deployment");
    expect(adminScreenRoute(ADMIN_PAGE_SLUGS.settings, "login")).toBe("/integrations/login");
    expect(adminScreenRoute(ADMIN_PAGE_SLUGS.settings, "diagnostics")).toBe("/advanced/diagnostics");
    expect(adminScreenRoute(ADMIN_PAGE_SLUGS.planning, "today")).toBe("/home");

    // Legacy page slugs still normalize so the PHP redirect layer can translate
    // old bookmarks before the React app is mounted.
    expect(normalizeAdminTab(ADMIN_PAGE_SLUGS.publication, "features")).toBe("features");
    expect(normalizeAdminTab(ADMIN_PAGE_SLUGS.integrations, "deployment")).toBe("deployment");
  });

  it("translates former hash routes into the unified Settings destination", () => {
    expect(normalizeAdminRoute("")).toBe("/dashboard");
    expect(normalizeAdminRoute("#dashboard")).toBe("/dashboard");
    expect(normalizeAdminRoute("#/design/studio")).toBe("/design/studio");
    expect(legacyHashDestination("#/publication/branding")).toEqual({
      page: ADMIN_PAGE_SLUGS.settings,
      tab: "branding"
    });
    expect(legacyHashDestination("#/publication/features")).toEqual({
      page: ADMIN_PAGE_SLUGS.settings,
      tab: "features"
    });
    expect(legacyHashDestination("#/integrations/analytics")).toEqual({
      page: ADMIN_PAGE_SLUGS.settings,
      tab: "analytics"
    });
    expect(legacyHashDestination("#/newsletters/settings")).toEqual({
      page: ADMIN_PAGE_SLUGS.settings,
      tab: "newsletter"
    });
    expect(legacyHashDestination("#/design/revisions")).toEqual({ page: ADMIN_PAGE_SLUGS.dashboard });
    expect(legacyHashDestination("#/home")).toEqual({
      page: ADMIN_PAGE_SLUGS.planning,
      tab: "today"
    });
    expect(legacyHashDestination("#/removed-route")).toEqual({
      page: ADMIN_PAGE_SLUGS.dashboard
    });
  });
});
