/**
 * The realistic newsroom story used for Story Workspace screenshots and
 * interaction tests. Everything is created through the real protected REST API
 * as an administrator, so the fixture exercises the same validation, activity
 * and notification paths a newsroom would.
 *
 *   Canteen could return to Ninety Six High School
 *   Reporting · contributors Caroline Elrod and Gibson Bell · editor Gibson
 *   3 sources, 2 appointments (one exact, one a target window), 3 tasks,
 *   1 production assignment (Cafeteria photos → Maycie), 3 resource links.
 *
 * Dates are relative to "today" in the WordPress site timezone so the fixture
 * stays meaningful whenever the suite runs.
 */
import type { AdminSession } from "./fixtures";

export type CanteenFixture = {
  storyId: number;
  title: string;
  users: { gibson: number; caroline: number; maycie: number };
  sourceIds: { hamby: string; localReporter: string; sprowl: string };
  appointmentIds: { hambyInterview: string; reporterInterview: string };
  assignmentId: string;
  /** Site-local `YYYY-MM-DD` of the confirmed interview and the target window. */
  days: { interview: string; windowStart: string; windowEnd: string; photosDue: string; deadline: string; publication: string };
  workspaceUrl: string;
};

const pad = (value: number) => String(value).padStart(2, "0");
const iso = (date: Date) => `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
const addDays = (day: string, days: number) => iso(new Date(Date.parse(`${day}T12:00:00Z`) + days * 86_400_000));

/** Site-local today, read from the server so the browser's zone never matters. */
async function siteToday(session: AdminSession): Promise<string> {
  const settings = await session.rest<{ timezone_string?: string; gmt_offset?: number }>("/wp/v2/settings");
  const zone = settings.payload.timezone_string || "UTC";
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  return parts;
}

async function ensureUser(session: AdminSession, username: string, name: string, role: string): Promise<number> {
  const found = await session.rest<Array<{ id: number }>>(`/wp/v2/users?search=${encodeURIComponent(username)}&context=edit`);
  if (found.ok && found.payload[0]) return found.payload[0].id;
  const created = await session.rest<{ id: number }>("/wp/v2/users", "POST", {
    username, name, email: `${username}@example.test`, password: `Qa-${Math.random().toString(36).slice(2)}-Aa1!`, roles: [role]
  });
  if (!created.ok) throw new Error(`Could not create ${username}: HTTP ${created.status}`);
  return created.payload.id;
}

export async function seedCanteenStory(session: AdminSession, options: { keep?: boolean } = {}): Promise<CanteenFixture> {
  const today = await siteToday(session);
  const monday = addDays(today, -((new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7));
  const interview = addDays(monday, 8); // next Tuesday
  const days = {
    interview,
    windowStart: addDays(monday, 7),
    windowEnd: addDays(monday, 11),
    photosDue: addDays(monday, 9), // next Wednesday
    deadline: addDays(monday, 10),
    publication: addDays(monday, 11)
  };

  const gibson = await ensureUser(session, "qa-gibson", "Gibson Bell", "editor");
  const caroline = await ensureUser(session, "qa-caroline", "Caroline Elrod", "author");
  const maycie = await ensureUser(session, "qa-maycie", "Maycie Photographer", "author");

  const title = options.keep ? "Canteen could return to Ninety Six High School" : `Canteen could return to Ninety Six High School · ${Date.now()}`;
  const created = await session.rest<{ id: number }>("/wp/v2/posts", "POST", { title, status: "draft", content: "" });
  if (!created.ok) throw new Error(`Could not create the fixture story: HTTP ${created.status}`);
  const storyId = created.payload.id;
  if (!options.keep) session.registerTestPost(storyId);
  const story = `/byline/v1/editorial/stories/${storyId}`;
  const must = async <T>(label: string, result: Promise<{ ok: boolean; status: number; payload: T }>): Promise<T> => {
    const response = await result;
    if (!response.ok) throw new Error(`${label} failed: HTTP ${response.status} ${JSON.stringify(response.payload)}`);
    return response.payload;
  };

  await must("contributors", session.rest(`${story}/contributors`, "POST", { contributors: [{ id: caroline, kind: "user" }, { id: gibson, kind: "user" }] }));
  await must("workflow", session.rest(`${story}`, "POST", { status: "reporting", editorId: gibson, deadline: days.deadline, plannedPublishAt: `${days.publication}T12:00` }));
  await must("brief", session.rest(`${story}/brief`, "POST", { brief: "Report why canteen stopped, what rules apply, and what would be needed to bring it back." }));

  type Reporting = { sourceId?: string; appointmentId?: string };
  const hamby = (await must<Reporting>("source", session.rest(`${story}/sources`, "POST", { label: "Mrs. Hamby", role: "Principal", status: "scheduled", assigneeIds: [gibson], notes: "Prefers mornings." }))).sourceId!;
  const localReporter = (await must<Reporting>("source", session.rest(`${story}/sources`, "POST", { label: "Local reporter", organization: "Index-Journal", status: "needs-scheduling", assigneeIds: [gibson] }))).sourceId!;
  const sprowl = (await must<Reporting>("source", session.rest(`${story}/sources`, "POST", { label: "Mr. Sprowl", role: "Cafeteria", status: "interviewed", assigneeIds: [caroline] }))).sourceId!;

  const hambyInterview = (await must<Reporting>("appointment", session.rest(`${story}/appointments`, "POST", {
    title: "Interview Mrs. Hamby", kind: "interview", status: "confirmed", scheduleMode: "exact", startAt: `${interview}T10:15`, endAt: `${interview}T10:35`,
    location: "Main office", assigneeIds: [gibson], sourceId: hamby, notes: "Bring the USDA questions."
  }))).appointmentId!;
  const reporterInterview = (await must<Reporting>("appointment", session.rest(`${story}/appointments`, "POST", {
    title: "Interview local reporter", kind: "interview", status: "planned", scheduleMode: "window", windowStart: days.windowStart, windowEnd: days.windowEnd,
    assigneeIds: [gibson], sourceId: localReporter
  }))).appointmentId!;

  for (const [taskTitle, assignee] of [["Interview three students", caroline], ["Research competitive-food regulations", gibson], ["Prepare questions for Mrs. Hamby", gibson]] as const) {
    await must("task", session.rest(`${story}/tasks`, "POST", { title: taskTitle, assigneeId: assignee, storyId, dueAt: `${days.interview}T09:00`, priority: "normal" }));
  }

  const assignmentId = (await must<{ assignmentId: string }>("assignment", session.rest(`${story}/media-assignments`, "POST", {
    title: "Cafeteria photos", type: "photo", assigneeId: maycie, dueAt: `${days.photosDue}T17:00`, notes: "Lunch rush and the empty serving line."
  }))).assignmentId;

  await must("resource", session.rest(`${story}/resources`, "POST", { label: "Working draft", url: "https://docs.google.com/document/d/canteen-draft/edit", purpose: "draft" }));
  await must("resource", session.rest(`${story}/resources`, "POST", { label: "Mrs. Hamby questions", url: "https://docs.google.com/document/d/hamby-questions/edit", purpose: "interview-notes" }));
  await must("resource", session.rest(`${story}/resources`, "POST", { label: "Research folder", url: "https://drive.google.com/drive/folders/canteen-research", purpose: "research" }));

  if (!options.keep) {
    // Tasks are child posts; they are not removed with their story.
    session.addCleanup(async () => {
      const tasks = await session.rest<{ tasks: Array<{ id: number }> }>(`${story}/tasks`);
      for (const task of tasks.payload?.tasks ?? []) await session.rest(`/byline/v1/editorial/tasks/${task.id}`, "DELETE");
    });
  }
  return {
    storyId, title, users: { gibson, caroline, maycie }, sourceIds: { hamby, localReporter, sprowl },
    appointmentIds: { hambyInterview, reporterInterview }, assignmentId, days,
    workspaceUrl: `/wp-admin/admin.php?page=byline-planning&story=${storyId}`
  };
}
