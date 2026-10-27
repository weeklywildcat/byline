/**
 * Stories for the Stories-page specs, created through the real protected REST
 * API as an administrator. Titles carry a unique token so a search isolates them
 * from whatever else the site holds.
 */
import type { AdminSession } from "./fixtures";
import type { Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

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

/** Real contributor/photo projection; an optional local headshot makes QA captures useful. */
export async function createPhotoContributor(page: Page, session: AdminSession, name: string): Promise<{ id: number; name: string; kind: "guest" }> {
  const image = process.env.BYLINE_E2E_PROFILE_PHOTO
    ? await readFile(process.env.BYLINE_E2E_PROFILE_PHOTO)
    : Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
  const nonce = await page.evaluate(() => (window as Window & { wpApiSettings?: { nonce?: string } }).wpApiSettings?.nonce ?? "");
  const uploaded = await page.context().request.post("/wp-json/wp/v2/media", { headers: { "X-WP-Nonce": nonce, "Content-Disposition": `attachment; filename="${token()}-profile.png"`, "Content-Type": "image/png" }, data: image });
  if (!uploaded.ok()) throw new Error(`Could not upload profile photo: HTTP ${uploaded.status()}`);
  const photoId = ((await uploaded.json()) as { id: number }).id;
  session.addCleanup(async () => { await session.rest(`/wp/v2/media/${photoId}?force=true`, "DELETE"); });
  const writer = await session.rest<{ id: number }>("/byline/v1/admin/contributors/guests", "POST", { displayName: name, imageId: photoId, hasProfilePage: false });
  if (!writer.ok) throw new Error(`Could not create photo contributor: HTTP ${writer.status}`);
  session.addCleanup(async () => { await session.rest(`/byline/v1/admin/contributors/guests/${writer.payload.id}`, "DELETE"); });
  return { id: writer.payload.id, name, kind: "guest" };
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
