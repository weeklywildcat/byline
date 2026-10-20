/**
 * Stories for the Stories-page specs, created through the real protected REST
 * API as an administrator. Titles carry a unique token so a search isolates them
 * from whatever else the site holds.
 */
import type { AdminSession } from "./fixtures";

export const token = () => `QA${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

const pad = (value: number) => String(value).padStart(2, "0");
export const addDays = (day: string, days: number) => new Date(Date.parse(`${day}T12:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

/** Site-local today, read from the server so the browser's zone never matters. */
export async function siteToday(session: AdminSession): Promise<{ day: string; timezone: string }> {
  const settings = await session.rest<{ timezone_string?: string }>("/wp/v2/settings");
  const timezone = settings.payload.timezone_string || "UTC";
  return { day: new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()), timezone };
}

export async function currentUserId(session: AdminSession): Promise<number> {
  return (await session.rest<{ id: number }>("/wp/v2/users/me")).payload.id;
}

export type PlanningStoryInput = { title: string; status?: string; deadline?: string; published?: boolean; writers?: number[] };

export async function createPlanningStory(session: AdminSession, input: PlanningStoryInput): Promise<number> {
  const created = await session.rest<{ id: number }>("/wp/v2/posts", "POST", { title: input.title, status: input.published ? "publish" : "draft", content: "" });
  if (!created.ok) throw new Error(`Could not create ${input.title}: HTTP ${created.status}`);
  const id = created.payload.id;
  session.registerTestPost(id);
  const story = `/byline/v1/editorial/stories/${id}`;
  if (input.writers?.length) await session.rest(`${story}/contributors`, "POST", { contributors: input.writers.map((writer) => ({ id: writer, kind: "user" })) });
  if (!input.published) {
    const workflow = await session.rest(`${story}`, "POST", { status: input.status ?? "reporting", ...(input.deadline ? { deadline: input.deadline } : {}) });
    if (!workflow.ok) throw new Error(`Could not set the workflow of ${input.title}: HTTP ${workflow.status}`);
  }
  return id;
}

export const boardUrl = (search = "", view = "board") => `/wp-admin/admin.php?page=byline-planning&tab=stories&view=${view}${search ? `&search=${encodeURIComponent(search)}` : ""}`;
export const pad2 = pad;
