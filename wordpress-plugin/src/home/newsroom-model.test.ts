import { describe, expect, it } from "vitest";
import type { EditorialTask } from "../editorial/editorial-model";
import type { PlanningStory } from "../planning/planning-model";
import type { HomeAppointment } from "../workspace/workspace-types";
import { activeStory, dayDistance, homeAgenda, myActiveStories, myOpenTasks, myStory, myWork, reviewStories, siteDay, waitingForMe, workspaceUrlFor, type HomeBootstrap, type HomeVisualWork } from "./newsroom-model";
import { replaceHomeTask } from "./home-query";

const now = new Date("2026-10-20T12:00:00Z");
const timezone = "America/New_York";
function story(patch: Partial<PlanningStory> = {}): PlanningStory {
  return { id: 1, title: "Canteen", editUrl: "post.php?post=1&action=edit", authors: [{ id: 7, name: "Caroline", kind: "user" }], writer: { id: 8, name: "Gibson" }, editor: null, workflow: { id: "reporting", label: "Reporting", group: "main", selectable: true }, wordpressState: { id: "draft", label: "Draft", isPublished: false, isScheduled: false }, deadline: "2026-10-21", plannedPublication: null, modifiedAt: "2026-10-20T11:00:00Z", visual: { type: "none", status: "needed" }, openTaskCount: 2, coverage: [], featuredImage: null, ...patch };
}
function task(id: number, dueAt: string | null, patch: Partial<EditorialTask> = {}): EditorialTask {
  return { id, title: `Task ${id}`, state: "open", assigneeId: 7, dueAt, priority: "normal", storyId: 1, order: id, ...patch };
}
function appointment(patch: Partial<HomeAppointment> = {}): HomeAppointment {
  return { id: "a1", title: "Interview Mrs. Hamby", kind: "interview", status: "confirmed", scheduleMode: "exact", windowStart: null, windowEnd: null, startAt: "2026-10-27T14:15:00Z", endAt: null, sourceId: null, sourceLabel: null, location: "", storyId: 1, storyTitle: "Canteen could return", ...patch };
}
const windowAppointment = (patch: Partial<HomeAppointment> = {}) => appointment({ id: "w1", title: "Interview local reporter", status: "planned", scheduleMode: "window", windowStart: "2026-10-26", windowEnd: "2026-10-30", startAt: null, ...patch });
function visual(patch: Partial<HomeVisualWork> = {}): HomeVisualWork {
  return { id: "m1", story: { id: 1, title: "Canteen", editUrl: "" }, title: "Cafeteria photos", type: "photo", status: "assigned", assignee: { id: 7, name: "Caroline" }, dueAt: "2026-10-20T21:00:00Z", notes: "", attachmentIds: [], ...patch };
}
function bootstrap(patch: Partial<HomeBootstrap> = {}): HomeBootstrap {
  return { currentUser: { id: 7, name: "Caroline" }, timezone, now: now.toISOString(), capabilities: { review: false, createStory: true, uploadMedia: true }, stories: [story()], tasks: [], visualWork: [], appointments: [], activity: [], errors: {}, limits: { stories: 320, tasks: 200, visualWork: 100, appointments: 100, activity: 10 }, ...patch };
}

describe("personal newsroom work", () => {
  it("includes only visible open work assigned to the authenticated user", () => {
    expect(myOpenTasks([task(1, null), task(2, null, { assigneeId: 8 }), task(3, null, { state: "completed" }), task(4, null, { assigneeId: undefined, assignee: { id: 7, name: "Caroline", kind: "user" } })], 7, timezone, now).map((t) => t.id)).toEqual([1, 4]);
  });
  it("sorts urgency before priority, then exact due date and stable order", () => {
    const tasks = [task(1, null, { priority: "urgent" }), task(2, "2026-11-01T12:00:00Z"), task(3, "2026-10-23T12:00:00Z"), task(4, "2026-10-21T12:00:00Z"), task(5, "2026-10-20T12:00:00Z", { priority: "high" }), task(6, "2026-10-19T12:00:00Z"), task(7, "2026-10-20T12:00:00Z", { priority: "urgent" })];
    expect(myOpenTasks(tasks, 7, timezone, now).map((t) => t.id)).toEqual([6, 7, 5, 4, 3, 2, 1]);
  });
  it("supports co-writers, editors and legacy primary authors without guest/user ID collisions", () => {
    expect(myStory(story(), 7)).toBe(true);
    expect(myStory(story({ authors: [] }), 8)).toBe(true);
    expect(myStory(story({ authors: [], editor: { id: 7, name: "Editor" } }), 7)).toBe(true);
    expect(myStory(story({ authors: [{ id: 7, name: "Guest", kind: "guest" }] }), 7)).toBe(false);
  });
  it("excludes published and dropped work and sorts active stories by deadline", () => {
    const dropped = story({ id: 4, workflow: { id: "dropped", label: "Dropped", group: "sidelined", selectable: true } });
    const published = story({ id: 5, wordpressState: { id: "publish", label: "Published", isPublished: true, isScheduled: false } });
    expect(activeStory(dropped)).toBe(false);
    expect(myActiveStories([story({ id: 2, deadline: null }), published, story({ id: 3, deadline: "2026-10-19" }), dropped, story()], 7, timezone, now).map((s) => s.id)).toEqual([3, 1, 2]);
  });
  it("completes and rolls back one task without replacing concurrent unrelated data", () => {
    const initial = bootstrap({ tasks: [task(1, null), task(2, null)] });
    const completed = replaceHomeTask(initial, { ...initial.tasks[0], state: "completed" })!;
    expect(myOpenTasks(completed.tasks, 7, timezone, now).map((t) => t.id)).toEqual([2]);
    expect(completed.stories[0].openTaskCount).toBe(1);
    const concurrent = replaceHomeTask(completed, { ...initial.tasks[1], state: "completed" })!;
    const rollback = replaceHomeTask(concurrent, initial.tasks[0])!;
    expect(rollback.tasks.map((t) => t.state)).toEqual(["open", "completed"]);
    expect(rollback.stories[0].openTaskCount).toBe(1);
  });
});

