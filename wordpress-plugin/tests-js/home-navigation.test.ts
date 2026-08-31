import { describe, expect, it } from "vitest";

import { createHomeFetchers, type HomeRequest } from "../src/home/home-api";
import {
  homeAttentionItems,
  homeComingUp,
  type HomeData
} from "../src/home/home-model";
import {
  preferredStoriesView,
  readStoriesViewPreference,
  storiesViewFromRoute,
  writeStoriesViewPreference
} from "../src/home/navigation-model";
import type { PlanningResponse, PlanningStory } from "../src/planning/planning-model";

const now = new Date(2026, 7, 28, 12);

function story(overrides: Partial<PlanningStory> = {}): PlanningStory {
  return {
    id: 1,
    title: "Story",
    editUrl: "post.php?post=1&action=edit",
    authors: [],
    writer: null,
    editor: null,
    workflow: { id: "writing", label: "Writing", group: "main", selectable: true },
    wordpressState: {
      id: "draft",
      label: "Draft",
      isPublished: false,
      isScheduled: false,
      scheduledAt: null,
      publishedAt: null
    },
    deadline: null,
    plannedPublication: null,
    modifiedAt: "2026-08-27T12:00:00Z",
    visual: { type: "none", status: "done" },
    openTaskCount: 0,
    coverage: [],
    featuredImage: null,
    ...overrides
  };
}

function resource<T>(data: T | null, available = true) {
  return { data, error: null, available };
}

function homeData(stories: PlanningStory[]): HomeData {
  const planning: PlanningResponse = {
    stories,
    workflowStatuses: [],
    capabilities: {
      canMoveStories: true,
      canAssign: true,
      canManageSavedViews: true,
      canManageMedia: true,
      canManageCoverage: true,
      canManageFeedback: true
    }
  };
  return {
    planning: resource(planning),
    health: resource({ checks: [] }),
    contentHealth: resource({ issues: [] }),
    feedback: resource({ feedback: [] }),
    deployment: resource({ configured: true, lastStatus: "HTTP 200", pending: false }),
    activity: resource({ activity: [] })
  };
}

describe("Byline Home model", () => {
  it("prioritizes story, health, and integration attention without inventing records", () => {
    const items = homeAttentionItems(homeData([
      story({ id: 10, title: "Overdue", deadline: "2026-08-27" }),
      story({ id: 11, title: "Ready", needsReview: true }),
      story({ id: 12, title: "Visual", visual: { type: "photo", status: "needed" } }),
      story({ id: 13, title: "Published", wordpressState: {
        id: "publish",
        label: "Published",
        isPublished: true,
        isScheduled: false,
        scheduledAt: null,
        publishedAt: "2026-08-28T09:00:00Z"
      }})
    ]), now);

    expect(items[0]).toMatchObject({ title: "Overdue", severity: "critical" });
    expect(items.some((item) => item.title === "Ready" && item.severity === "warning")).toBe(true);
    expect(items.some((item) => item.title === "Visual")).toBe(true);
    expect(items.some((item) => item.title === "Published")).toBe(false);

    const withServices = homeData([]);
    withServices.health.data = {
      checks: [{ id: "routes", label: "REST routes", status: "critical", summary: "A route is missing" }]
    };
    withServices.deployment.data = { configured: true, lastStatus: "Request failed", lifecycle: "failed", pending: false };
    expect(homeAttentionItems(withServices, now)).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: "health", severity: "critical" }),
      expect.objectContaining({ source: "deployment", severity: "critical" })
    ]));

    const stale = homeAttentionItems({
      ...homeData([]),
      deployment: resource({ configured: true, lastStatus: "HTTP 200", lifecycle: "unknown", expectedRevision: 8, publicRevision: 7, pending: false })
    }, now);
    expect(stale).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "deployment-unverified", severity: "warning" })
    ]));

    const unconfigured = homeAttentionItems({
      ...homeData([]),
      deployment: resource({ configured: false, lastStatus: "Not configured", lifecycle: "needs_configuration", expectedRevision: 8, publicRevision: 7, pending: false })
    }, now);
    expect(unconfigured).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "deployment-needs-configuration", severity: "critical" })
    ]));
  });

  it("counts only unpublished work in the coming-up metrics", () => {
    const metrics = homeComingUp([
      story({ id: 20, deadline: "2026-08-28", plannedPublication: "2026-08-30" }),
      story({ id: 21, wordpressState: {
        id: "future",
        label: "Scheduled",
        isPublished: false,
        isScheduled: true,
        scheduledAt: "2026-08-28T18:00:00Z",
        publishedAt: null
      } }),
      story({ id: 22, deadline: "2026-08-28", wordpressState: {
        id: "publish",
        label: "Published",
        isPublished: true,
        isScheduled: false,
        scheduledAt: null,
        publishedAt: "2026-08-27T18:00:00Z"
      } })
    ], now);

    expect(metrics).toEqual({ dueToday: 1, scheduledToday: 1, plannedSoon: 1 });
  });
});

describe("Byline Home permissions and navigation", () => {
  it("does not request integration data the current capability cannot read", () => {
    const paths: string[] = [];
    const request: HomeRequest = async ({ path }) => {
      paths.push(path);
      return {} as never;
    };
    const fetchers = createHomeFetchers(request, {
      planning: "/planning",
      health: "/health",
      contentHealth: "/content-health",
      feedback: "/feedback",
      deployment: "/deployment"
    }, {
      manage: false,
      editPosts: false,
      editOthersPosts: false,
      manageIntegrations: false
    });

    expect(fetchers.getPlanning).toBeUndefined();
    expect(fetchers.getHealth).toBeUndefined();
    expect(fetchers.getContentHealth).toBeUndefined();
    expect(fetchers.getFeedback).toBeUndefined();
    expect(fetchers.getDeployment).toBeUndefined();
    expect(fetchers.retryDeployment).toBeUndefined();
    expect(paths).toEqual([]);
  });

  it("keeps manager-only Home useful without requesting the edit-posts planning route", () => {
    const request: HomeRequest = async () => ({}) as never;
    const fetchers = createHomeFetchers(request, {
      planning: "/planning",
      contentHealth: "/content-health"
    }, {
      manage: true,
      editPosts: false
    });

    expect(fetchers.getPlanning).toBeUndefined();
    expect(fetchers.getContentHealth).toBeDefined();
  });

  it("exposes the existing deployment trigger only to integration managers", async () => {
    const requests: Array<{ path: string; method?: string }> = [];
    const request: HomeRequest = async (options) => {
      requests.push(options);
      return {} as never;
    };
    const fetchers = createHomeFetchers(request, { deployment: "/deployment" }, { manageIntegrations: true });

    expect(fetchers.retryDeployment).toBeDefined();
    await fetchers.retryDeployment?.();
    expect(requests).toContainEqual({ path: "/deployment/trigger", method: "POST" });
  });

  it("preserves a valid Stories view and ignores unsafe route/storage values", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) || null,
      setItem: (key: string, value: string) => { values.set(key, value); }
    } as unknown as Storage;

    expect(readStoriesViewPreference(storage)).toBeNull();
    expect(preferredStoriesView("list", storage)).toBe("list");
    writeStoriesViewPreference("calendar", storage);
    expect(preferredStoriesView("board", storage)).toBe("calendar");
    values.set("byline:stories-view", "script");
    expect(readStoriesViewPreference(storage)).toBeNull();
    expect(storiesViewFromRoute("board")).toBe("board");
    expect(storiesViewFromRoute("script")).toBeNull();
  });
});
