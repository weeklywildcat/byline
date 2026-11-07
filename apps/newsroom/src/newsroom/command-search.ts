import { atLeast } from "../access/user";
import { mediaSearchWhere } from "./media-search";
import type { ScreenContext } from "./screen-models";

export async function commandSearch(ctx: ScreenContext, query: string) {
  const search = query.trim().slice(0, 120);
  if (search.length < 2) return { people: [], media: [] };
  const read = { req: ctx.req, overrideAccess: false as const, depth: 0, limit: 6 };
  const [people, media] = await Promise.all([
    atLeast(ctx.user, "editor") ? ctx.req.payload.find({
      collection: "people", where: { or: [{ name: { like: search } }, { newsroomRole: { like: search } }] },
      select: { name: true, newsroomRole: true }, sort: "name", ...read
    }) : { docs: [] },
    ctx.req.payload.find({
      collection: "media", where: mediaSearchWhere(search), select: { filename: true, alt: true, credit: true, creator: true },
      sort: "-updatedAt", ...read
    })
  ]);
  return {
    people: people.docs.map((row) => ({ id: row.id, title: row.name, detail: row.newsroomRole ?? "" })),
    media: media.docs.map((row) => ({ id: row.id, title: row.filename ?? "Media file", detail: row.credit || row.creator || row.alt || "" }))
  };
}
