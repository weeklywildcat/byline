import { createLocalReq, getPayload, type Endpoint, type Payload } from "payload";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { newsroomEndpoints } from "../../src/newsroom/endpoints";
import {
  deliverNotification,
  dueItemsFor,
  scheduleAppointmentReminder,
  scheduleProductionDueReminder,
  scheduleStoryDeadlineReminder,
  scheduleTaskDueReminder,
  sendDueDigests,
  sendReminder,
  withFailureNotice
} from "../../src/newsroom/notifications";
import type { User } from "../../src/payload-types";
import { NOTIFICATION_PREFERENCES_KEY, defaultNotificationPreferences } from "../../src/domain/notifications";

/**
 * Notifications against real PostgreSQL: each trigger (story assignment,
 * review, returned, media, high-priority task, appointment, publishing
 * failure, daily digest), preferences in Payload Preferences, the recipient's
 * private inbox and read-marking, email delivery state, retention and the
 * "never notify yourself" rule.
 */
let payload: Payload;
const accounts: Record<string, User> = {};
const people: Record<string, number> = {};
const story: Record<string, number> = {};
const NOW = new Date("2026-11-09T12:00:00Z");

async function account(key: string, role: User["role"], person = true) {
  if (person) people[key] = (await payload.create({ collection: "people", data: { name: `${key} Writer`, slug: `notify-${key}`, status: "active" } })).id;
  const user = await payload.create({ collection: "users", data: { email: `notify-${key}@example.test`, password: `pw-${key}-123456`, name: `${key} Account`, role, enabled: true, linkedPerson: people[key] ?? null } });
  accounts[key] = { ...user, collection: "users" } as User;
}
const reqAs = (key: string) => createLocalReq({ user: accounts[key] }, payload);
const as = async (key: string) => ({ req: await reqAs(key), overrideAccess: false as const });

async function call(method: string, path: string, key: string, { data, routeParams = {}, query = "" }: { data?: unknown; routeParams?: Record<string, string>; query?: string } = {}) {
  const endpoint = newsroomEndpoints.find((candidate) => candidate.method === method && candidate.path === path)!;
  const req = await reqAs(key);
  Object.assign(req, { routeParams, data, searchParams: new URLSearchParams(query) });
  const response = (await endpoint.handler(req)) as Response;
  return { status: response.status, body: await response.json() };
}
const workflow = (key: string, storyKey: string, data: Record<string, unknown>) => call("post", "/byline/stories/:id/workflow", key, { data, routeParams: { id: String(story[storyKey]) } });

const appointment = async (key: string, title: string, assignees: number[], extra: Record<string, unknown> = {}) =>
  payload.create({ collection: "appointments", data: { story: story.budget, title, kind: "interview", status: "planned", scheduleMode: "unscheduled", assignees, ...extra }, ...(await as(key)) });
const production = async (key: string, title: string, assignees: number[], type: "photo" | "graphic" = "photo") =>
  payload.create({ collection: "production-assignments", data: { story: story.budget, title, type, status: "needed", assignees }, ...(await as(key)) });

/** Notifications for one recipient, oldest first, read as the system. */
async function received(key: string, kind?: string) {
  const { docs } = await payload.find({ collection: "notifications", where: { and: [{ recipient: { equals: accounts[key].id } }, ...(kind ? [{ kind: { equals: kind } }] : [])] }, sort: "createdAt", pagination: false, overrideAccess: true });
  return docs;
}
async function clear() {
  await payload.delete({ collection: "notifications", where: { id: { exists: true } }, overrideAccess: true });
}

/** Payload Preferences exactly as `usePreferences()` writes them: the collection's own endpoint, as one account. */
async function savePreferences(key: string, value: unknown) {
  const endpoints = payload.collections["payload-preferences"].config.endpoints as Endpoint[];
  const post = endpoints.find((endpoint) => endpoint.method === "post" && endpoint.path === "/:key")!.handler;
  const req = await reqAs(key);
  Object.assign(req, { routeParams: { key: NOTIFICATION_PREFERENCES_KEY }, json: async () => ({ value }) });
  await post(req);
}

