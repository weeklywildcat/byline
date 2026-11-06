import type { ScheduleResponse } from "@byline/newsroom-screens/workspace/workspace-types";
import { createCalendarWorkspace } from "@byline/newsroom-screens/calendar/calendar-workspace";
import { DEFAULT_CALENDAR_FILTERS } from "@byline/newsroom-screens/calendar/calendar-model";
import { createLocalReq, getPayload, type Endpoint, type Payload, type PayloadRequest } from "payload";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { newsroomEndpoints } from "../../src/newsroom/endpoints";
import { parseScheduleQuery, scheduleResponse, SCHEDULE_MAX_DAYS } from "../../src/newsroom/schedule";
import { screenContext } from "../../src/newsroom/screen-models";
import type { User } from "../../src/payload-types";
import { CALENDAR_PREFERENCES_KEY, payloadCalendarStorage } from "../../src/ui/calendar/calendar-preferences";
import type { PreferenceStore } from "../../src/ui/stories/saved-views";

/**
 * The Calendar's schedule feed (`GET /api/byline/schedule`): range rules, the
 * newsroom timezone, who sees which appointments, production and tasks, what
 * is never returned, and the Calendar's preferences in Payload Preferences.
 */
let payload: Payload;
const accounts: Record<string, User> = {};
const people: Record<string, number> = {};
const story: Record<string, number> = {};
const TZ = "America/New_York";
const NOW = new Date("2026-11-06T15:00:00Z");
const SECRET = "Source asked not to be named: private";

async function account(key: string, role: User["role"], person = true) {
  if (person) people[key] = (await payload.create({ collection: "people", data: { name: `${key} Writer`, slug: `schedule-${key}`, status: "active" } })).id;
  const user = await payload.create({ collection: "users", data: { email: `schedule-${key}@example.test`, password: `pw-${key}-123456`, name: `${key} Account`, role, enabled: true, linkedPerson: people[key] ?? null } });
  accounts[key] = { ...user, collection: "users" } as User;
}

const reqAs = (key: string, extra: Partial<PayloadRequest> = {}) => createLocalReq({ user: accounts[key], req: extra }, payload);
const feed = async (key: string, query = "from=2026-11-01&to=2026-11-30") => {
  const ctx = screenContext(await reqAs(key), TZ, NOW);
  return scheduleResponse(ctx, parseScheduleQuery(new URLSearchParams(query), "2026-11-06"));
};

async function call(key: string | null, query: string) {
  const endpoint = newsroomEndpoints.find((candidate) => candidate.method === "get" && candidate.path === "/byline/schedule")!;
  const req = key ? await reqAs(key) : await createLocalReq({}, payload);
  Object.assign(req, { searchParams: new URLSearchParams(query) });
  const response = (await endpoint.handler(req)) as Response;
  return { status: response.status, body: await response.json(), headers: response.headers };
}

const create = async (key: string, collection: "appointments" | "production-assignments" | "tasks", data: Record<string, unknown>) =>
  payload.create({ collection, data: data as never, req: await reqAs(key), overrideAccess: false });

const titles = (rows: Array<{ title: string }>) => rows.map((row) => row.title).sort();

/** Payload Preferences exactly as `usePreferences()` reaches them: the collection's own endpoints, as one signed-in account. */
function preferencesFor(key: string): PreferenceStore {
  const endpoints = payload.collections["payload-preferences"].config.endpoints as Endpoint[];
  const handler = (method: string) => endpoints.find((endpoint) => endpoint.method === method && endpoint.path === "/:key")!.handler;
  return {
    getPreference: async <T,>(preference: string) => {
      const req = await reqAs(key);
      Object.assign(req, { routeParams: { key: preference }, json: async () => ({}) });
      const body = await ((await handler("get")(req)) as Response).json();
      return (body.value ?? null) as T;
    },
    setPreference: async <T,>(preference: string, value: T) => {
      const req = await reqAs(key);
      Object.assign(req, { routeParams: { key: preference }, json: async () => ({ value }) });
      await handler("post")(req);
    }
  };
}