describe("site dates and role-relevant attention", () => {
  it("uses site days across UTC boundaries, DST, date-only deadlines and fixed offsets", () => {
    expect(siteDay("2026-10-21T02:00:00Z", timezone)).toBe("2026-10-20");
    expect(siteDay("2026-10-21", "Pacific/Honolulu")).toBe("2026-10-21");
    expect(dayDistance("2026-11-02", timezone, new Date("2026-11-01T04:30:00Z"))).toBe(1);
    expect(siteDay("2026-10-20T22:00:00Z", "+05:30")).toBe("2026-10-21");
  });
  it("keeps Coming Up focused on calendar commitments and deduplicates identical publication instants", () => {
    const data = bootstrap({ stories: [story({ deadline: "2026-10-20", plannedPublication: "2026-10-22T10:00:00-04:00", wordpressState: { id: "future", label: "Scheduled", isPublished: false, isScheduled: true, scheduledAt: "2026-10-22T14:00:00Z" } })], tasks: [task(1, "2026-10-21T12:00:00Z")], visualWork: [visual()] });
    expect(homeAgenda(data, now).map((e) => e.id)).toEqual(["deadline-1", "scheduled-1"]);
    expect(homeAgenda(data, now).some((event) => event.id.startsWith("task-") || event.id.startsWith("media-"))).toBe(false);
    expect(homeAgenda(bootstrap({ stories: [story({ authors: [], writer: { id: 9, name: "Other" } })] }), now)).toEqual([]);
  });
  it("leaves overdue tasks to Up Next instead of duplicating them, and gates review", () => {
    const data = bootstrap({ tasks: [task(1, "2026-10-19T12:00:00Z"), task(2, "2026-10-18T12:00:00Z")], stories: [story({ workflow: { id: "ready", label: "Ready for Review", group: "main", selectable: true } })] });
    expect(waitingForMe(data, now)).toEqual([]);
    expect(reviewStories(data)).toEqual([]);
    expect(reviewStories({ ...data, capabilities: { ...data.capabilities, review: true } })).toHaveLength(1);
  });
});

describe("unified My Work", () => {
  it("combines tasks, review, scheduling and assigned production into one urgency queue", () => {
    const ready = story({ workflow: { id: "ready", label: "Ready for Review", group: "main", selectable: true } });
    const data = bootstrap({
      capabilities: { review: true, createStory: true, uploadMedia: true },
      stories: [ready],
      tasks: [task(1, "2026-10-19T12:00:00Z")],
      appointments: [windowAppointment()],
      visualWork: [visual(), visual({ id: "other", title: "Someone else's photos", assignee: { id: 9, name: "Other" } })]
    });
    const items = myWork(data, now);
    expect(items.map((item) => item.id)).toEqual(["task-1", "review-1", "attention-schedule-w1", "media-1-m1"]);
    expect(items.map((item) => item.group)).toEqual(["attention", "attention", "attention", "today"]);
  });

  it("keeps other people's assigned production out while surfacing urgent unassigned production to editors", () => {
    const data = bootstrap({
      capabilities: { review: true, createStory: true, uploadMedia: true },
      stories: [story({ deadline: null })],
      visualWork: [
        visual({ id: "mine" }),
        visual({ id: "other", assignee: { id: 9, name: "Other" } }),
        visual({ id: "unassigned", status: "needed", assignee: null, dueAt: "2026-10-20T18:00:00Z" })
      ]
    });
    const ids = myWork(data, now).map((item) => item.id);
    expect(ids).toContain("media-1-mine");
    expect(ids).toContain("attention-unassigned-1-unassigned");
    expect(ids).not.toContain("media-1-other");
    expect(ids).not.toContain("media-1-unassigned");
  });

  it("does not duplicate a late story when review is the clearer action", () => {
    const data = bootstrap({
      capabilities: { review: true, createStory: true, uploadMedia: true },
      stories: [story({ deadline: "2026-10-19", workflow: { id: "ready", label: "Ready for Review", group: "main", selectable: true } })]
    });
    expect(myWork(data, now).map((item) => item.id)).toEqual(["review-1"]);
  });
});

