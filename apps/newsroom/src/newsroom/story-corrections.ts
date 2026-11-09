import { sql } from "@payloadcms/db-postgres";
import { publicationLocalDateTime } from "@byline/content";
import { APIError, commitTransaction, initTransaction, killTransaction } from "payload";
import { atLeast, sameId } from "../access/user";
import { localToInstant } from "../domain/dates";
import { CORRECTION_TYPES } from "../domain/vocabulary";
import { drizzleFor } from "../publication-media/state";
import type { Correction } from "../payload-types";
import type { ScreenContext } from "./screen-models";

const options = (ctx: ScreenContext) => ({ req: ctx.req, overrideAccess: false as const, depth: 0 });
async function assertStory(ctx: ScreenContext, id: number) {
  if (!atLeast(ctx.user, "editor")) throw new APIError("Only editors can manage corrections.", 403);
  await ctx.req.payload.findByID({ collection: "stories", id, ...options(ctx), select: {} });
}

export async function storyCorrections(ctx: ScreenContext, story: number) {
  await assertStory(ctx, story);
  const { docs } = await ctx.req.payload.find({
    collection: "corrections", where: { story: { equals: story } }, pagination: false, sort: "-date", ...options(ctx)
  });
  return { corrections: docs.map(({ id, type, text, date, publishedAt, createdAt, updatedAt, createdBy }) => ({ id, type, text, date, publishedAt, createdAt, updatedAt, createdBy })) };
}

type Input = { type?: unknown; text?: unknown; date?: unknown; publishedAt?: unknown; expected?: unknown };
function localTime(ctx: ScreenContext, value: unknown) {
  try {
    if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) return new Date(value).toISOString();
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(value)) throw new Error();
    const instant = localToInstant(value, ctx.timeZone);
    if (!publicationLocalDateTime(instant, ctx.timeZone).startsWith(value)) throw new Error();
    return instant;
  } catch {
    throw new APIError("Enter a date and time in the newsroom timezone.", 400);
  }
}

export async function changeCorrection(ctx: ScreenContext, story: number, id: number | null, input: Input, remove = false) {
  await assertStory(ctx, story);
  const { req } = ctx;
  const { payload } = req;
  const started = await initTransaction(req);
  try {
    if (id !== null) {
      const db = await drizzleFor(payload, req);
      await db.execute(sql`select id from corrections where id = ${id} and story_id = ${story} for update`);
      const row = await payload.findByID({ collection: "corrections", id, ...options(ctx) });
      if (!sameId(row.story, story)) throw new APIError("Correction not found.", 404);
      if (input.expected !== row.updatedAt) throw new APIError("This correction changed. Reload it before saving.", 409);
    }
    if (remove) {
      if (id === null) throw new APIError("Choose a correction to remove.", 400);
      await payload.delete({ collection: "corrections", id, ...options(ctx) });
    } else {
      const type = input.type as Correction["type"];
      const text = typeof input.text === "string" ? input.text.trim() : "";
      if (!CORRECTION_TYPES.includes(type) || !text || text.length > 2000) throw new APIError("Choose a notice type and enter up to 2,000 characters.", 400);
      const data = { type, text, date: localTime(ctx, input.date), publishedAt: input.publishedAt ? localTime(ctx, input.publishedAt) : null };
      if (id === null) await payload.create({ collection: "corrections", data: { story, ...data }, ...options(ctx) });
      else await payload.update({ collection: "corrections", id, data, overrideLock: false, ...options(ctx) });
    }
    if (started) await commitTransaction(req);
    return storyCorrections(ctx, story);
  } catch (error) {
    if (started) await killTransaction(req);
    throw error;
  }
}

export type StoryCorrections = Awaited<ReturnType<typeof storyCorrections>>;