beforeAll(async () => {
  const url = new URL(process.env.DATABASE_URL!);
  url.pathname = `${url.pathname}_schedule`;
  process.env.DATABASE_URL = url.toString();
  const { default: config } = await import("../../src/payload.config");
  payload = await getPayload({ config });
  await account("editor", "editor");
  await account("alice", "staff");
  await account("photo", "staff", false);
  await account("bystander", "staff");

  story.budget = (await payload.create({ collection: "stories", draft: true, data: { headline: "Budget vote delayed", contributors: [people.alice] }, req: await reqAs("alice"), overrideAccess: false })).id;
  story.private = (await payload.create({ collection: "stories", draft: true, data: { headline: "Editor's private draft" }, req: await reqAs("editor"), overrideAccess: false })).id;
  // A published story with an unpublished (embargoed) rewrite only its managers may read.
  story.library = (await payload.create({ collection: "stories", data: { headline: "Library hours change", _status: "published" } as never, req: await reqAs("editor"), overrideAccess: false })).id;
  await payload.update({ collection: "stories", id: story.library, draft: true, data: { headline: "Library to close (embargoed)" }, req: await reqAs("editor"), overrideAccess: false });

  // Alice's story: exact appointments (one evening, one completed, one cancelled), a window and an undated one.
  await create("alice", "appointments", { story: story.budget, title: "Interview the mayor", kind: "interview", status: "confirmed", scheduleMode: "exact", startAt: "2026-11-10T15:15:00.000Z", endAt: "2026-11-10T15:45:00.000Z", assignees: [accounts.alice.id], location: "City Hall", notes: SECRET });
  // 03:30 UTC on Nov 10 is 10:30 PM on Nov 9 in New York.
  await create("alice", "appointments", { story: story.budget, title: "Late council session", kind: "event", status: "tentative", scheduleMode: "exact", startAt: "2026-11-10T03:30:00.000Z", assignees: [accounts.alice.id], notes: SECRET });
  await create("alice", "appointments", { story: story.budget, title: "Already done", kind: "interview", status: "completed", scheduleMode: "exact", startAt: "2026-11-03T14:00:00.000Z", assignees: [accounts.alice.id] });
  await create("alice", "appointments", { story: story.budget, title: "Called off", kind: "interview", status: "cancelled", scheduleMode: "exact", startAt: "2026-11-04T14:00:00.000Z", assignees: [accounts.alice.id] });
  await create("alice", "appointments", { story: story.budget, title: "Coach interview", kind: "interview", status: "planned", scheduleMode: "window", windowStart: "2026-11-23", windowEnd: "2026-11-25", assignees: [accounts.alice.id], notes: SECRET });
  await create("alice", "appointments", { story: story.budget, title: "Photo with principal", kind: "photo", status: "planned", scheduleMode: "unscheduled" });
  await create("alice", "appointments", { story: story.budget, title: "Finished window", kind: "interview", status: "completed", scheduleMode: "window", windowStart: "2026-11-02" });
  // DST: 2026-11-01 begins at 04:00 UTC (EDT) and 2026-11-02 at 05:00 UTC (EST).
  await create("alice", "appointments", { story: story.budget, title: "Just after midnight Nov 1", kind: "event", status: "confirmed", scheduleMode: "exact", startAt: "2026-11-01T04:30:00.000Z", assignees: [accounts.alice.id] });
  await create("alice", "appointments", { story: story.budget, title: "Just before midnight Oct 31", kind: "event", status: "confirmed", scheduleMode: "exact", startAt: "2026-11-01T03:30:00.000Z", endAt: "2026-11-01T03:55:00.000Z", assignees: [accounts.alice.id] });
  // Started before the range, still going in it.
  await create("alice", "appointments", { story: story.budget, title: "Overnight vigil", kind: "event", status: "confirmed", scheduleMode: "exact", startAt: "2026-10-31T23:00:00.000Z", endAt: "2026-11-01T12:00:00.000Z", assignees: [accounts.alice.id] });

  // Production: the photographer holds one on the editor's private story and one on the library story.
  await create("editor", "production-assignments", { story: story.private, title: "Private portraits", type: "photo", status: "assigned", deadline: "2026-11-12T17:00:00.000Z", assignees: [accounts.photo.id], notes: SECRET });
  await create("editor", "production-assignments", { story: story.library, title: "Library photos", type: "photo", status: "assigned", deadline: "2026-11-13T17:00:00.000Z", assignees: [accounts.photo.id] });
  await create("editor", "production-assignments", { story: story.budget, title: "Budget chart", type: "graphic", status: "in-progress", deadline: "2026-11-14T17:00:00.000Z" });
  await create("editor", "production-assignments", { story: story.budget, title: "Delivered chart", type: "graphic", status: "done", deadline: "2026-11-14T17:00:00.000Z" });
  // Boundaries: local midnight starting Nov 30 is in a range ending Nov 30; local midnight starting Dec 1 is not.
  await create("editor", "production-assignments", { story: story.budget, title: "Due at the start of Nov 30", type: "photo", status: "needed", deadline: "2026-11-30T05:00:00.000Z" });
  await create("editor", "production-assignments", { story: story.budget, title: "Due at the start of Dec 1", type: "photo", status: "needed", deadline: "2026-12-01T05:00:00.000Z" });

  await create("editor", "tasks", { story: story.budget, title: "Check the vote count", state: "open", due: "2026-11-11T17:00:00.000Z", assignees: [accounts.alice.id] });
  await create("editor", "tasks", { story: story.private, title: "Editor's own task", state: "open", due: "2026-11-11T17:00:00.000Z", assignees: [accounts.editor.id] });
  await create("editor", "tasks", { story: story.budget, title: "Finished task", state: "completed", due: "2026-11-11T17:00:00.000Z", assignees: [accounts.alice.id] });
}, 300_000);