describe("appointments in Coming Up and Waiting for Me", () => {
  it("shows a confirmed exact appointment with its real time, and never a target window", () => {
    const data = bootstrap({ stories: [story({ deadline: null })], appointments: [appointment(), appointment({ id: "t1", status: "tentative", startAt: "2026-10-22T14:00:00Z" }), windowAppointment({ status: "confirmed" }), appointment({ id: "u1", scheduleMode: "unscheduled", startAt: null, status: "planned" })] });
    const events = homeAgenda(data, now);
    expect(events).toEqual([{ id: "appointment-a1", storyId: 1, title: "Interview Mrs. Hamby", detail: "Canteen could return", label: "Interview", date: "2026-10-27T14:15:00Z", day: "2026-10-27" }]);
    expect(new Date(events[0].date).toISOString()).toBe("2026-10-27T14:15:00.000Z");
  });
  it("puts an appointment on its site day even when the UTC day is the next one", () => {
    const late = appointment({ startAt: "2026-10-21T02:30:00Z" });
    expect(homeAgenda(bootstrap({ stories: [], appointments: [late] }), now)[0]).toMatchObject({ day: "2026-10-20", date: "2026-10-21T02:30:00Z" });
    expect(homeAgenda(bootstrap({ stories: [], appointments: [late], timezone: "Pacific/Auckland" }), now)[0].day).toBe("2026-10-21");
  });
  it("keeps appointments beyond two weeks and in the past out of Coming Up", () => {
    expect(homeAgenda(bootstrap({ stories: [], appointments: [appointment({ startAt: "2026-11-20T15:00:00Z" }), appointment({ id: "p1", startAt: "2026-10-19T15:00:00Z" })] }), now)).toEqual([]);
  });
  it("lists an upcoming target window in Waiting for Me, but not a far-future window or an undated idea", () => {
    const near = bootstrap({ stories: [], appointments: [windowAppointment()] });
    expect(waitingForMe(near, now)).toEqual([{ id: "schedule-w1", storyId: 1, title: "Interview local reporter", detail: "Needs scheduling for next week", urgent: false }]);
    const far = bootstrap({ stories: [], appointments: [windowAppointment({ windowStart: "2026-12-07", windowEnd: "2026-12-11" }), appointment({ id: "u1", scheduleMode: "unscheduled", startAt: null, status: "planned" }), appointment()] });
    expect(waitingForMe(far, now)).toEqual([]);
    expect(homeAgenda(near, now).length).toBe(0);
  });
  it("keeps late stories first and bounded when scheduling items coexist", () => {
    const stories = [1, 2, 3].map((id) => story({ id, title: `Late ${id}`, deadline: "2026-10-18" }));
    const data = bootstrap({ stories, tasks: [task(1, "2026-10-19T12:00:00Z")], appointments: [windowAppointment({ id: "w1", windowStart: "2026-10-20", windowEnd: "2026-10-20" }), windowAppointment({ id: "w2", windowStart: "2026-10-26" }), windowAppointment({ id: "w3", windowStart: "2026-10-27" })], visualWork: [visual()] });
    const items = waitingForMe(data, now);
    expect(items).toHaveLength(4);
    expect(items.map((i) => i.id)).toEqual(["late-story-1", "late-story-2", "schedule-w1", "schedule-w2"]);
    const calm = waitingForMe(bootstrap({ tasks: [task(1, "2026-10-19T12:00:00Z")], stories: [story()], appointments: [windowAppointment()] }), now);
    expect(calm.map((i) => i.id)).toEqual(["schedule-w1"]);
  });
});

describe("Story Workspace navigation", () => {
  it("derives the workspace URL from the Stories URL without string slicing", () => {
    const url = new URL(workspaceUrlFor("http://site.test/wp-admin/admin.php?page=byline-planning&tab=stories", 42));
    expect(url.pathname).toBe("/wp-admin/admin.php");
    expect(Object.fromEntries(url.searchParams)).toEqual({ page: "byline-planning", story: "42" });
    expect(new URL(workspaceUrlFor("/wp-admin/admin.php?tab=stories&page=byline-planning", 7, "http://site.test/wp-admin/admin.php")).search).toBe("?page=byline-planning&story=7");
  });
});
