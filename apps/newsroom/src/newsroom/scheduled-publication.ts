import { assertPageReadyToSchedule } from "./site-pages";
import { recordStoryActivity } from "./story-activity";
import { sql } from "@payloadcms/db-postgres";
import { publicationLocalMinute } from "@byline/content";
import { APIError, commitTransaction, initTransaction, killTransaction, type Where } from "payload";
import { atLeast } from "../access/user";
import { localToInstant } from "../domain/dates";
import { drizzleFor } from "../publication-media/state";
import { assertStoryReadyToSchedule } from "./story-readiness";
import type { ScreenContext } from "./screen-models";

function upcomingJobs(ids: string[], now: Date, collection: "stories" | "pages" = "stories"): Where {
  return {
    and: [
      { taskSlug: { equals: "schedulePublish" } },
      { waitUntil: { greater_than: now } },
      { completedAt: { exists: false } },
      { hasError: { not_equals: true } },
      { processing: { not_equals: true } },
      { "input.doc.relationTo": { equals: collection } },
      { "input.doc.value": { in: ids } },
      { or: [{ "input.type": { equals: "publish" } }, { "input.type": { exists: false } }] }
    ]
  };
}

/** Reads Payload's native schedule. Call only with Stories already checked for read access. */
export async function scheduledPublicationsForStories(ctx: ScreenContext, storyIds: Array<number | string>, collection: "stories" | "pages" = "stories"): Promise<Map<number, string>> {
  const scheduled = new Map<number, string>();
  const ids = [...new Set(storyIds.map(String))];
  if (ids.length === 0) return scheduled;
  const { docs } = await ctx.req.payload.db.find({
    collection: "payload-jobs", where: upcomingJobs(ids, ctx.now, collection), limit: 0, sort: "waitUntil", pagination: false, req: ctx.req
  });
  for (const job of docs as Array<{ waitUntil?: string | Date | null; input?: unknown }>) {
    const input = job.input as { doc?: { value?: unknown } } | null;
    const id = Number(input?.doc?.value);
    const at = job.waitUntil ? new Date(job.waitUntil) : null;
    if (Number.isSafeInteger(id) && at && at > ctx.now && !scheduled.has(id)) scheduled.set(id, at.toISOString());
  }
  return scheduled;
}

/** A focused, editor-only mutation over Payload's native schedulePublish task. */
export async function setScheduledPublication(ctx: ScreenContext, storyId: number, input: { at?: unknown; expected?: unknown; confirmedPath?: unknown }, collection: "stories" | "pages" = "stories") {
  if (!atLeast(ctx.user, "editor")) throw new APIError("Only editors can schedule publication.", 403);
  if (collection === "pages" && !atLeast(ctx.user, "administrator")) throw new APIError("Only administrators can schedule pages.", 403);
  const { req } = ctx;
  const { payload } = req;
  const started = await initTransaction(req);
  try {
    await (await drizzleFor(payload, req)).execute(sql`select pg_advisory_xact_lock(${collection === "pages" ? 461230121 : 461230119}, ${storyId})`);
    await payload.findByID({ collection, id: storyId, draft: true, depth: 0, overrideAccess: false, req, select: {} });
    const scheduled = await scheduledPublicationsForStories(ctx, [storyId], collection);
    if ((scheduled.get(storyId) ?? null) !== input.expected) throw new APIError("The schedule changed. Refresh and try again.", 409);
    let at: Date | null = null;
    if (input.at !== null) {
      try {
        if (typeof input.at !== "string") throw new Error();
        at = new Date(localToInstant(input.at, ctx.timeZone));
        if (at <= ctx.now || publicationLocalMinute(at, ctx.timeZone) !== input.at) throw new Error();
      } catch {
        throw new APIError("Choose a valid future date and time in the newsroom timezone.", 400);
      }
      if (collection === "stories") {
        const story = await payload.findByID({ collection, id: storyId, draft: true, depth: 0, overrideAccess: false, req });
        await assertStoryReadyToSchedule(ctx, story, input.confirmedPath);
      } else {
        await assertPageReadyToSchedule(ctx, storyId, input.confirmedPath);
      }
    }
    // Cancellation is constrained to this Story's pending publication jobs.
    if (scheduled.has(storyId)) await payload.jobs.cancel({ req, where: upcomingJobs([String(storyId)], ctx.now, collection) });
    if (at) {
      // Native ScheduleDrawer stores the polymorphic document value as a string in job JSON.
      await payload.jobs.queue({
        task: "schedulePublish",
        req,
        waitUntil: at,
        input: { type: "publish", doc: { relationTo: collection, value: String(storyId) as unknown as number }, user: { relationTo: "users", value: Number(ctx.user.id) } }
      });
    }
    if (collection === "stories" && (at || scheduled.has(storyId))) await recordStoryActivity(req, storyId, at ? scheduled.has(storyId) ? "publication-rescheduled" : "publication-scheduled" : "publication-cancelled");
    if (started) await commitTransaction(req);
    return { scheduledAt: at?.toISOString() ?? null };
  } catch (error) {
    if (started) await killTransaction(req);
    throw error;
  }
}


/**
 * Move a Story to Payload Trash as one editor action. The publication-schedule
 * lock prevents a schedule change racing with deletion; any pending native
 * schedulePublish job is cancelled before the Story is soft-deleted.
 */
export async function trashStory(ctx: ScreenContext, storyId: number) {
  if (!atLeast(ctx.user, "editor")) throw new APIError("Only editors can move stories to Trash.", 403);
  const { req } = ctx;
  const { payload } = req;
  const started = await initTransaction(req);
  try {
    await (await drizzleFor(payload, req)).execute(sql`select pg_advisory_xact_lock(461230119, ${storyId})`);
    const story = await payload.findByID({
      collection: "stories",
      id: storyId,
      draft: true,
      depth: 0,
      overrideAccess: false,
      req
    });
    const scheduled = await scheduledPublicationsForStories(ctx, [storyId]);
    if (scheduled.has(storyId)) {
      await payload.jobs.cancel({ req, where: upcomingJobs([String(storyId)], ctx.now) });
      await recordStoryActivity(req, storyId, "publication-cancelled");
    }
    const deletedAt = ctx.now.toISOString();
    await payload.update({
      collection: "stories",
      id: storyId,
      data: { deletedAt },
      depth: 0,
      overrideAccess: false,
      req
    });
    if (started) await commitTransaction(req);
    return {
      id: storyId,
      deletedAt,
      cancelledScheduledPublication: scheduled.has(storyId)
    };
  } catch (error) {
    if (started) await killTransaction(req);
    throw error;
  }
}
