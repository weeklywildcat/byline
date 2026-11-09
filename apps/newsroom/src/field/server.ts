import { APIError, type Where } from "payload";
import { canPublishLive, liveGate, livePublisherStories } from "../access/live-context";
import { scopeManages, scopeParticipates, storyScope } from "../access/story-context";
import { atLeast, relationId } from "../access/user";
import { type CoverageState, type LiveMode, type PublishBlock } from "../domain/live-coverage";
import { addDays, localDay } from "../domain/dates";
import { validClientKey } from "../domain/reporting";
import { createLiveUpdate } from "../newsroom/live-coverage";
import { lexicalToPlainText } from "../newsroom/live-text";
import type { ScreenContext } from "../newsroom/screen-models";

/**
 * Field Mode's server (docs/field-mode.md). Two reads and one write:
 *
 * - the assignment feed answers "What am I covering right now?" from work
 *   Byline already has (appointments, production assignments, live stories);
 * - a story session gives one Story's coverage context to the composer;
 * - live posting is idempotent on the outbox's client key and never claims an
 *   update is live until the server stored it as published.
 *
 * Notes, files and photos reuse Reporting's capture endpoints: one capture
 * path, whatever screen it came from.
 */

export type FieldItem = {
  key: string;
  storyId: number;
  story: string;
  kind: "appointment" | "production" | "live";
  title: string;
  /** Exact time, or null for a window or a delivery without a time. */
  startAt: string | null;
  /** Date-only window start, never converted to an instant. */
  day: string | null;
  location: string;
  live: boolean;
  status: string;
  appointmentId: number | null;
  assignmentId: number | null;
};

export type FieldFeed = { now: FieldItem[]; today: FieldItem[]; upcoming: FieldItem[]; timeZone: string };

const as = (ctx: ScreenContext) => ({ req: ctx.req, overrideAccess: false as const, depth: 0 });
const num = (value: unknown) => Number(relationId(value)) || 0;
const NOW_BEFORE = 3 * 3600_000;
const NOW_AFTER = 2 * 3600_000;

