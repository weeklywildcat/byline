import { describe, expect, it, vi } from "vitest";

import { createPlanningFetchers } from "../src/planning/planning-api";
import { normalizeStoryQuickView } from "../src/planning/quick-view-model";
import type { PlanningStory } from "../src/planning/planning-model";

const story: PlanningStory = {
  id: 42,
  title: "Campus story",
  editUrl: "/wp-admin/post.php?post=42&action=edit",
  authors: [],
  writer: { id: 7, name: "Writer" },
  editor: { id: 8, name: "Editor" },
  workflow: { id: "editing", label: "Editing", group: "main", selectable: true },
  wordpressState: { id: "draft", label: "Draft", isPublished: false, isScheduled: false },
  deadline: "2026-09-01",
  plannedPublication: null,
  modifiedAt: null,
  visual: { type: "photo", status: "uploaded" },
  openTaskCount: 2,
  coverage: [],
  featuredImage: null
};

describe("Story Quick View", () => {
  it("normalizes one aggregate response without exposing unbounded fields", () => {
    const normalized = normalizeStoryQuickView({
      statuses: [{ id: "editing", label: "Editing", group: "main", selectable: true }],
      editors: [{ id: 8, name: "Editor" }],
      capabilities: { changeStatus: true, assign: true },
      tasks: {
        tasks: [{ id: 9, title: "Confirm photo credit", state: "open", priority: "high", assignee: { id: 8, name: "Editor" } }],
        capabilities: { canEditLinkedStory: true, canAssign: true, canDelete: true }
      },
      media: {
        type: "photo",
        status: "uploaded",
        attachmentIds: [12],
        attachments: [{ id: 12, title: "Campus", isImage: true, checks: { alt: true, credit: false, rights: true } }]
      },
      readiness: { passed: 3, warnings: 1, errors: 0, total: 4, ready: true },
      discord: { configured: true, threadUrl: "https://discord.com/channels/1/2" },
      activity: { activity: [{ id: 1, summary: "Media request changed", occurredAt: "2026-08-29T12:00:00Z", actor: { id: 8, name: "Editor" } }] }
    }, story);

    expect(normalized.storyId).toBe(42);
    expect(normalized.tasks[0]).toMatchObject({ title: "Confirm photo credit", priority: "high" });
    expect(normalized.media.attachments[0].checks?.credit).toBe(false);
    expect(normalized.readiness).toMatchObject({ passed: 3, warnings: 1 });
    expect(normalized.discord.threadUrl).toBe("https://discord.com/channels/1/2");
    expect(normalized.activity[0].summary).toBe("Media request changed");
  });

  it("loads quick view lazily and keeps mutations on protected routes", async () => {
    const request = vi.fn().mockResolvedValue({});
    const fetchers = createPlanningFetchers(request);

    await fetchers.getStoryQuickView?.(42);
    await fetchers.updateStory?.(42, { deadline: "2026-09-01" });
    await fetchers.updateTask?.(9, { state: "completed" });

    expect(request.mock.calls.map(([options]) => options)).toEqual([
      { path: "/byline/v1/editorial/stories/42/quick-view" },
      { path: "/byline/v1/editorial/stories/42", method: "POST", data: { deadline: "2026-09-01" } },
      { path: "/byline/v1/editorial/tasks/9", method: "POST", data: { state: "completed" } }
    ]);
  });
});
