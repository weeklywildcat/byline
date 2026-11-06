import type { Where } from "payload";
import type { ScreenContext } from "./screen-models";

/**
 * When an unpublished story is next scheduled to publish: the host adapter into
 * the neutral `PlanningStory.publicationState`.
 *
 * Payload keeps scheduled publishing as queued jobs, so Byline neither adds a
 * `scheduledAt` field nor a table of its own. An upcoming schedule is a
 * `payload-jobs` row with `taskSlug: "schedulePublish"`, `waitUntil` in the
 * future, `input.doc` naming the document (its value is always a string) and
 * `input.type` of `publish` or `unpublish`. This is the query Payload's own
 * Schedule drawer builds (`buildUpcomingScheduleWhere`), read the same way:
 * through the database adapter, because jobs are system metadata that no
 * newsroom role is given collection access to.
 *
 * That makes the caller responsible for the access boundary, so this takes only
 * story ids the current screen has already read as the signed-in user, asks for
 * nothing else, and returns only `story id → waitUntil`. Raw jobs (input user,
 * errors, logs, queue) never leave this function.
 */
export async function scheduledPublicationsForStories(ctx: ScreenContext, storyIds: Array<number | string>): Promise<Map<number, string>> {
  const scheduled = new Map<number, string>();
  const ids = [...new Set(storyIds.map(String))];
  if (ids.length === 0) return scheduled;

  const where: Where = {
    and: [
      { taskSlug: { equals: "schedulePublish" } },
      { waitUntil: { greater_than: ctx.now } },
      // Not run, not running: a job that ran is no longer an upcoming event.
      { completedAt: { exists: false } },
      { "input.doc.relationTo": { equals: "stories" } },
      { "input.doc.value": { in: ids } }
    ]
  };
  const { docs } = await ctx.req.payload.db.find({ collection: "payload-jobs", where, limit: 0, sort: "waitUntil", pagination: false, req: ctx.req });

  for (const job of docs as Array<{ waitUntil?: string | Date | null; input?: unknown }>) {
    const input = job.input as { type?: string; doc?: { relationTo?: string; value?: unknown } } | null | undefined;
    // A job without a type publishes (Payload's own default); only a future `unpublish` is not a scheduled publication.
    if (input?.type === "unpublish") continue;
    const id = Number(input?.doc?.value);
    const at = job.waitUntil ? new Date(job.waitUntil) : null;
    if (!Number.isSafeInteger(id) || !at || Number.isNaN(at.getTime()) || at <= ctx.now) continue;
    const instant = at.toISOString();
    // Sorted by waitUntil, but the earliest wins whatever the order.
    const current = scheduled.get(id);
    if (current === undefined || instant < current) scheduled.set(id, instant);
  }
  return scheduled;
}
