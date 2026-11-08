import { sql } from "@payloadcms/db-postgres";
import { collectMediaUsageLabels } from "@byline/editor/normalize";
import { APIError, type CollectionBeforeDeleteHook, type PayloadRequest } from "payload";
import { scopeManages, storyScope } from "../access/story-context";
import { drizzleFor } from "../publication-media/state";
import type { ScreenContext } from "./screen-models";

type Use = { id: number; title: string; published: boolean; draft: boolean; lead: boolean; roles: string[] };

async function candidates(req: PayloadRequest, media: number, history: boolean) {
  const db = await drizzleFor(req.payload, req);
  // Only a coarse candidate filter. The editor's canonical extraction below
  // decides whether the value is actually a Media relationship.
  const token = `(^|[^0-9])${media}([^0-9]|$)`;
  const { rows } = await db.execute(sql`
    select id, headline, body, featured_media_id, _status = 'published' as published, false as draft
    from stories
    where (${history} or deleted_at is null) and
          (featured_media_id = ${media} or (content_format <> 'legacy-html' and body::text ~ ${token}))
    union all
    select parent_id as id, version_headline as headline, version_body as body,
           version_featured_media_id as featured_media_id, false as published, true as draft
    from _stories_v v
    where (${history} or (v.latest is true and v.version_deleted_at is null
        and exists (select 1 from stories s where s.id = v.parent_id and s.deleted_at is null))) and
          (version_featured_media_id = ${media} or (version_content_format <> 'legacy-html' and version_body::text ~ ${token}))
  `);
  return rows.flatMap((row): Use[] => {
    const roles = collectMediaUsageLabels(row.body, media);
    const lead = Number(row.featured_media_id) === media;
    if (!roles.length && !lead) return [];
    return [{ id: Number(row.id), title: String(row.headline || "Untitled story"), published: row.published === true, draft: row.draft === true, lead, roles }];
  });
}

export async function storyMediaUses(ctx: ScreenContext, media: number) {
  const scope = await storyScope(ctx.req);
  const hits = await candidates(ctx.req, media, false);
  const readable = new Map<number, { id: number; title: string; lead: boolean; roles: Set<string> }>();
  const all = new Set(hits.map((row) => row.id));
  for (const hit of hits) {
    if (!hit.published && !scopeManages(scope, hit.id)) continue;
    const use = readable.get(hit.id) ?? { id: hit.id, title: hit.title, lead: false, roles: new Set<string>() };
    if (hit.draft) use.title = hit.title;
    use.lead ||= hit.lead;
    for (const role of hit.roles) use.roles.add(role);
    readable.set(hit.id, use);
  }
  return { readable: [...readable.values()], total: all.size };
}

export const protectStoryMedia: CollectionBeforeDeleteHook = async ({ req, id }) => {
  if ((await candidates(req, Number(id), true)).length) {
    throw new APIError("This file is linked from a Story or a retained version. It cannot be deleted while that reference exists.", 409);
  }
};