afterAll(async () => {
  await payload?.db?.destroy?.();
});

describe("the schedule range", () => {
  it("rejects malformed dates and backwards ranges", async () => {
    expect((await call("alice", "from=2026-13-01&to=2026-12-01")).status).toBe(400);
    expect((await call("alice", "from=yesterday&to=2026-12-01")).status).toBe(400);
    expect((await call("alice", "from=2026-11-31&to=2026-12-01")).status).toBe(400);
    const backwards = await call("alice", "from=2026-12-01&to=2026-11-01");
    expect(backwards).toMatchObject({ status: 400, body: { message: "The date range cannot end before it starts." } });
  });

  it("allows up to four months, and no more", async () => {
    expect(SCHEDULE_MAX_DAYS).toBe(124);
    expect((await call("alice", "from=2026-11-01&to=2027-03-05")).status).toBe(200);
    expect((await call("alice", "from=2026-11-01&to=2027-03-06")).status).toBe(400);
  });

  it("defaults to a week back and two months ahead of the newsroom's today", () => {
    expect(parseScheduleQuery(new URLSearchParams(), "2026-11-06")).toEqual({ from: "2026-10-30", to: "2027-01-05", includeTasks: false, coverageId: null });
    expect(parseScheduleQuery(new URLSearchParams("tasks=1&coverage=4"), "2026-11-06")).toMatchObject({ includeTasks: true, coverageId: 4 });
  });

  it("is private, uncached and for signed-in accounts only", async () => {
    expect((await call(null, "from=2026-11-01&to=2026-11-30")).status).toBe(401);
    const ok = await call("alice", "from=2026-11-01&to=2026-11-30");
    expect(ok.status).toBe(200);
    expect(ok.headers.get("Cache-Control")).toBe("private, no-store");
    expect(ok.body).toMatchObject({ timezone: TZ, from: "2026-11-01", to: "2026-11-30" });
  });
});

