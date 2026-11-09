import { describe, expect, it } from "vitest";
import { getWeeklyWildcatHomeDesign } from "@/lib/homepage-design";
import { homepageSlots, validatePlacements } from "@byline/design";
import { resolveHomepageDocument } from "@/lib/homepage-resolution";
import { WEEKLY_WILDCAT_PUBLICATION } from "@/lib/publication";
import type { ResolvedHomepagePackage } from "@byline/ui";
import { post } from "./fixtures/sports-fixture";

/**
 * Front Page placements in the canonical resolver (docs/front-page.md):
 * editorial intent over the code-owned design. Pinned Stories go in their
 * exact slots, are reserved page-wide first, automatic selection fills the
 * rest, and the no-duplicate invariant holds. No placements: the homepage is
 * byte-for-byte what it was.
 */
const design = getWeeklyWildcatHomeDesign("weekly-wildcat");
const posts = () => [
  post(1, "sports", { athlete: true }), post(2, "news", { sticky: true }), post(3, "features", { image: true }), post(4, "news"),
  post(5, "opinion"), post(6, "opinion"), post(7, "opinion"), post(8, "sports"), post(9, "sports"), post(10, "sports"),
  post(11, "news"), post(12, "features"), post(13, "culture"), post(14, "news"), post(15, "features"), post(16, "culture"),
  post(17, "news"), post(18, "opinion"), post(19, "sports"), post(20, "news"), post(21, "culture"), post(22, "features"), post(23, "news")
];
const resolve = (placements?: Record<string, number>) => resolveHomepageDocument({
  document: design, posts: posts(), publication: WEEKLY_WILDCAT_PUBLICATION,
  sportsSchedule: { recentScores: [], upcomingGames: [], schoolEvents: [] }, ...(placements ? { placements } : {})
});

function allIds(packages: ResolvedHomepagePackage[]): number[] {
  return packages.flatMap((entry) => {
    switch (entry.type) {
      case "lead-package": return [entry.package.lead?.id, ...entry.package.latest.stories.map((story) => story.id)];
      case "brief-package": case "opinion-package": case "more-package": return [entry.package.lead?.id, ...entry.package.rail.map((story) => story.id)];
      case "sports-package": return [entry.package.lead?.id, ...entry.package.rail.map((story) => story.id), entry.package.athleteSpotlight ? 1 : undefined];
      case "in-focus-package": return [entry.package.story?.id];
      case "special-coverage-package": return entry.package.stories.map((story) => story.id);
      default: return [];
    }
  }).filter((id): id is number => typeof id === "number");
}

describe("the slot registry", () => {
  it("names the code-owned design's positions with stable ids", () => {
    const ids = homepageSlots(design).map((slot) => slot.id);
    expect(ids).toEqual(expect.arrayContaining(["lead.lead", "lead.latest.0", "lead.latest.3", "brief.lead", "brief.rail.0", "in-focus.story", "special-coverage.0", "opinion.lead", "opinion.rail.0", "sports.lead", "more.lead", "more.rail.2"]));
    expect(new Set(ids).size).toBe(ids.length);
    expect(homepageSlots(design).filter((slot) => slot.featured).map((slot) => slot.id)).toEqual(["lead.lead", "brief.lead", "in-focus.story", "special-coverage.0", "opinion.lead", "sports.lead"]);
  });

  it("reports removed slots, unavailable Stories and duplicates instead of applying them", () => {
    const { valid, issues } = validatePlacements(homepageSlots(design), { "lead.lead": 4, "gone.slot": 5, "in-focus.story": 999, "brief.lead": 4 }, (id) => id !== 999);
    expect([...valid]).toEqual([["lead.lead", 4]]);
    expect(issues.map((issue) => issue.reason).sort()).toEqual(["duplicate-story", "story-unavailable", "unknown-slot"]);
  });
});

describe("placements in the canonical resolver", () => {
  it("is exactly the automatic homepage with no placements", () => {
    expect(resolve({}).packages).toEqual(resolve().packages);
    expect(resolve().slots.every((slot) => !slot.pinned)).toBe(true);
    expect(resolve().placementIssues).toEqual([]);
  });

  it("puts a pinned Story in its exact slot, reserves it page-wide, and auto-fills the rest", () => {
    const auto = resolve();
    const autoLead = auto.slots.find((slot) => slot.id === "lead.lead")!.storyId;
    const pinned = resolve({ "lead.lead": 23, "in-focus.story": 12, "brief.rail.1": 21 });
    const slot = (id: string) => pinned.slots.find((entry) => entry.id === id)!;
    expect(slot("lead.lead")).toMatchObject({ storyId: 23, pinned: true });
    expect(slot("in-focus.story")).toMatchObject({ storyId: 12, pinned: true });
    expect(slot("brief.rail.1")).toMatchObject({ storyId: 21, pinned: true });
    // The automatic lead no longer leads, but it is not lost: it is placed elsewhere on the page.
    expect(autoLead).not.toBe(23);
    const ids = allIds(pinned.packages);
    expect(ids).toContain(autoLead);
    // The invariant: a Story appears at most once.
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.filter((id) => id === 23)).toHaveLength(1);
    expect(pinned.placementIssues).toEqual([]);
  });

  it("never silently substitutes for a pinned Story that is no longer available", () => {
    const result = resolve({ "lead.lead": 999 });
    expect(result.placementIssues).toEqual([{ slotId: "lead.lead", storyId: 999, reason: "story-unavailable" }]);
    // The public build falls back to automatic for that slot; activation refuses it (newsroom).
    expect(result.packages).toEqual(resolve().packages);
  });

  it("keeps an unknown slot from a removed design inspectable without crashing", () => {
    const result = resolve({ "retired.slot": 4 });
    expect(result.placementIssues).toEqual([{ slotId: "retired.slot", storyId: 4, reason: "unknown-slot" }]);
    expect(result.packages).toEqual(resolve().packages);
  });
});