beforeAll(async () => {
  const url = new URL(process.env.DATABASE_URL!);
  url.pathname = `${url.pathname}_notifications`;
  process.env.DATABASE_URL = url.toString();
  const { default: config } = await import("../../src/payload.config");
  payload = await getPayload({ config });
  await account("editor", "editor");
  await account("chief", "editor");
  await account("alice", "staff");
  await account("bob", "staff");
  await account("photo", "staff", false);
  const section = (await payload.create({ collection: "sections", data: { name: "News", slug: "news" } })).id;
  story.budget = (await payload.create({ collection: "stories", draft: true, data: { headline: "Budget vote delayed", section, contributors: [people.alice] }, ...(await as("alice")) })).id;
}, 300_000);

afterAll(async () => {
  await payload?.db?.destroy?.();
});

describe("triggers", () => {
  it("never notifies the person who made the change", async () => {
    expect(await received("alice")).toHaveLength(0);
  });

  it("tells a person they were added to a byline, and an editor they were made the story's editor", async () => {
    await payload.update({ collection: "stories", id: story.budget, draft: true, data: { contributors: [people.alice, people.bob] }, ...(await as("editor")) });
    const added = await received("bob", "storyAssignments");
    expect(added).toHaveLength(1);
    expect(added[0]).toMatchObject({ detail: "byline", inbox: true, emailState: "none" });
    // Saving again without changing the byline notifies nobody twice.
    await payload.update({ collection: "stories", id: story.budget, draft: true, data: { deck: "A new deck." }, ...(await as("editor")) });
    expect(await received("bob", "storyAssignments")).toHaveLength(1);

    expect((await workflow("editor", "budget", { editorId: accounts.chief.id })).status).toBe(200);
    const chief = await received("chief", "storyAssignments");
    expect(chief).toHaveLength(1);
    expect(chief[0]).toMatchObject({ detail: "editor" });
    expect(await received("editor")).toHaveLength(0);
  });

  it("tells the editor when a story is moved into review by hand, and the writers when it is sent back", async () => {
    expect((await workflow("alice", "budget", { status: "writing" })).status).toBe(200);
    expect(await received("chief", "readyForReview")).toHaveLength(0);
    // Reporters submit for review (the review engine notifies the routed reviewer); a manual move is an editor's override.
    expect((await workflow("alice", "budget", { status: "editing" })).status).toBe(403);
    expect((await workflow("editor", "budget", { status: "editing" })).status).toBe(200);
    expect(await received("chief", "readyForReview")).toHaveLength(1);
    // Review to Ready is the same review finishing: no second review notice.
    expect((await workflow("editor", "budget", { status: "ready" })).status).toBe(200);
    expect(await received("chief", "readyForReview")).toHaveLength(1);

    expect((await workflow("chief", "budget", { status: "writing" })).status).toBe(200);
    expect(await received("alice", "storyReturned")).toHaveLength(1);
    expect(await received("bob", "storyReturned")).toHaveLength(1);
    expect(await received("chief", "storyReturned")).toHaveLength(0);
  });

  it("notifies the assignees of high-priority tasks only", async () => {
    const quiet = await payload.create({ collection: "tasks", data: { story: story.budget, title: "Check quote", assignees: [accounts.alice.id], priority: "normal" }, ...(await as("editor")) });
    expect(await received("alice", "highPriorityTasks")).toHaveLength(0);
    // Raising it to high is the moment it becomes a high-priority task.
    await payload.update({ collection: "tasks", id: quiet.id, data: { priority: "high" }, ...(await as("editor")) });
    const raised = await received("alice", "highPriorityTasks");
    expect(raised).toHaveLength(1);
    expect(raised[0]).toMatchObject({ detail: "Check quote" });
    // High to urgent is not a new assignment.
    await payload.update({ collection: "tasks", id: quiet.id, data: { priority: "urgent" }, ...(await as("editor")) });
    expect(await received("alice", "highPriorityTasks")).toHaveLength(1);
    await payload.create({ collection: "tasks", data: { story: story.budget, title: "Call the clerk", assignees: [accounts.bob.id], priority: "urgent" }, ...(await as("editor")) });
    expect(await received("bob", "highPriorityTasks")).toHaveLength(1);
  });

  it("notifies media and appointment assignees", async () => {
    await production("editor", "Council photos", [accounts.photo.id]);
    const media = await received("photo", "mediaAssignments");
    expect(media).toHaveLength(1);
    expect(media[0]).toMatchObject({ detail: "Council photos" });
    await appointment("editor", "Interview the mayor", [accounts.bob.id]);
    expect(await received("bob", "appointments")).toHaveLength(1);
  });

  it("does not notify for imported records", async () => {
    const before = (await received("alice")).length;
    const req = await reqAs("editor");
    req.context = { bylineImport: true };
    await payload.create({ collection: "tasks", data: { story: story.budget, title: "Imported", assignees: [accounts.alice.id], priority: "urgent" }, req, overrideAccess: true });
    expect(await received("alice")).toHaveLength(before);
  });
});

