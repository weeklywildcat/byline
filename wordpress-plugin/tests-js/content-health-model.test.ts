import { describe, expect, it, vi } from "vitest";
import {
  groupHealthIssues,
  groupHealthStories,
} from "../src/planning/content-health-model";
import {
  createPlanningFetchers,
  normalizeContentHealthResponse,
  type PlanningRequestOptions,
} from "../src/planning/planning-api";
import {
  PLANNING_TABS,
  legacyHashDestination,
  normalizeAdminTab,
} from "../src/admin-routing";
import type { ContentHealthIssue } from "../src/planning/planning-model";
const issue = (
  id: string,
  storyId: number,
  type = "broken-link",
): ContentHealthIssue => ({
  id,
  type,
  checkId: type,
  severity: "error",
  category: "links",
  state: "new",
  problem: "This link could not be reached.",
  data: { url: `https://example.org/${id}` },
  story: {
    id: storyId,
    title: `Story ${storyId}`,
    editUrl: `post.php?post=${storyId}&action=edit`,
  },
});
describe("published content triage", () => {
  it("groups different broken URLs under one stable check while retaining occurrences", () => {
    const groups = groupHealthIssues([
      issue("1-url-a", 1),
      issue("1-url-b", 1),
      issue("2-url-c", 2),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      id: "broken-link",
      storyCount: 2,
      severity: "error",
    });
    expect(groups[0].occurrences.map((i) => i.data?.url)).toHaveLength(3);
  });
  it("aggregates stories, worst severity and categories independently of check identity", () => {
    const groups = groupHealthStories([
      issue("a", 1),
      {
        ...issue("b", 1, "image-credit"),
        severity: "warning",
        category: "images-accessibility",
      },
      issue("c", 2),
    ]);
    expect(groups[0]).toMatchObject({
      id: 1,
      severity: "error",
      categories: ["links", "images-accessibility"],
    });
    expect(groups[0].occurrences).toHaveLength(2);
  });
  it("normalizes ignored findings and honest scanner state separately from active findings", () => {
    const normalized = normalizeContentHealthResponse({
      issues: [issue("a", 1)],
      ignored: [
        {
          ...issue("b", 2),
          ignored: { by: 7, at: "2026-10-27T12:00:00Z", scope: "story" },
        },
      ],
      scanned: 32,
      eligible: 143,
      scan: { running: true, checked: 32, total: 143 },
      stale: true,
    });
    expect(normalized.issues).toHaveLength(1);
    expect(normalized.ignored?.[0].ignored).toMatchObject({
      by: 7,
      scope: "story",
    });
    expect(normalized).toMatchObject({
      scanned: 32,
      eligible: 143,
      stale: true,
      scan: { running: true, checked: 32 },
    });
  });
  it("uses explicit full-scan and numeric story-recheck routes", async () => {
    const request = vi.fn(async (_options: PlanningRequestOptions) => ({}));
    const api = createPlanningFetchers(request as never);
    await api.runContentHealthScan!();
    await api.recheckContentHealth!(42);
    await api.setContentHealthDisposition!({
      storyId: 42,
      checkId: "broken-link",
      restore: true,
    });
    expect(request.mock.calls.map(([options]) => options.path)).toEqual([
      "/byline/v1/admin/content-health/scan",
      "/byline/v1/admin/content-health/story/42/recheck",
      "/byline/v1/admin/content-health/disposition",
    ]);
    expect(request.mock.calls[2][0].data).toMatchObject({
      postId: 42,
      checkId: "broken-link",
      restore: true,
    });
  });
  it("retires newsroom destinations and redirects legacy bookmarks", () => {
    expect(PLANNING_TABS).toEqual([
      "today",
      "stories",
      "collections",
      "calendar",
      "media",
      "content-health",
      "feedback",
    ]);
    expect(normalizeAdminTab("byline-planning", "coverage")).toBe(
      "collections",
    );
    expect(normalizeAdminTab("byline-planning", "performance")).toBe("today");
    expect(legacyHashDestination("#/planning/coverage")).toMatchObject({
      tab: "collections",
    });
    expect(legacyHashDestination("#/planning/performance")).toMatchObject({
      tab: "today",
    });
  });
});
