import { describe, expect, it } from "vitest";
import { analyzeResolvedDesign, semanticDesignDiff } from "../src/design-intelligence-model";

const live = {
  schemaVersion: 2 as const,
  template: "home",
  theme: "weekly-wildcat",
  packages: [
    { id: "lead", type: "lead-package" as const, props: { heading: "Lead" } },
    { id: "more", type: "more-package" as const, props: { source: { type: "latest" as const } } }
  ]
};

describe("design intelligence model", () => {
  it("describes package additions, moves, and settings changes semantically", () => {
    const draft = {
      ...live,
      packages: [
        { ...live.packages[1] },
        { ...live.packages[0], props: { heading: "Updated lead" } },
        { id: "special", type: "special-coverage-package" as const, props: { source: { type: "coverage" as const, coverageId: 42 } } }
      ]
    };
    const diff = semanticDesignDiff(draft, live);

    expect(diff.changed).toBe(true);
    expect(diff.operations.map((operation) => operation.type)).toEqual(["added", "moved", "moved", "changed"]);
    expect(diff.operations[0].description).toBe("Special Coverage package added");
    expect(diff.operations.slice(1, 3).every((operation) => operation.description.includes("moved"))).toBe(true);
    expect(diff.operations[3].description).toContain("settings changed");
  });

  it("reports document-level semantic changes while ignoring storage metadata", () => {
    const draft = { ...live, theme: "byline-modern", modifiedAt: "newer" };
    const diff = semanticDesignDiff(draft, live);

    expect(diff.operations).toEqual([
      expect.objectContaining({
        type: "changed",
        scope: "document",
        packageId: "__document__",
        changedPaths: ["theme"],
        description: "Theme changed from weekly-wildcat to byline-modern"
      })
    ]);
  });

  it("uses resolved story data for duplicate, image, public, empty, and Coverage warnings", () => {
    const document = {
      ...live,
      packages: [
        { id: "lead", type: "lead-package" as const, props: { source: { type: "manual" as const, storyIds: [7, 8] } } },
        { id: "special", type: "special-coverage-package" as const, props: { source: { type: "coverage" as const, coverageId: 42 } } },
        { id: "more", type: "more-package" as const, props: { source: { type: "latest" as const } } }
      ]
    };
    const intelligence = analyzeResolvedDesign({
      document,
      packages: [
        { type: "lead-package", package: { packageId: "lead", lead: { id: 7, image: null, isPublic: true }, rail: [{ id: 8, image: { src: "/8.jpg" }, isPublic: false }] } },
        { type: "special-coverage-package", package: { packageId: "special", stories: [{ id: 7, image: { src: "/7.jpg" } }], coverage: null } },
        { type: "more-package", package: { packageId: "more", lead: [{ id: 8 }, { id: 8 }], rail: [] } },
        { type: "brief-package", package: { packageId: "empty", stories: [] } }
      ]
    });

    expect(intelligence.duplicateStoryIds).toEqual([7, 8]);
    expect(intelligence.storyIds).toEqual([7, 8]);
    expect(intelligence.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      "story-missing-image",
      "story-not-public",
      "duplicate-story",
      "coverage-missing",
      "empty-package"
    ]));
    expect(JSON.stringify(intelligence)).not.toContain("secret");
  });
});
