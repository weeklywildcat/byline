import { describe, expect, it } from "vitest";
import { getWeeklyWildcatCompatibilityDesign, SPECIAL_COVERAGE_PACKAGE_TYPE } from "@byline/design";
import {
  __setPreviewDataForTests,
  setStudioPreviewDocument,
  setStudioPreviewOptions,
  snapshotFor,
  toPreviewData,
  type PreviewPost
} from "../src/studio-preview-model";

// The shell's own source contracts live in apps/web/tests/studio-shell-contract.test.ts,
// which already has the file-reading harness. This file exercises the running
// preview model.

function previewPost(id: number, category: string, tags: string[] = [], sticky = false): PreviewPost {
  return {
    id,
    title: { rendered: `Story ${id}` },
    excerpt: { rendered: `<p>Deck ${id}</p>` },
    date: `2026-08-${String(id).padStart(2, "0")}T12:00:00`,
    link: `https://example.test/story-${id}/`,
    sticky,
    categories: [id],
    tags: [],
    author: 1,
    _embedded: {
      "wp:featuredmedia": [],
      "wp:term": [
        [{ id, taxonomy: "category", name: category, slug: category }],
        tags.map((slug, index) => ({ id: id * 100 + index, taxonomy: "post_tag", name: slug, slug }))
      ]
    }
  };
}

const publication = {
  shortName: "Weekly Wildcat",
  name: "The Weekly Wildcat",
  organizationName: "North Springs High School",
  contactHref: "/contact/",
  social: [],
  features: { polls: true, events: true, sports: true, newsletter: true },
  calendarHeading: "At NSHS"
};

describe("Studio resolves one document, not one homepage per package", () => {
  it("gives every package a slice of a single de-duplicated resolution", () => {
    __setPreviewDataForTests(
      toPreviewData({
        posts: [
          previewPost(1, "news", [], true),
          previewPost(2, "features"),
          previewPost(3, "opinion"),
          previewPost(4, "opinion"),
          previewPost(5, "opinion"),
          previewPost(6, "sports"),
          previewPost(7, "news"),
          previewPost(8, "culture"),
          previewPost(9, "news"),
          previewPost(10, "features")
        ]
      })
    );
    setStudioPreviewDocument(getWeeklyWildcatCompatibilityDesign("weekly-wildcat"), publication);

    const ids = ["home-lead", "home-brief", "home-in-focus", "home-opinion", "home-sports", "home-more"].flatMap(
      (packageId) => {
        const entry = snapshotFor(packageId).entry;

        if (!entry) return [];
        if (entry.type === "lead-package") {
          return [entry.package.lead?.id, ...entry.package.latest.stories.map((story) => story.id)];
        }
        if (entry.type === "in-focus-package") return [entry.package.story?.id];
        if (entry.type === "special-coverage-package") return entry.package.stories.map((story) => story.id);
        if ("rail" in entry.package) return [entry.package.lead?.id, ...entry.package.rail.map((story) => story.id)];

        return [];
      }
    ).filter((id): id is number => typeof id === "number");

    expect(ids.length).toBeGreaterThan(5);
    expect(ids.filter((id, index) => ids.indexOf(id) !== index)).toEqual([]);
  });

  it("resolves an empty Special Coverage package as invisible without deleting it", () => {
    const entry = snapshotFor("home-special-coverage").entry;

    expect(entry?.type).toBe(SPECIAL_COVERAGE_PACKAGE_TYPE);
    expect(entry?.type === SPECIAL_COVERAGE_PACKAGE_TYPE && entry.package.stories).toEqual([]);
  });

  it("lets the editor switch the inactive-package markers off entirely", () => {
    setStudioPreviewOptions({ showHiddenPackages: false });
    expect(snapshotFor("home-special-coverage").showHiddenPackages).toBe(false);

    setStudioPreviewOptions({ showHiddenPackages: true });
    expect(snapshotFor("home-special-coverage").showHiddenPackages).toBe(true);
  });

  it("reports nothing for a package id the document does not contain", () => {
    expect(snapshotFor("not-a-package").entry).toBeNull();
  });
});