describe("preferences", () => {
  it("honours a person's choices per kind, and per channel", async () => {
    await clear();
    const off = defaultNotificationPreferences();
    off.inApp.mediaAssignments = false;
    off.email.mediaAssignments = false;
    await savePreferences("photo", off);
    await production("editor", "Silenced", [accounts.photo.id], "graphic");
    expect(await received("photo", "mediaAssignments")).toHaveLength(0);
    // Other kinds still arrive for the same person.
    await appointment("editor", "Still told", [accounts.photo.id]);
    expect(await received("photo", "appointments")).toHaveLength(1);
  });

  it("keeps a notification out of the inbox when only email is wanted", async () => {
    vi.stubEnv("BYLINE_SMTP_URL", "smtp://mail.example.test:25");
    try {
      await clear();
      const emailOnly = defaultNotificationPreferences();
      emailOnly.inApp.appointments = false;
      await savePreferences("bob", emailOnly);
      await appointment("editor", "Phone call", [accounts.bob.id]);
      const [row] = await received("bob", "appointments");
      expect(row).toMatchObject({ inbox: false, emailState: "pending" });
      const inbox = await call("get", "/byline/notifications", "bob");
      expect(inbox.body.items).toHaveLength(0);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe("the inbox", () => {
  it("shows a person only their own notifications, with the story's headline", async () => {
    await clear();
    await savePreferences("bob", defaultNotificationPreferences());
    await payload.create({ collection: "tasks", data: { story: story.budget, title: "Verify the figures", assignees: [accounts.alice.id], priority: "high" }, ...(await as("editor")) });
    await payload.create({ collection: "tasks", data: { story: story.budget, title: "Bob's urgent job", assignees: [accounts.bob.id], priority: "high" }, ...(await as("editor")) });
    const mine = await call("get", "/byline/notifications", "alice");
    expect(mine.body.unread).toBe(1);
    expect(mine.body.items).toHaveLength(1);
    expect(mine.body.items[0]).toMatchObject({ kind: "highPriorityTasks", readAt: null, href: `/admin/collections/stories/${story.budget}` });
    expect(mine.body.items[0].text).toContain("editor Account");
    expect(mine.body.items[0].text).toContain("Verify the figures");
    // The collection itself is the recipient's own rows, even through the Local API with access on.
    const direct = await payload.find({ collection: "notifications", depth: 0, ...(await as("alice")) });
    expect(direct.docs).toHaveLength(1);
    expect(String(direct.docs[0].recipient)).toBe(String(accounts.alice.id));
    // Nobody can edit or delete one directly.
    await expect(payload.update({ collection: "notifications", id: direct.docs[0].id, data: { readAt: NOW.toISOString() }, ...(await as("alice")) })).rejects.toThrow();
    await expect(payload.delete({ collection: "notifications", id: direct.docs[0].id, ...(await as("alice")) })).rejects.toThrow();
  });

  it("marks only the caller's own notifications read", async () => {
    const aliceRows = await received("alice");
    const stranger = await call("post", "/byline/notifications/read", "bob", { data: { ids: aliceRows.map((row) => row.id) } });
    expect(stranger.status).toBe(200);
    expect((await call("get", "/byline/notifications", "alice")).body.unread).toBe(1);
    const own = await call("post", "/byline/notifications/read", "alice", { data: { all: true } });
    expect(own.body.unread).toBe(0);
    expect((await call("get", "/byline/notifications", "alice", { query: "unread=1" })).body.items).toHaveLength(0);
    expect((await call("get", "/byline/notifications", "alice")).body.items[0].readAt).not.toBeNull();
    expect((await call("get", "/byline/notifications", "bob")).body.unread).toBe(1);
    expect((await call("post", "/byline/notifications/read", "alice", { data: {} })).status).toBe(400);
  });
});

describe("email", () => {
  it("sends once, with a link into Byline, and records the outcome", async () => {
    vi.stubEnv("BYLINE_SMTP_URL", "smtp://mail.example.test:25");
    vi.stubEnv("BYLINE_NEWSROOM_URL", "https://newsroom.example.test");
    const send = vi.spyOn(payload, "sendEmail").mockResolvedValue(undefined as never);
    try {
      await clear();
      await savePreferences("alice", defaultNotificationPreferences());
      await payload.create({ collection: "tasks", data: { story: story.budget, title: "Fact-check the tally", assignees: [accounts.alice.id], priority: "high" }, ...(await as("editor")) });
      const [row] = await received("alice");
      expect(row.emailState).toBe("pending");
      expect(await deliverNotification(payload, row.id)).toBe("sent");
      expect(send).toHaveBeenCalledTimes(1);
      const message = send.mock.calls[0][0] as { to: string; subject: string; text: string; html: string };
      expect(message.to).toBe("notify-alice@example.test");
      expect(message.subject).toContain("Fact-check the tally");
      expect(message.text).toContain(`https://newsroom.example.test/admin/collections/stories/${story.budget}`);
      expect(message.html).toContain(">BYLINE<");
      expect(message.html).toContain("Open in Byline&nbsp;→");
      expect((await received("alice"))[0].emailState).toBe("sent");
      // Delivering again is a no-op.
      expect(await deliverNotification(payload, row.id)).toBe("skipped");
      expect(send).toHaveBeenCalledTimes(1);
    } finally {
      send.mockRestore();
      vi.unstubAllEnvs();
    }
  });

  it("skips email and keeps the inbox when no transport is configured", async () => {
    await clear();
    await payload.create({ collection: "tasks", data: { story: story.budget, title: "No mail here", assignees: [accounts.alice.id], priority: "high" }, ...(await as("editor")) });
    expect((await received("alice"))[0]).toMatchObject({ emailState: "none", inbox: true });
  });
});

describe("publishing failures", () => {
  it("tells every editor and administrator once per failed job, never staff", async () => {
    await clear();
    const task = withFailureNotice({ slug: "prepare-public-snapshot", handler: async () => ({ output: {} }) } as never, "Public snapshot preparation");
    const req = await reqAs("alice");
    await task.onFail!({ req, job: { id: 41 }, taskStatus: null } as never);
    await task.onFail!({ req, job: { id: 41 }, taskStatus: null } as never);
    expect(await received("editor", "publishingFailures")).toHaveLength(1);
    expect(await received("chief", "publishingFailures")).toHaveLength(1);
    expect(await received("alice", "publishingFailures")).toHaveLength(0);
    expect((await received("chief"))[0]).toMatchObject({ detail: "Public snapshot preparation" });
  });
});

describe("future reminders", () => {
  it("queues one-time jobs with waitUntil for each supported newsroom deadline", async () => {
    const req = await reqAs("editor");
    const queue = vi.spyOn(payload.jobs, "queue").mockResolvedValue({ id: 999 } as never);
    try {
      await scheduleTaskDueReminder(req, { id: 81, due: "2099-11-12T20:00:00.000Z", state: "open" });
      await scheduleProductionDueReminder(req, { id: 82, deadline: "2099-11-13T20:00:00.000Z", status: "needed" });
      await scheduleAppointmentReminder(req, { id: 83, startAt: "2099-11-14T20:00:00.000Z", scheduleMode: "exact", status: "planned" });
      await scheduleStoryDeadlineReminder(req, { id: 84, deadline: "2099-11-15", workflow: "writing" });
      expect(queue).toHaveBeenCalledTimes(4);
      expect(queue.mock.calls.map(([args]) => (args as { task?: string }).task)).toEqual(["send-due-digest", "send-due-digest", "send-due-digest", "send-due-digest"]);
      expect(queue.mock.calls[0][0]).toMatchObject({
        queue: "maintenance",
        input: { reminderTarget: "task", recordId: 81, expectedAt: "2099-11-12T20:00:00.000Z" },
        waitUntil: new Date("2099-11-11T20:00:00.000Z")
      });
      expect(queue.mock.calls[2][0]).toMatchObject({
        input: { reminderTarget: "appointment", recordId: 83, expectedAt: "2099-11-14T20:00:00.000Z" },
        waitUntil: new Date("2099-11-14T19:00:00.000Z")
      });
      expect(queue.mock.calls[3][0]).toMatchObject({ input: { reminderTarget: "story", recordId: 84, expectedAt: "2099-11-15" } });
    } finally {
      queue.mockRestore();
    }
  });

  it("sends action-first reminders, dedupes retries and ignores stale work", async () => {
    await clear();
    const editor = await as("editor");
    const due = "2026-11-12T20:00:00.000Z";
    const task = await payload.create({
      collection: "tasks",
      data: { story: story.budget, title: "Verify final figures", assignees: [accounts.bob.id], due, priority: "normal" },
      ...editor
    });
    await clear();

    const req = await reqAs("editor");
    expect(await sendReminder(req, { reminderTarget: "task", recordId: task.id, expectedAt: due })).toBe(1);
    expect(await sendReminder(req, { reminderTarget: "task", recordId: task.id, expectedAt: due })).toBe(0);
    const [deadline] = await received("bob", "dueDigest");
    expect(deadline).toMatchObject({ detail: "Verify final figures" });
    expect((deadline.data as { reminder?: unknown }).reminder).toEqual({ type: "deadline", target: "task", when: "tomorrow" });
    expect((await call("get", "/byline/notifications", "bob")).body.items[0].text).toBe("“Verify final figures” is due tomorrow");

    await payload.update({ collection: "tasks", id: task.id, data: { due: "2026-11-13T20:00:00.000Z" }, ...editor });
    await clear();
    expect(await sendReminder(req, { reminderTarget: "task", recordId: task.id, expectedAt: due })).toBe(0);

    const startAt = "2026-11-12T21:00:00.000Z";
    const interview = await appointment("editor", "Interview the mayor", [accounts.bob.id], { scheduleMode: "exact", startAt, endAt: "2026-11-12T21:30:00.000Z" });
    await clear();
    expect(await sendReminder(req, { reminderTarget: "appointment", recordId: interview.id, expectedAt: startAt })).toBe(1);
    const [appointmentReminder] = await received("bob", "appointments");
    expect((appointmentReminder.data as { reminder?: unknown }).reminder).toEqual({ type: "appointment", target: "appointment", when: "in 1 hour" });
    expect((await call("get", "/byline/notifications", "bob")).body.items[0].text).toBe("“Interview the mayor” starts in 1 hour");
  });
});

describe("the daily digest", () => {
  it("lists what a person has due today or overdue, once a day, and prunes old notices", async () => {
    await clear();
    const editor = await as("editor");
    await payload.create({ collection: "tasks", data: { story: story.budget, title: "Overdue call", assignees: [accounts.bob.id], due: "2026-11-08T15:00:00Z" }, ...editor });
    await payload.create({ collection: "tasks", data: { story: story.budget, title: "Due this afternoon", assignees: [accounts.bob.id], due: "2026-11-09T20:00:00Z" }, ...editor });
    await payload.create({ collection: "tasks", data: { story: story.budget, title: "Next week", assignees: [accounts.bob.id], due: "2026-11-16T20:00:00Z" }, ...editor });
    const finished = await payload.create({ collection: "tasks", data: { story: story.budget, title: "Already done", assignees: [accounts.bob.id], due: "2026-11-09T14:00:00Z" }, ...editor });
    await payload.update({ collection: "tasks", id: finished.id, data: { state: "completed" }, ...editor });
    await appointment("editor", "Council meeting", [accounts.bob.id], { scheduleMode: "exact", startAt: "2026-11-09T23:00:00Z", endAt: "2026-11-10T00:00:00Z" });
    await clear();

    const items = await dueItemsFor(payload, { id: accounts.bob.id, linkedPerson: people.bob }, "2026-11-09", "America/New_York");
    expect(items.map((item) => item.title).sort()).toEqual(["Council meeting", "Due this afternoon", "Overdue call"]);
    expect(items.find((item) => item.title === "Overdue call")?.when).toBe("overdue");

    const req = await reqAs("editor");
    await sendDueDigests(req, NOW, "America/New_York");
    const [digest] = await received("bob", "dueDigest");
    expect((digest.data as { items: unknown[] }).items).toHaveLength(3);
    expect(await received("alice", "dueDigest")).toHaveLength(0);
    // The same day runs once.
    await sendDueDigests(req, NOW, "America/New_York");
    expect(await received("bob", "dueDigest")).toHaveLength(1);
    const row = (await call("get", "/byline/notifications", "bob")).body.items[0];
    expect(row).toMatchObject({ kind: "dueDigest", text: "3 items are due today or overdue" });

    // A digest the person turned off is not sent.
    const off = defaultNotificationPreferences();
    off.inApp.dueDigest = false;
    off.email.dueDigest = false;
    await savePreferences("bob", off);
    await clear();
    await sendDueDigests(req, NOW, "America/New_York");
    expect(await received("bob", "dueDigest")).toHaveLength(0);

    // Read notices are pruned after sixty days; unread ones after a hundred and twenty.
    await clear();
    const old = new Date(NOW.getTime() - 61 * 86_400_000).toISOString();
    const stale = await payload.create({ collection: "notifications", data: { recipient: accounts.alice.id, kind: "appointments", readAt: old }, overrideAccess: true });
    const unread = await payload.create({ collection: "notifications", data: { recipient: accounts.alice.id, kind: "appointments" }, overrideAccess: true });
    await payload.db.updateOne({ collection: "notifications", id: stale.id, data: { createdAt: old } });
    await payload.db.updateOne({ collection: "notifications", id: unread.id, data: { createdAt: old } });
    const result = await sendDueDigests(req, NOW, "America/New_York");
    expect(result.pruned).toBe(1);
    expect((await received("alice")).map((row) => row.id)).toEqual([unread.id]);
  });
});

describe("deleting an account", () => {
  it("removes the person's notifications with it and leaves everyone else's", async () => {
    await account("leaver", "staff");
    await clear();
    await payload.create({ collection: "tasks", data: { story: story.budget, title: "For the leaver", assignees: [accounts.leaver.id], priority: "high" }, ...(await as("editor")) });
    await payload.create({ collection: "tasks", data: { story: story.budget, title: "For Alice", assignees: [accounts.alice.id], priority: "high" }, ...(await as("editor")) });
    expect(await received("leaver")).toHaveLength(1);
    await payload.delete({ collection: "users", id: accounts.leaver.id, overrideAccess: true });
    const left = await payload.find({ collection: "notifications", where: { recipient: { equals: accounts.leaver.id } }, overrideAccess: true });
    expect(left.docs).toHaveLength(0);
    expect(await received("alice", "highPriorityTasks")).toHaveLength(1);
  });
});
