import { describe, expect, it } from "vitest";
import {
  MORE_PACKAGE_TYPE,
  NEWSLETTER_PACKAGE_TYPE,
  type BylineDesignDocumentV2
} from "@byline/design";
import { WEEKLY_WILDCAT_PUBLICATION } from "@/lib/publication";
import { getWeeklyWildcatCompatibilityDesign } from "@/lib/homepage-design";
import { getHomepageDataRequirements, resolveHomepageDocument } from "@/lib/homepage-resolution";
import { toCalendarEntries } from "@/lib/homepage-packages";
import type { ResolvedHomepagePackage } from "@byline/ui";
import { game, post } from "./fixtures/sports-fixture";

const PACKAGE_ORDER = [
  "lead-package",
  "brief-package",
  "in-focus-package",
  "special-coverage-package",
  "opinion-package",
  "sports-package",
  "more-package",
  "newsletter-package"
] as const;

function fixturePosts() {
  return [
    post(1, "sports", { athlete: true }),
    post(2, "news", { sticky: true }),
    post(3, "features", { image: true }),
    post(4, "news"),
    post(5, "opinion"),
    post(6, "opinion"),
    post(7, "opinion"),
    post(8, "sports"),
    post(9, "sports"),
    post(10, "sports"),
    post(11, "news"),
    post(12, "features"),
    post(13, "culture"),
    post(14, "news"),
    post(15, "features"),
    post(16, "culture"),
    post(17, "news"),
    post(18, "opinion"),
    post(19, "sports"),
    post(20, "news"),
    post(21, "culture"),
    post(22, "features"),
    post(23, "news")
  ];
}

function resolve(document = getWeeklyWildcatCompatibilityDesign("weekly-wildcat")) {
  return resolveHomepageDocument({
    document,
    posts: fixturePosts(),
    publication: WEEKLY_WILDCAT_PUBLICATION,
    sportsSchedule: { recentScores: [], upcomingGames: [], schoolEvents: [] }
  });
}

function storyIds(packages: ResolvedHomepagePackage[]) {
  const ids: number[] = [];

  for (const entry of packages) {
    switch (entry.type) {
      case "lead-package":
        if (entry.package.lead) ids.push(entry.package.lead.id);
        ids.push(...entry.package.latest.stories.map((story) => story.id));
        break;
      case "brief-package":
        if (entry.package.lead) ids.push(entry.package.lead.id);
        ids.push(...entry.package.rail.map((story) => story.id));
        break;
      case "in-focus-package":
        if (entry.package.story) ids.push(entry.package.story.id);
        break;
      case "special-coverage-package":
        ids.push(...entry.package.stories.map((story) => story.id));
        break;
      case "opinion-package":
        if (entry.package.lead) ids.push(entry.package.lead.id);
        ids.push(...entry.package.rail.map((story) => story.id));
        break;
      case "sports-package":
        if (entry.package.lead) ids.push(entry.package.lead.id);
        ids.push(...entry.package.rail.map((story) => story.id));
        if (entry.package.athleteSpotlight) ids.push(entry.package.athleteSpotlight.id);
        break;
      case "more-package":
        if (entry.package.lead) ids.push(entry.package.lead.id);
        ids.push(...entry.package.rail.map((story) => story.id));
        break;
      case "newsletter-package":
        break;
    }
  }

  return ids;
}

describe("homepage package orchestration", () => {
  it("resolves the Weekly Wildcat compatibility document in its declared order", () => {
    const resolved = resolve();

    expect(resolved.packages.map((entry) => entry.type)).toEqual(PACKAGE_ORDER);

    const ids = storyIds(resolved.packages);
    expect(new Set(ids).size).toBe(ids.length);
    expect(resolved.packages[0]).toMatchObject({ type: "lead-package", package: { lead: { id: 2 } } });
    expect(resolved.packages[4]).toMatchObject({ type: "opinion-package", package: { lead: { id: 5 } } });
    expect(resolved.packages[5]).toMatchObject({ type: "sports-package", package: { lead: { id: 8 }, athleteSpotlight: { id: 1 } } });
  });

  it("reserves a late manual pin before automatic compatibility selection", () => {
    const base = getWeeklyWildcatCompatibilityDesign("weekly-wildcat");
    const document: BylineDesignDocumentV2 = {
      ...base,
      packages: base.packages.map((entry) => entry.id === "home-more"
        ? { ...entry, props: { ...entry.props, source: { type: "manual", storyIds: [2] } } }
        : entry)
    };
    const resolved = resolve(document);
    const ids = storyIds(resolved.packages);
    const more = resolved.packages.find((entry) => entry.type === MORE_PACKAGE_TYPE);

    expect(more).toMatchObject({ package: { lead: { id: 2 } } });
    expect(ids.filter((id) => id === 2)).toHaveLength(1);
    expect(resolved.packages[0]).toMatchObject({ type: "lead-package", package: { lead: { id: 3 } } });
  });

  it("follows a reordered or reduced document without inventing packages", () => {
    const base = getWeeklyWildcatCompatibilityDesign("weekly-wildcat");
    const document: BylineDesignDocumentV2 = {
      ...base,
      packages: [
        base.packages[4],
        base.packages[1],
        base.packages[6],
        base.packages[5],
        base.packages[7]
      ]
    };
    const resolved = resolve(document);

    expect(resolved.packages.map((entry) => entry.type)).toEqual([
      "opinion-package",
      "brief-package",
      MORE_PACKAGE_TYPE,
      "sports-package",
      NEWSLETTER_PACKAGE_TYPE
    ]);
  });

  it("plans enough upcoming games for a ten-item calendar with no school events", () => {
    const document: BylineDesignDocumentV2 = {
      schemaVersion: 2,
      template: "home",
      theme: "weekly-wildcat",
      packages: [{
        id: "home-lead",
        type: "lead-package",
        props: {
          mode: "content",
          lead: { source: { type: "latest" } },
          latest: { heading: "The Latest", source: { type: "latest" }, limit: 0, showBylines: true },
          utility: { poll: false, calendar: true, calendarLimit: 10 },
          presentation: { showDeck: true, opinionTreatment: "auto" }
        }
      }]
    };
    const requirements = getHomepageDataRequirements(document);
    const upcomingGames = Array.from({ length: 10 }, (_, index) => {
      const startDate = new Date(Date.now() + (index + 1) * 60 * 60 * 1000).toISOString();
      const fixture = game(1000 + index, "soccer", { upcoming: true });

      return {
        ...fixture,
        startDate,
        display: { ...fixture.display, date: `Day ${index + 1}` }
      };
    });

    expect(requirements.upcomingGames).toBe(10);
    expect(requirements.schoolEvents).toBe(12);
    expect(toCalendarEntries([], upcomingGames, 10)).toHaveLength(10);
  });
});
