import { sql } from "@payloadcms/db-postgres";
import { APIError, type CollectionBeforeDeleteHook, type PayloadRequest } from "payload";
import { drizzleFor } from "../publication-media/state";
import type { SurveyDefinition } from "./engine/types";

export function draftMediaIds(draft: SurveyDefinition): number[] {
  return [...new Set(draft.lists.flatMap(({ choices }) => choices.flatMap(({ image }) => image?.mediaId ? [image.mediaId] : [])))].sort((a, b) => a - b);
}

/** Coordinate references with deletion. Publishing also holds the rendition and metadata stable until commit. */
export async function lockPollMediaReferences(req: PayloadRequest, draft: SurveyDefinition, publishing = false) {
  const ids = draftMediaIds(draft);
  if (!ids.length) return;
  const db = await drizzleFor(req.payload, req);
  const { rows } = await db.execute(sql`
    select id from media where id in (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})
    order by id ${publishing ? sql`for share` : sql`for key share`}
  `);
  if (!publishing && rows.length !== ids.length) throw new APIError("A choice image no longer exists in Media. Replace it or remove it before saving.", 422);
}

export async function pollMediaUses(req: PayloadRequest, mediaId: number, readable: boolean) {
  const db = await drizzleFor(req.payload, req);
  const reference = JSON.stringify({ lists: [{ choices: [{ image: { mediaId } }] }] });
  const { rows } = await db.execute(sql`
    select id, bool_or(draft) as draft, bool_or(published) as published
    from (
      select id, true as draft, false as published from poll_surveys where draft @> ${reference}::jsonb
      union all
      select survey_id as id, false as draft, true as published from poll_versions where definition @> ${reference}::jsonb
    ) mentions group by id
  `);
  if (!readable || !rows.length) return { total: rows.length, readable: [] };
  const found = await req.payload.find({
    collection: "poll-surveys", where: { id: { in: rows.map(({ id }) => Number(id)) } }, select: { title: true },
    req, overrideAccess: false, depth: 0, pagination: false
  });
  const byId = new Map(rows.map((row) => [Number(row.id), row]));
  return {
    total: rows.length,
    readable: found.docs.map(({ id, title }) => ({ id, title, draft: byId.get(id)?.draft === true, published: byId.get(id)?.published === true }))
  };
}

export const protectPollMedia: CollectionBeforeDeleteHook = async ({ req, id }) => {
  const db = await drizzleFor(req.payload, req);
  await db.execute(sql`select id from media where id = ${Number(id)} for update`);
  if ((await pollMediaUses(req, Number(id), false)).total) {
    throw new APIError("This image is used by a Poll draft or a published Poll version.", 409);
  }
};
