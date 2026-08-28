import { describe, expect, it } from "vitest";
import { getWeeklyWildcatCompatibilityDesign } from "@byline/design";
import {
  __setPreviewDataForTests,
  setStudioPreviewDocument,
  setStudioPreviewLiveDocument,
  snapshotFor,
  toPreviewData,
  type PreviewPost
} from "../src/studio-preview-model";

const publication = {
  shortName: "Weekly Wildcat",
  name: "The Weekly Wildcat",
  organizationName: "North Springs High School",
  contactHref: "/contact/",
  social: [],
  features: { polls: true, events: true, sports: true, newsletter: true },
  calendarHeading: "At NSHS"
};

function post(id: number): PreviewPost {
  return {
    id,
    title: { rendered: `Story ${id}` },
    excerpt: { rendered: `Deck ${id}` },
    date: "2026-08-28T12:00:00Z",
    link: `/story-${id}/`,
    _embedded: { "wp:featuredmedia": [{ source_url: `/story-${id}.jpg` }] }
  };
}

describe("Studio scheduling/intelligence wiring", () => {
  it("publishes intelligence and a stable draft/live diff through preview snapshots", () => {
    const live = getWeeklyWildcatCompatibilityDesign("home");
    const draft = {
      ...live,
      packages: live.packages.map((entry) => entry.id === "home-brief"
        ? {
            ...entry,
            props: {
              ...entry.props,
              heading: "Updated brief"
            }
          }
        : entry)
    };

    __setPreviewDataForTests(toPreviewData({ posts: [post(1)] }));
    setStudioPreviewDocument(draft, publication);
    setStudioPreviewLiveDocument(live);

    const snapshot = snapshotFor("home-brief");
    expect(snapshot.intelligence).not.toBeNull();
    expect(snapshot.intelligence?.storyIds).toEqual(expect.any(Array));
    expect(snapshot.semanticDiff?.changed).toBe(true);
    expect(snapshot.semanticDiff?.operations.some((operation) => operation.type === "changed")).toBe(true);
  });
});
