import { describe, expect, it } from "vitest";
import { normalizeStoryLayout } from "../src/ui/story/story-layout-model";
import { parseStoryLocation, parseStoryTab, storyLocationSearch } from "../src/ui/story/story-view";

describe("legacy Story layout preference", () => {
  it("is the default layout unless the account explicitly chose tabs", () => {
    expect(normalizeStoryLayout(undefined)).toBe("focused");
    expect(normalizeStoryLayout(null)).toBe("focused");
    expect(normalizeStoryLayout({})).toBe("focused");
    expect(normalizeStoryLayout({ layout: "tabs" })).toBe("tabs");
    expect(normalizeStoryLayout({ layout: "focused" })).toBe("focused");
    expect(normalizeStoryLayout({ layout: "something-else" })).toBe("focused");
    expect(normalizeStoryLayout("tabs")).toBe("tabs");
    expect(normalizeStoryLayout(42)).toBe("focused");
  });

  it("starts the tabbed layout on the tab named by an old link, else Write", () => {
    expect(parseStoryTab("")).toBe("write");
    expect(parseStoryTab("?tab=plan")).toBe("plan");
    expect(parseStoryTab("?tab=production")).toBe("production");
    expect(parseStoryTab("?tab=history")).toBe("history");
    expect(parseStoryTab("?tab=reporting")).toBe("write");
    expect(parseStoryTab("?tab=nope")).toBe("write");
  });

  it("leaves the focused layout's addresses alone", () => {
    expect(parseStoryLocation("?tab=production").view).toBe("story");
    expect(parseStoryLocation("?view=history").view).toBe("history");
    expect(storyLocationSearch("?tab=plan", "story")).toBe("");
  });
});