export async function fieldFeed(ctx: ScreenContext): Promise<FieldFeed> {
  const scope = await storyScope(ctx.req);
  if (!scope) throw new APIError("Sign in to use the newsroom.", 401);
  const { payload } = ctx.req;
  const me = ctx.user.id;
  const now = ctx.now.getTime();
  const today = localDay(ctx.now, ctx.timeZone);
  const horizon = addDays(today, 7);
  const [appointments, production, granted] = await Promise.all([
    payload.find({
      collection: "appointments",
      where: { and: [{ assignees: { in: [me] } }, { status: { not_in: ["completed", "cancelled"] } }, { or: [
        { and: [{ scheduleMode: { equals: "exact" } }, { startAt: { greater_than_equal: new Date(now - NOW_BEFORE).toISOString() } }, { startAt: { less_than: new Date(now + 8 * 86_400_000).toISOString() } }] },
        { and: [{ scheduleMode: { equals: "window" } }, { windowStart: { less_than_equal: horizon } }] }
      ] }] },
      limit: 60, sort: "startAt", ...as(ctx)
    }),
    payload.find({ collection: "production-assignments", where: { and: [{ assignees: { in: [me] } }, { status: { not_in: ["done", "selected"] } }] }, limit: 60, sort: "deadline", ...as(ctx) }),
    livePublisherStories(ctx.req)
  ]);
  // Running live coverage (Live mode, Live now) on stories this person manages, works on, or may publish live updates for.
  const reachable = scope.all ? null : [...new Set([...scope.managed, ...scope.participant, ...granted])].map(Number).filter(Boolean);
  const livePlans = !reachable || reachable.length ? await payload.find({
    collection: "story-plans", overrideAccess: true, depth: 0, limit: 20, select: { story: true },
    where: { and: [{ "liveCoverage.mode": { equals: "live" } }, { "liveCoverage.state": { equals: "live" } }, ...(reachable ? [{ story: { in: reachable } }] : [])] }
  }) : { docs: [] as Array<{ story?: unknown }> };
  const liveIds = livePlans.docs.map((plan) => num(plan.story)).filter(Boolean);
  const live = liveIds.length ? await payload.find({ collection: "stories", draft: true, where: { id: { in: liveIds } }, limit: 20, select: { headline: true }, ...as(ctx) }) : { docs: [] as Array<{ id: number; headline: string }> };
  const storyIds = [...new Set([...appointments.docs.map((row) => num(row.story)), ...production.docs.map((row) => num(row.story)), ...live.docs.map((row) => row.id)])].filter(Boolean);
  const stories = storyIds.length ? await payload.find({ collection: "stories", draft: true, where: { id: { in: storyIds } }, pagination: false, select: { headline: true }, ...as(ctx) }) : { docs: [] };
  const headline = new Map(stories.docs.map((story) => [story.id, story.headline || "Untitled story"]));
  const isLive = new Set(liveIds);

  const items: Array<FieldItem & { bucket: "now" | "today" | "upcoming"; sort: string }> = [];
  for (const row of appointments.docs) {
    const storyId = num(row.story);
    const exact = row.scheduleMode === "exact" && row.startAt ? row.startAt : null;
    const day = exact ? localDay(exact, ctx.timeZone) : row.windowStart ?? null;
    let bucket: "now" | "today" | "upcoming" = "upcoming";
    if (exact && Date.parse(exact) >= now - NOW_BEFORE && Date.parse(exact) <= now + NOW_AFTER) bucket = "now";
    else if (day && (day <= today && (row.windowEnd ?? day) >= today)) bucket = "today";
    else if (day === today) bucket = "today";
    items.push({ key: `appointment:${row.id}`, storyId, story: headline.get(storyId) ?? "A story", kind: "appointment", title: row.title, startAt: exact, day: exact ? null : day, location: row.location ?? "", live: isLive.has(storyId), status: row.status, appointmentId: row.id, assignmentId: null, bucket, sort: exact ?? `${day ?? "9999"}T99` });
  }
  for (const row of production.docs) {
    const storyId = num(row.story);
    const due = row.deadline ?? null;
    const bucket = due && localDay(due, ctx.timeZone) <= today ? "today" : "upcoming";
    items.push({ key: `production:${row.id}`, storyId, story: headline.get(storyId) ?? "A story", kind: "production", title: row.title, startAt: due, day: null, location: "", live: isLive.has(storyId), status: row.status, appointmentId: null, assignmentId: row.id, bucket, sort: due ?? "9999" });
  }
  for (const story of live.docs) {
    // A live story already listed through an assignment is not listed twice.
    if (items.some((item) => item.storyId === story.id)) {
      for (const item of items) if (item.storyId === story.id) item.bucket = "now";
      continue;
    }
    items.push({ key: `live:${story.id}`, storyId: story.id, story: story.headline || "Untitled story", kind: "live", title: "Live coverage", startAt: null, day: null, location: "", live: true, status: "live", appointmentId: null, assignmentId: null, bucket: "now", sort: "0" });
  }
  items.sort((a, b) => a.sort.localeCompare(b.sort));
  const pick = (bucket: "now" | "today" | "upcoming") => items.filter((item) => item.bucket === bucket).map(({ bucket: _bucket, sort: _sort, ...item }) => item);
  return { now: pick("now"), today: pick("today"), upcoming: pick("upcoming"), timeZone: ctx.timeZone };
}

export type FieldRecent = { key: string; kind: "note" | "file" | "media" | "live"; text: string; at: string; state?: "draft" | "published" };

export type FieldCoverage = {
  mode: LiveMode;
  state: CoverageState;
  startedAt: string | null;
  endedAt: string | null;
};

