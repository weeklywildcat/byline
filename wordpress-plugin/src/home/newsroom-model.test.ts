import { describe, expect, it } from "vitest";
import type { EditorialTask } from "@byline/newsroom-screens/editorial/editorial-model";
import type { PlanningStory } from "@byline/newsroom-screens/planning/planning-model";
import type { HomeAppointment } from "@byline/newsroom-screens/workspace/workspace-types";
import { activeStory, addDays, dayDistance, homeAgenda, homeScope, isoWeek, weekAgenda, myActiveStories, myOpenTasks, myStory, myWork, reviewStories, siteDay, waitingForMe, workspaceUrlFor, type HomeBootstrap, type HomeVisualWork } from "@byline/newsroom-screens/home/newsroom-model";
import { replaceHomeTask } from "@byline/newsroom-screens/home/home-query";
import { budgetStories, deskStages, localHomePreferences, normalizeHomePreferences, publishDate, scopedStories } from "@byline/newsroom-screens/home/desk-model";
import { storiesHref, storiesRouteFilters } from "@byline/newsroom-screens/planning/planning-api";
import { builtInStoryView, storyViewCount } from "@byline/newsroom-screens/planning/story-views";

const now = new Date("2026-10-20T12:00:00Z");
const timezone = "America/New_York";
function story(patch: Partial<PlanningStory> = {}): PlanningStory {
  return { id: 1, title: "Canteen", editUrl: "post.php?post=1&action=edit", authors: [{ id: 7, name: "Caroline", kind: "user" }], writer: { id: 8, name: "Gibson" }, editor: null, workflow: { id: "reporting", label: "Reporting", group: "main", selectable: true }, publicationState: { id: "draft", label: "Draft", isPublished: false, isScheduled: false }, deadline: "2026-10-21", plannedPublication: null, modifiedAt: "2026-10-20T11:00:00Z", visual: { type: "none", status: "needed" }, openTaskCount: 2, featuredImage: null, ...patch };
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
    const published = story({ id: 5, publicationState: { id: "published", label: "Published", isPublished: true, isScheduled: false } });
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
    const data = bootstrap({ stories: [story({ deadline: "2026-10-20", plannedPublication: "2026-10-22T10:00:00-04:00", publicationState: { id: "scheduled", label: "Scheduled", isPublished: false, isScheduled: true, scheduledAt: "2026-10-22T14:00:00Z" } })], tasks: [task(1, "2026-10-21T12:00:00Z")], visualWork: [visual()] });
    expect(homeAgenda(data, now).map((e) => e.id)).toEqual(["deadline-1", "scheduled-1"]);
    expect(homeAgenda(data, now).some((event) => event.id.startsWith("task-") || event.id.startsWith("media-"))).toBe(false);
    expect(homeAgenda(bootstrap({ stories: [story({ authors: [], writer: { id: 9, name: "Other" } })] }), now)).toEqual([]);
  });
  it("keeps overdue tasks out of duplicate attention signals and gates review", () => {
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

describe("appointments in Coming Up and My Work attention", () => {
  it("shows a confirmed exact appointment with its real time, and never a target window", () => {
    const data = bootstrap({ stories: [story({ deadline: null })], appointments: [appointment(), appointment({ id: "t1", status: "tentative", startAt: "2026-10-22T14:00:00Z" }), windowAppointment({ status: "confirmed" }), appointment({ id: "u1", scheduleMode: "unscheduled", startAt: null, status: "planned" })] });
    const events = homeAgenda(data, now);
    expect(events).toEqual([{ id: "appointment-a1", storyId: 1, title: "Interview Mrs. Hamby", detail: "Canteen could return", label: "Interview", date: "2026-10-27T14:15:00Z", day: "2026-10-27", category: "appointment" }]);
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
  it("turns an upcoming target window into a scheduling action, but not a far-future window or undated idea", () => {
    const near = bootstrap({ stories: [], appointments: [windowAppointment()] });
    expect(waitingForMe(near, now)).toEqual([{ id: "schedule-w1", storyId: 1, title: "Interview local reporter", detail: "Needs scheduling for next week", urgent: false, reason: "scheduling" }]);
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

const stage = (id: string, label: string) => ({ id, label, group: "main" as const, selectable: true });
const other = { id: 9, name: "Other" };
const scheduled = (at: string) => ({ id: "scheduled", label: "Scheduled", isPublished: false, isScheduled: true, scheduledAt: at });

describe("the week strip", () => {
  // `now` is Tuesday, October 20 in New York: the site week runs Sunday 18 to Saturday 24.
  it("buckets commitments by site day for Sunday to Saturday, including earlier this week", () => {
    const data = bootstrap({
      capabilities: { review: true, createStory: true, uploadMedia: true },
      stories: [
        story({ id: 1, deadline: "2026-10-19", plannedPublication: "2026-10-21" }),
        story({ id: 2, authors: [], writer: other, deadline: null, plannedPublication: null, publicationState: scheduled("2026-10-23T01:30:00Z") }),
        story({ id: 3, deadline: "2026-10-26" })
      ],
      appointments: [appointment({ startAt: "2026-10-18T15:00:00Z" }), appointment({ id: "p1", kind: "photo", startAt: "2026-10-24T15:00:00Z" })]
    });
    const week = weekAgenda(data, now, "newsroom");
    expect(week.start).toBe("2026-10-18");
    expect(week.end).toBe("2026-10-24");
    expect(week.days.map((day) => day.day)).toEqual(["2026-10-18", "2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23", "2026-10-24"]);
    const byDay = Object.fromEntries(week.days.map((day) => [day.day.slice(8), day.events.map((event) => `${event.category}:${event.id}`)]));
    expect(byDay).toEqual({ "18": ["appointment:appointment-a1"], "19": ["deadline:deadline-1"], "20": [], "21": ["publication:planned-1"], "22": ["publication:scheduled-2"], "23": [], "24": ["photo:appointment-p1"] });
    expect(week.days.find((day) => day.isToday)?.day).toBe("2026-10-20");
    expect(week.nextWeekCount).toBe(1);
  });
  it("marks weekdays from today on with nothing to publish, never weekends or past days", () => {
    const week = weekAgenda(bootstrap({ stories: [story({ plannedPublication: "2026-10-21" })] }), now, "mine");
    expect(week.days.filter((day) => day.nothingPlanned).map((day) => day.day)).toEqual(["2026-10-20", "2026-10-22", "2026-10-23"]);
    expect(week.days.find((day) => day.day === "2026-10-21")).toMatchObject({ toPublish: 1, nothingPlanned: false });
  });
  it("scopes newsroom stories to the reader in Mine, and only editors can choose Newsroom", () => {
    const data = bootstrap({ capabilities: { review: true, createStory: true, uploadMedia: true }, stories: [story({ authors: [], writer: other, plannedPublication: "2026-10-21" })] });
    expect(weekAgenda(data, now, "newsroom").days[3].toPublish).toBe(1);
    expect(weekAgenda(data, now, "mine").days[3].toPublish).toBe(0);
    expect(homeAgenda(data, now, undefined, "mine")).toEqual([]);
    expect(homeScope(null, true)).toBe("newsroom");
    expect(homeScope("mine", true)).toBe("mine");
    expect(homeScope("newsroom", false)).toBe("mine");
  });
  it("moves whole weeks and numbers them by ISO week", () => {
    expect(weekAgenda(bootstrap(), now, "mine", { offset: 1 }).start).toBe("2026-10-25");
    expect(weekAgenda(bootstrap(), now, "mine", { offset: -1 }).end).toBe("2026-10-17");
    expect(isoWeek("2026-11-08")).toBe(45);
    expect(isoWeek("2027-01-01")).toBe(53);
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
});

describe("the Desk and the Budget", () => {
  it("counts active stories by stage in workflow order and warns on stale Reporting and Editing", () => {
    const stories = [
      story({ id: 1, workflow: stage("editing", "Editing"), modifiedAt: "2026-10-14T12:00:00Z" }),
      story({ id: 2, workflow: stage("reporting", "Reporting"), modifiedAt: "2026-10-15T12:00:00Z" }),
      story({ id: 3, workflow: stage("reporting", "Reporting"), modifiedAt: "2026-10-12T12:00:00Z" }),
      story({ id: 4, workflow: stage("pitch", "Pitch"), modifiedAt: "2026-09-01T12:00:00Z" }),
      story({ id: 5, workflow: stage("dropped", "Dropped") })
    ];
    expect(deskStages(stories, timezone, now)).toEqual([
      { id: "pitch", label: "Pitch", count: 1, ageDays: 49, stale: false },
      { id: "reporting", label: "Reporting", count: 2, ageDays: 8, stale: true },
      { id: "editing", label: "Editing", count: 1, ageDays: 6, stale: true }
    ]);
    expect(deskStages([story({ workflow: stage("reporting", "Reporting"), modifiedAt: "2026-10-13T12:00:00Z" })], timezone, now)[0].stale).toBe(false);
  });
  it("lists this week's publications, the reader's stories and undated stories, scoped", () => {
    const data = bootstrap({
      capabilities: { review: true, createStory: true, uploadMedia: true },
      stories: [
        story({ id: 1, plannedPublication: "2026-10-23" }),
        story({ id: 2, authors: [], writer: other, plannedPublication: null, publicationState: scheduled("2026-10-21T14:00:00Z") }),
        story({ id: 3, authors: [], writer: other, plannedPublication: "2026-10-30" }),
        story({ id: 4, authors: [], writer: other, plannedPublication: null }),
        story({ id: 5, plannedPublication: null, deadline: "2026-10-19" })
      ]
    });
    const newsroom = budgetStories(data, "newsroom", now);
    expect(newsroom.week.map((s) => s.id)).toEqual([2, 1]);
    expect(newsroom.unscheduled.map((s) => s.id)).toEqual([5, 4]);
    expect(newsroom.mine.map((s) => s.id)).toEqual([5, 1]);
    const mine = budgetStories(data, "mine", now);
    expect(mine.week.map((s) => s.id)).toEqual([1]);
    expect(mine.unscheduled.map((s) => s.id)).toEqual([5]);
    expect(scopedStories(data, "mine").map((s) => s.id)).toEqual([1, 5]);
    expect(publishDate(data.stories[1])).toBe("2026-10-21T14:00:00Z");
  });
  it("normalizes and remembers the scope preference without trusting stored data", () => {
    expect(normalizeHomePreferences({ scope: "mine" })).toEqual({ scope: "mine" });
    expect(normalizeHomePreferences({ scope: "everyone" })).toEqual({ scope: null });
    expect(normalizeHomePreferences("mine")).toEqual({ scope: null });
    const values = new Map<string, string>();
    const local = localHomePreferences({ getItem: (key) => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); } });
    local.save!({ scope: "mine" });
    expect(normalizeHomePreferences(local.load!())).toEqual({ scope: "mine" });
    expect(localHomePreferences({ getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } }).load!()).toBeNull();
  });
});

describe("Stories links and view counts", () => {
  it("names filters in the Stories address and reads them back", () => {
    const href = storiesHref("/admin/stories", { workflow: "reporting", mine: true }, "http://newsroom.test/admin");
    expect(href).toBe("/admin/stories?workflow=reporting&mine=1");
    const wp = storiesHref("admin.php?page=byline-planning&tab=stories", { needsReview: true }, "http://site.test/wp-admin/admin.php?page=byline-planning&tab=today");
    expect(wp).toBe("/wp-admin/admin.php?page=byline-planning&tab=stories&needs_review=1");
    expect(storiesRouteFilters(new URL(`http://x${href}&collection=4`).searchParams)).toMatchObject({ workflow: "reporting", mine: true, collectionId: 4 });
    expect(storiesRouteFilters(new URLSearchParams("coverage=9&visual_status=needed"))).toMatchObject({ collectionId: 9, visualStatus: "needed" });
  });
  it("counts only active stories in a promoted view", () => {
    const stories = [
      story({ id: 1, workflow: stage("ready", "Ready for Review") }),
      story({ id: 2, editor: { id: 3, name: "Editor" } }),
      story({ id: 3, publicationState: { id: "published", label: "Published", isPublished: true, isScheduled: false } }),
      story({ id: 4, visual: { type: "photo", status: "needed" }, editor: { id: 3, name: "Editor" } })
    ];
    expect(storyViewCount(stories, builtInStoryView("review")!, 7, now)).toBe(1);
    expect(storyViewCount(stories, builtInStoryView("unassigned")!, 7, now)).toBe(1);
    expect(builtInStoryView("art-needed")?.label).toBe("Art needed");
  });
});
