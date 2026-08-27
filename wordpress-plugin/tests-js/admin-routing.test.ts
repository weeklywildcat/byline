import { describe, expect, it } from "vitest";
import {
  ADMIN_PAGE_SLUGS,
  adminScreenRoute,
  legacyHashDestination,
  normalizeAdminPage,
  normalizeAdminRoute,
  normalizeAdminTab,
  normalizeStudioView
} from "../src/admin-routing";

describe("Byline admin local routing", () => {
  it("uses native page slugs and safe tab defaults", () => {
    expect(normalizeAdminPage("byline-publication")).toBe(ADMIN_PAGE_SLUGS.publication);
    expect(normalizeAdminPage("not-a-byline-page")).toBe(ADMIN_PAGE_SLUGS.dashboard);
    expect(normalizeAdminTab(ADMIN_PAGE_SLUGS.publication, "branding")).toBe("branding");
    expect(normalizeAdminTab(ADMIN_PAGE_SLUGS.publication, "invalid")).toBe("identity");
    expect(normalizeAdminTab(ADMIN_PAGE_SLUGS.integrations, undefined)).toBe("discord");
    expect(normalizeAdminTab(ADMIN_PAGE_SLUGS.settings, "invalid")).toBe("access");
    expect(normalizeStudioView("revisions")).toBe("revisions");
    expect(normalizeStudioView("invalid")).toBe("editor");
    expect(adminScreenRoute(ADMIN_PAGE_SLUGS.publication, "branding")).toBe("/publication/branding");
    expect(adminScreenRoute(ADMIN_PAGE_SLUGS.integrations, "deployment")).toBe("/integrations/deployment");
    expect(adminScreenRoute(ADMIN_PAGE_SLUGS.settings, "diagnostics")).toBe("/advanced/diagnostics");
    expect(adminScreenRoute(ADMIN_PAGE_SLUGS.theme, undefined)).toBe("/design/theme");
  });

  it("keeps the former hash parser only for bookmarked-link compatibility", () => {
    expect(normalizeAdminRoute("")).toBe("/dashboard");
    expect(normalizeAdminRoute("#dashboard")).toBe("/dashboard");
    expect(normalizeAdminRoute("#/design/studio")).toBe("/design/studio");
    expect(legacyHashDestination("#/publication/branding")).toEqual({
      page: ADMIN_PAGE_SLUGS.publication,
      tab: "branding"
    });
    expect(legacyHashDestination("#/design/revisions")).toEqual({
      page: ADMIN_PAGE_SLUGS.studio,
      view: "revisions"
    });
    expect(legacyHashDestination("#/removed-route")).toEqual({
      page: ADMIN_PAGE_SLUGS.dashboard
    });
  });
});