export type FieldSession = {
  /** `live` is "Live now" coverage on a Story in Live mode; `coverage` is the full mode and state. */
  story: { id: number; headline: string; live: boolean; published: boolean; coverage: FieldCoverage };
  /** Holds the live-publishing right on this Story (editors, or its direct-publisher grant). */
  canPostLive: boolean;
  /** ...and coverage accepts public updates right now. The one shared rule (access/live-context.ts). */
  canPublishNow: boolean;
  publishBlock: PublishBlock | null;
  /** Editor-level: start, end, resume coverage and choose direct publishers. */
  canControl: boolean;
  appointment: { id: number; title: string; startAt: string | null; location: string; sourceId: number | null; source: string | null } | null;
  assignments: Array<{ id: number; title: string; type: string; deadline: string | null }>;
  recent: FieldRecent[];
  timeZone: string;
};

/** One Story's coverage context, small enough for a phone: never the article body. */
export async function fieldSession(ctx: ScreenContext, storyId: number, appointmentId: number | null): Promise<FieldSession> {
  const scope = await storyScope(ctx.req);
  const postLive = await canPublishLive(ctx.req, storyId);
  if (!scopeManages(scope, storyId) && !scopeParticipates(scope, storyId) && !postLive) throw new APIError("You are not part of this story.", 403);
  const { payload } = ctx.req;
  const story = await payload.findByID({ collection: "stories", id: storyId, draft: true, select: { headline: true }, ...as(ctx) });
  const gate = await liveGate(ctx.req, storyId);
  const byStory = { story: { equals: storyId } };
  const mine = { createdBy: { equals: ctx.user.id } };
  const [appointment, assignments, notes, files, media, live] = await Promise.all([
    appointmentId ? payload.find({ collection: "appointments", where: { and: [{ id: { equals: appointmentId } }, byStory] }, limit: 1, ...as(ctx) }).then((result) => result.docs[0] ?? null) : null,
    payload.find({ collection: "production-assignments", where: { and: [byStory, { assignees: { in: [ctx.user.id] } }, { status: { not_in: ["done", "selected"] } }] }, limit: 12, ...as(ctx) }),
    payload.find({ collection: "reporting-notes", where: { and: [byStory, mine] }, limit: 10, sort: "-capturedAt", ...as(ctx) }),
    payload.find({ collection: "reporting-files", where: { and: [byStory, mine] }, limit: 10, sort: "-capturedAt", select: { originalFilename: true, filename: true, capturedAt: true, createdAt: true, kind: true }, ...as(ctx) }),
    payload.find({ collection: "media", where: { and: [{ "capture.story": { equals: storyId } }, { uploadedBy: { equals: ctx.user.id } }] }, limit: 10, sort: "-createdAt", select: { filename: true, createdAt: true }, ...as(ctx) }),
    payload.find({ collection: "live-updates", where: { and: [byStory, { author: { equals: ctx.user.id } }] }, limit: 10, sort: "-publishedAt", ...as(ctx) })
  ]);
  const source = appointment && num(appointment.source)
    ? await payload.find({ collection: "sources", where: { id: { equals: num(appointment.source) } }, limit: 1, ...as(ctx) }).then((result) => result.docs[0] ?? null)
    : null;
  const recent: FieldRecent[] = [
    ...notes.docs.map((row) => ({ key: `note:${row.id}`, kind: "note" as const, text: row.text, at: row.capturedAt ?? row.createdAt })),
    ...files.docs.map((row) => ({ key: `file:${row.id}`, kind: "file" as const, text: row.originalFilename || row.filename || "File", at: row.capturedAt ?? row.createdAt })),
    ...media.docs.map((row) => ({ key: `media:${row.id}`, kind: "media" as const, text: row.filename ?? "Photo", at: row.createdAt })),
    ...live.docs.map((row) => ({ key: `live:${row.id}`, kind: "live" as const, text: [row.headline, lexicalToPlainText(row.body)].filter(Boolean).join(" — ").slice(0, 200), at: row.publishedAt ?? row.createdAt, state: row.state === "draft" ? "draft" as const : "published" as const }))
  ].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 20);
  return {
    story: {
      id: storyId, headline: story.headline || "Untitled story", live: gate.settings.mode === "live" && gate.settings.state === "live", published: gate.storyPublic,
      coverage: { mode: gate.settings.mode, state: gate.settings.state, startedAt: gate.settings.startedAt, endedAt: gate.settings.endedAt }
    },
    canPostLive: postLive,
    canPublishNow: postLive && gate.block === null,
    publishBlock: gate.block,
    canControl: atLeast(ctx.user, "editor"),
    appointment: appointment ? { id: appointment.id, title: appointment.title, startAt: appointment.scheduleMode === "exact" ? appointment.startAt ?? null : null, location: appointment.location ?? "", sourceId: source?.id ?? null, source: source?.label ?? null } : null,
    assignments: assignments.docs.map((row) => ({ id: row.id, title: row.title, type: row.type, deadline: row.deadline ?? null })),
    recent,
    timeZone: ctx.timeZone
  };
}

