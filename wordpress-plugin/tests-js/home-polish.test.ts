import { describe, expect, it } from "vitest";
import { mediaAssignmentTitle, waitingForMe, type HomeBootstrap, type HomeVisualWork } from "../src/home/newsroom-model";
import type { PlanningStory } from "../src/planning/planning-model";

const currentUser = { id: 1, name: "Gibson Bell" };

function story(patch: Partial<PlanningStory> = {}): PlanningStory {
  return {
    id: 10,
    title: "Canteen",
    editUrl: "/wp-admin/post.php?post=10&action=edit",
    previewUrl: "/?p=10&preview=true",
    authors: [currentUser],
    writer: currentUser,
    editor: null,
    workflow: { id: "reporting", label: "Reporting", group: "main", selectable: true },
    wordpressState: { id: "draft", label: "Draft", isPublished: false, isScheduled: false },
    deadline: null,
    plannedPublication: null,
    modifiedAt: "2026-10-20T12:00:00Z",
    visual: { type: "none", status: "needed" },
    openTaskCount: 0,
    coverage: [],
    featuredImage: null,
    ...patch
  };
}

function home(patch: Partial<HomeBootstrap> = {}): HomeBootstrap {
  return {
    currentUser,
    timezone: "America/New_York",
    now: "2026-10-20T12:00:00Z",
    capabilities: { review: false, createStory: true, uploadMedia: true },
    stories: [story()],
    tasks: [],
    visualWork: [],
    appointments: [],
    activity: [],
    errors: {},
    limits: { stories: 50, tasks: 50, visualWork: 50, appointments: 50, activity: 50 },
    ...patch
  };
}

describe("Home dashboard attention", () => {
  it("does not duplicate an overdue Up Next task in Waiting for Me", () => {
    const items = waitingForMe(home({
      tasks: [{
        id: 4,
        title: "Get a photo",
        state: "open",
        priority: "high",
        assigneeId: 1,
        dueAt: "2026-10-19T16:00:00Z",
        order: 0
      }]
    }), new Date("2026-10-20T12:00:00Z"));

    expect(items).toEqual([]);
  });

  it("still surfaces decision work such as an assigned production item", () => {
    const visual: HomeVisualWork = {
      id: "m1",
      story: { id: 10, title: "Canteen", editUrl: "/wp-admin/post.php?post=10&action=edit" },
      title: "Visual request",
      type: "photo",
      status: "assigned",
      assignee: currentUser,
      dueAt: "2026-10-21T18:00:00Z",
      notes: "",
      attachmentIds: []
    };
    const items = waitingForMe(home({ visualWork: [visual] }), new Date("2026-10-20T12:00:00Z"));

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ title: "Photo assignment", detail: "Canteen · waiting to be started" });
  });
});

describe("Home media assignment titles", () => {
  it("replaces legacy generic request labels with useful type/status copy", () => {
    expect(mediaAssignmentTitle({ title: "Visual request", type: "photo", status: "needed" })).toBe("Photo needed");
    expect(mediaAssignmentTitle({ title: "Photo request", type: "photo", status: "assigned" })).toBe("Photo assignment");
    expect(mediaAssignmentTitle({ title: "", type: "graphic", status: "needed" })).toBe("Graphic needed");
  });

  it("preserves a real custom assignment title", () => {
    expect(mediaAssignmentTitle({ title: "Cafeteria lunch photos", type: "photo", status: "assigned" })).toBe("Cafeteria lunch photos");
  });
});
