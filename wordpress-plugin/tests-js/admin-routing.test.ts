import { describe, expect, it } from "vitest";
import { isNavigationItemVisible, normalizeAdminRoute } from "../src/admin-routing";

describe("Byline admin local routing", () => {
  it("uses a stable dashboard fallback and preserves valid hash routes", () => {
    expect(normalizeAdminRoute("")).toBe("/dashboard");
    expect(normalizeAdminRoute("#dashboard")).toBe("/dashboard");
    expect(normalizeAdminRoute("#/design/studio")).toBe("/design/studio");
  });

  it("hides navigation for disabled optional modules", () => {
    const features = { sports: false, events: true };
    expect(isNavigationItemVisible(undefined, features)).toBe(true);
    expect(isNavigationItemVisible("sports", features)).toBe(false);
    expect(isNavigationItemVisible("events", features)).toBe(true);
  });
});

