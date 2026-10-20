import { describe, expect, it } from "vitest";
import type { EditorialTask } from "../editorial/editorial-model";
import type { PlanningStory } from "../planning/planning-model";
import { activeStory, dayDistance, homeAgenda, myActiveStories, myOpenTasks, myStory, reviewStories, siteDay, waitingForMe, type HomeBootstrap } from "./newsroom-model";
import { replaceHomeTask } from "./home-query";

const now = new Date("2026-10-20T12:00:00Z");
const timezone = "America/New_York";
function story(patch: Partial<PlanningStory> = {}): PlanningStory {
  return { id: 1, title: "Canteen", editUrl: "post.php?post=1&action=edit", authors: [{ id: 7, name: "Caroline", kind: "user" }], writer: { id: 8, name: "Gibson" }, editor: null, workflow: { id: "reporting", label: "Reporting", group: "main", selectable: true }, wordpressState: { id: "draft", label: "Draft", isPublished: false, isScheduled: false }, deadline: "2026-10-21", plannedPublication: null, modifiedAt: "2026-10-20T11:00:00Z", visual: { type: "none", status: "needed" }, openTaskCount: 2, coverage: [], featuredImage: null, ...patch };
}
function task(id: number, dueAt: string | null, patch: Partial<EditorialTask> = {}): EditorialTask {
  return { id, title: `Task ${id}`, state: "open", assigneeId: 7, dueAt, priority: "normal", storyId: 1, order: id, ...patch };
}
function bootstrap(patch: Partial<HomeBootstrap> = {}): HomeBootstrap {
  return { currentUser: { id: 7, name: "Caroline" }, timezone, now: now.toISOString(), capabilities: { review: false, createStory: true, uploadMedia: true }, stories: [story()], tasks: [], visualWork: [], activity: [], errors: {}, limits: { stories: 320, tasks: 200, visualWork: 100, activity: 10 }, ...patch };
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
  it("combines commitments in chronological order and deduplicates identical publication instants", () => {
    const data = bootstrap({ stories: [story({ deadline: "2026-10-20", plannedPublication: "2026-10-22T10:00:00-04:00", wordpressState: { id: "future", label: "Scheduled", isPublished: false, isScheduled: true, scheduledAt: "2026-10-22T14:00:00Z" } })], tasks: [task(1, "2026-10-21T12:00:00Z")], visualWork: [{ id: 1, story: { id: 1, title: "Canteen", editUrl: "" }, assignee: { id: 7, name: "Caroline" }, dueAt: "2026-10-20T21:00:00Z", status: "assigned", type: "photo", notes: "", attachmentIds: [] }] });
    expect(homeAgenda(data, now).map((e) => e.id)).toEqual(["deadline-1", "media-1", "task-1", "scheduled-1"]);
    expect(homeAgenda(bootstrap({ stories: [story({ authors: [], writer: { id: 9, name: "Other" } })] }), now)).toEqual([]);
  });
  it("summarizes overdue tasks instead of duplicating the work list, and gates review", () => {
    const data = bootstrap({ tasks: [task(1, "2026-10-19T12:00:00Z"), task(2, "2026-10-18T12:00:00Z")], stories: [story({ workflow: { id: "ready", label: "Ready for Review", group: "main", selectable: true } })] });
    expect(waitingForMe(data, now)).toEqual([expect.objectContaining({ id: "overdue-work", title: "2 overdue tasks" })]);
    expect(reviewStories(data)).toEqual([]);
    expect(reviewStories({ ...data, capabilities: { ...data.capabilities, review: true } })).toHaveLength(1);
  });
});