describe("appointments on the calendar", () => {
  it("returns exact appointments as instants, with their story and people, never their notes", async () => {
    const response = await feed("alice");
    const mayor = response.appointments.find((row) => row.title === "Interview the mayor")!;
    expect(mayor).toMatchObject({ scheduleMode: "exact", startAt: "2026-11-10T15:15:00.000Z", endAt: "2026-11-10T15:45:00.000Z", storyId: story.budget, storyTitle: "Budget vote delayed", location: "City Hall", assignees: [{ id: accounts.alice.id, name: "alice Account" }] });
    expect(Object.keys(mayor).sort()).toEqual(["assigneeIds", "assignees", "endAt", "id", "kind", "location", "scheduleMode", "sourceId", "sourceLabel", "startAt", "status", "storyId", "storyTitle", "title", "windowEnd", "windowStart"]);
    for (const key of ["editor", "alice"]) expect(JSON.stringify(await feed(key, "from=2026-10-01&to=2027-01-31&tasks=1"))).not.toContain("Source asked not to be named");
  });

  it("excludes cancelled appointments and keeps completed and tentative ones", async () => {
    const response = await feed("alice");
    expect(titles(response.appointments)).not.toContain("Called off");
    expect(response.appointments.find((row) => row.title === "Already done")?.status).toBe("completed");
    expect(response.appointments.find((row) => row.title === "Late council session")?.status).toBe("tentative");
  });

  it("puts open target windows and undated appointments under Needs scheduling, never on a day", async () => {
    const response = await feed("alice");
    expect(titles(response.needsScheduling)).toEqual(["Coach interview", "Photo with principal"]);
    expect(response.needsScheduling[0]).toMatchObject({ title: "Coach interview", windowStart: "2026-11-23", windowEnd: "2026-11-25", startAt: null, endAt: null });
    expect(response.needsScheduling[1]).toMatchObject({ scheduleMode: "unscheduled", windowStart: null, startAt: null });
    expect(titles(response.appointments)).not.toEqual(expect.arrayContaining(["Coach interview", "Photo with principal"]));
    // Unresolved work needs scheduling whatever range is on screen.
    expect(titles((await feed("alice", "from=2027-02-01&to=2027-02-28")).needsScheduling)).toEqual(["Coach interview", "Photo with principal"]);
  });

  it("reads days in the newsroom timezone, not UTC", async () => {
    // 10:30 PM on Nov 9 in New York, already Nov 10 in UTC.
    expect(titles((await feed("alice", "from=2026-11-09&to=2026-11-09")).appointments)).toEqual(["Late council session"]);
    expect(titles((await feed("alice", "from=2026-11-10&to=2026-11-10")).appointments)).toEqual(["Interview the mayor"]);
  });

  it("keeps the range's edges right across the end of daylight saving time", async () => {
    const nov1 = titles((await feed("alice", "from=2026-11-01&to=2026-11-01")).appointments);
    expect(nov1).toContain("Just after midnight Nov 1");
    expect(nov1).not.toContain("Just before midnight Oct 31");
    // Started on Oct 31 and still going on Nov 1: it belongs to both days.
    expect(nov1).toContain("Overnight vigil");
    expect(titles((await feed("alice", "from=2026-10-31&to=2026-10-31")).appointments)).toEqual(["Just before midnight Oct 31", "Overnight vigil"]);
  });
});

describe("production and tasks", () => {
  it("returns open production with a deadline in range, at the range's newsroom-midnight edges", async () => {
    const response = await feed("editor");
    expect(titles(response.mediaDeadlines)).toEqual(["Budget chart", "Due at the start of Nov 30", "Library photos", "Private portraits"]);
    expect(response.mediaDeadlines.find((row) => row.title === "Private portraits")).toMatchObject({ storyId: story.private, type: "photo", status: "assigned", dueAt: "2026-11-12T17:00:00.000Z", assignee: { id: accounts.photo.id } });
    expect(titles((await feed("editor", "from=2026-12-01&to=2026-12-31")).mediaDeadlines)).toEqual(["Due at the start of Dec 1"]);
  });

  it("returns open task due dates only when asked for", async () => {
    expect((await feed("editor")).taskDeadlines).toEqual([]);
    const withTasks = await feed("editor", "from=2026-11-01&to=2026-11-30&tasks=1");
    expect(titles(withTasks.taskDeadlines)).toEqual(["Check the vote count", "Editor's own task"]);
    expect(withTasks.taskDeadlines[0]).toMatchObject({ storyId: story.budget, storyTitle: "Budget vote delayed", collectionId: null });
  });
});

