import { describe, expect, it } from "vitest";
import { createStudioConfig, studioBlockGroups } from "../src/studio";

describe("Byline Studio contract", () => {
  it("groups the stable newspaper block vocabulary without arbitrary code blocks", () => {
    expect(studioBlockGroups.Stories).toContain("story-lead");
    expect(studioBlockGroups.Sports).toContain("team-feature");
    expect(studioBlockGroups.Community).toContain("poll");
    expect(studioBlockGroups.Layout).toEqual(["section", "columns", "divider"]);
    expect(Object.values(studioBlockGroups).flat()).not.toContain("raw-html");
  });

  it("provides editorial query fields and manual selection fields", () => {
    const config = createStudioConfig("byline-modern", { accent: "#005f68" });
    const lead = config.components?.["story-lead"];
    const featured = config.components?.["featured-story"];
    const photo = config.components?.["photo-feature"];
    expect(lead?.fields).toHaveProperty("query");
    expect(lead?.fields).toHaveProperty("allowDuplicates");
    expect(featured?.fields).toHaveProperty("storyId");
    expect(photo?.fields).toHaveProperty("mediaId");
    expect(photo?.fields).toHaveProperty("focalPoint");
  });

  it("creates a self-contained theme-aware WordPress preview", () => {
    const config = createStudioConfig("byline-magazine", { accent: "#123456" });
    expect(config.root?.render).toBeTypeOf("function");
    expect(config.categories?.Stories?.defaultExpanded).toBe(true);
  });
});
