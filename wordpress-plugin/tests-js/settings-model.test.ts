import { describe, expect, it } from "vitest";
import { createNavigationItem, moveItem, navigationConflictKey, sectionSlugForName, slugifySectionName } from "../src/settings-model";

describe("publication settings helpers", () => {
  it("creates a valid section slug from the name", () => {
    expect(slugifySectionName("Student Life & Culture")).toBe("student-life-culture");
    expect(slugifySectionName("  Élections 2026 ")).toBe("elections-2026");
  });

  it("stops changing a slug after the editor takes manual control", () => {
    expect(sectionSlugForName("Student Life", "", "auto")).toBe("student-life");
    expect(sectionSlugForName("Renamed section", "desk-news", "manual")).toBe("desk-news");
  });

  it("preserves an established order while moving navigation items", () => {
    expect(moveItem(["Sports", "News", "Arts"], 1, -1)).toEqual(["News", "Sports", "Arts"]);
    expect(moveItem(["Sports", "News", "Arts"], 0, -1)).toEqual(["Sports", "News", "Arts"]);
  });

  it("detects the same URL used in the same placement", () => {
    expect(navigationConflictKey({ url: "/sports", locations: ["footer", "header"] }))
      .toBe(navigationConflictKey({ url: "/sports", locations: ["header", "footer"] }));
  });

  it("creates durable internal links from section and page choices", () => {
    expect(createNavigationItem("section:student-life", [{ name: "Student Life", slug: "student-life" }], []))
      .toEqual({ label: "Student Life", url: "/category/student-life/", locations: ["header"] });
    expect(createNavigationItem("page:42", [], [{ id: 42, title: "About us", url: "https://news.example.test/about/" }]))
      .toEqual({ label: "About us", url: "https://news.example.test/about/", locations: ["header"] });
  });
});