/** Stories the person works on, for Field's secondary "Find a story" (never every story in the newsroom). */
export async function fieldStorySearch(ctx: ScreenContext, query: string) {
  const text = query.trim().slice(0, 120);
  const scope = await storyScope(ctx.req);
  if (!scope || text.length < 2) return { stories: [] };
  const granted = await livePublisherStories(ctx.req);
  const ids = scope.all ? null : [...new Set([...scope.managed, ...scope.participant, ...granted])];
  if (ids && !ids.length) return { stories: [] };
  const found = await ctx.req.payload.find({
    collection: "stories", draft: true, limit: 10, sort: "-updatedAt", select: { headline: true },
    where: { and: [{ headline: { like: text } }, ...(ids ? [{ id: { in: ids } }] : [])] }, ...as(ctx)
  });
  const running = found.docs.length ? await ctx.req.payload.find({
    collection: "story-plans", overrideAccess: true, depth: 0, pagination: false, select: { story: true },
    where: { and: [{ story: { in: found.docs.map((story) => story.id) } }, { "liveCoverage.mode": { equals: "live" } }, { "liveCoverage.state": { equals: "live" } }] }
  }) : { docs: [] as Array<{ story?: unknown }> };
  const isLive = new Set(running.docs.map((plan) => num(plan.story)));
  return { stories: found.docs.map((story) => ({ id: story.id, headline: story.headline || "Untitled story", live: isLive.has(story.id) })) };
}

/**
 * Posts from the field. The reporter's explicit intent (`delivery`: "publish" or "desk") is frozen when they
 * tap, survives offline queues and retries, and is decided AGAIN here: it is published only if, at send time,
 * the Story is public, in Live mode, coverage is Live now and the person still holds the right. Otherwise it is
 * a draft for the live desk and the answer says why, so a stale queued "Publish now" can never go public after
 * coverage ended or a grant was removed. A missing intent is a desk draft. Idempotent on the client key: a
 * retried submission returns the first update and its real state.
 */
export async function fieldLivePost(ctx: ScreenContext, storyId: number, input: { text?: unknown; photoId?: unknown; clientKey?: unknown; queued?: unknown; delivery?: unknown }) {
  const scope = await storyScope(ctx.req);
  const publisher = await canPublishLive(ctx.req, storyId);
  if (!scopeManages(scope, storyId) && !scopeParticipates(scope, storyId) && !publisher) throw new APIError("You are not part of this story.", 403);
  const { payload } = ctx.req;
  const clientKey = validClientKey(input.clientKey);
  if (clientKey) {
    const existing = (await payload.find({ collection: "live-updates", where: { clientKey: { equals: clientKey } }, limit: 1, depth: 0, overrideAccess: true, req: ctx.req })).docs[0];
    if (existing) {
      if (String(relationId(existing.author)) !== String(ctx.user.id)) throw new APIError("That capture key is already in use.", 409);
      return { id: existing.id, status: existing.state === "published" ? "posted" as const : "sent-to-desk" as const, duplicate: true };
    }
  }
  try {
    const created = await createLiveUpdate(ctx, storyId, {
      text: input.text, photoId: input.photoId, ...(clientKey ? { clientKey } : {}), queued: input.queued === true, source: "field", wantsPublish: input.delivery === "publish"
    });
    return { ...created, duplicate: false };
  } catch (error) {
    if (clientKey && /23505|unique|duplicate/i.test(String((error as Error).message))) return fieldLivePost(ctx, storyId, input);
    throw error;
  }
}