describe("who sees what", () => {
  const everything = "from=2026-10-01&to=2027-01-31&tasks=1";

  it("gives an editor the whole newsroom's schedule", async () => {
    const response = await feed("editor", everything);
    // Every exact appointment on any story except the cancelled one.
    expect(titles(response.appointments)).toEqual(expect.arrayContaining(["Already done", "Interview the mayor", "Just after midnight Nov 1", "Just before midnight Oct 31", "Late council session", "Overnight vigil"]));
    expect(titles(response.appointments)).not.toContain("Called off");
    // Every open production deadline; the delivered one is done.
    expect(titles(response.mediaDeadlines)).toEqual(["Budget chart", "Due at the start of Dec 1", "Due at the start of Nov 30", "Library photos", "Private portraits"]);
    expect(titles(response.taskDeadlines)).toEqual(["Check the vote count", "Editor's own task"]);
  });

  it("gives a staff writer everything on the stories they manage, and nothing on anyone else's", async () => {
    const response = await feed("alice", everything);
    expect(new Set(response.mediaDeadlines.map((row) => row.storyId))).toEqual(new Set([story.budget]));
    expect(titles(response.mediaDeadlines)).toEqual(["Budget chart", "Due at the start of Dec 1", "Due at the start of Nov 30"]);
    expect(titles(response.taskDeadlines)).toEqual(["Check the vote count"]);
  });

  it("gives a photographer only the work assigned to them, not the newsroom's schedule", async () => {
    const response = await feed("photo", everything);
    expect(titles(response.mediaDeadlines)).toEqual(["Library photos", "Private portraits"]);
    expect(response.appointments).toEqual([]);
    expect(response.needsScheduling).toEqual([]);
    expect(response.taskDeadlines).toEqual([]);
  });

  it("never shows a participant a story's unpublished rewrite headline", async () => {
    const photo = await feed("photo", everything);
    expect(photo.mediaDeadlines.find((row) => row.title === "Library photos")?.storyTitle).toBe("Library hours change");
    const editor = await feed("editor", everything);
    expect(editor.mediaDeadlines.find((row) => row.title === "Library photos")?.storyTitle).toBe("Library to close (embargoed)");
  });

  it("gives someone with no part in a story nothing at all", async () => {
    const response: ScheduleResponse = await feed("bystander", everything);
    expect([response.appointments, response.needsScheduling, response.mediaDeadlines, response.taskDeadlines]).toEqual([[], [], [], []]);
  });

  it("lets a participant see an appointment assigned to them on someone else's story, and only that one", async () => {
    await create("alice", "appointments", { story: story.budget, title: "Photographer's shoot", kind: "photo", status: "confirmed", scheduleMode: "exact", startAt: "2026-11-16T16:00:00.000Z", assignees: [accounts.photo.id] });
    const response = await feed("photo", everything);
    expect(titles(response.appointments)).toEqual(["Photographer's shoot"]);
    expect(response.appointments[0].storyTitle).toBe("Budget vote delayed");
  });
});

describe("Calendar preferences", () => {
  it("are the reader's Payload Preferences, versioned by key, per account", async () => {
    const alice = createCalendarWorkspace(payloadCalendarStorage(preferencesFor("alice")));
    await alice.load();
    expect(alice.getState()).toMatchObject({ ready: true, view: null, filters: DEFAULT_CALENDAR_FILTERS });
    alice.setView("week-agenda");
    alice.setFilter("tasks", true);
    alice.setFilter("mine", true);
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(await preferencesFor("alice").getPreference(CALENDAR_PREFERENCES_KEY)).toEqual({ view: "week", filters: { ...DEFAULT_CALENDAR_FILTERS, tasks: true, mine: true } });

    const again = createCalendarWorkspace(payloadCalendarStorage(preferencesFor("alice")));
    await again.load();
    expect(again.getState()).toMatchObject({ view: "week", filters: { tasks: true, mine: true }, date: null });
    // Another account has its own.
    expect(await preferencesFor("editor").getPreference(CALENDAR_PREFERENCES_KEY)).toBeNull();
  });
});
