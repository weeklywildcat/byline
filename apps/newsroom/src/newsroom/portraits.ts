import { relationId } from "../access/user";
import type { Media } from "../payload-types";
import type { ScreenContext } from "./screen-models";

export type PortraitDoc = Pick<Media, "id" | "mimeType" | "sizes">;

/**
 * The Media rows behind people's `portrait`, read as the signed-in user, so a
 * portrait the viewer can't read simply has no picture.
 */
export async function portraits(ctx: ScreenContext, docs: { portrait?: unknown }[]): Promise<Map<number, PortraitDoc>> {
  const ids = [...new Set(docs.map((doc) => Number(relationId(doc.portrait))).filter((id) => id > 0))];
  if (!ids.length) return new Map();
  const found = await ctx.req.payload.find({
    collection: "media", where: { id: { in: ids } }, select: { sizes: true, mimeType: true },
    depth: 0, pagination: false, req: ctx.req, overrideAccess: false
  });
  return new Map(found.docs.map((doc) => [doc.id, doc]));
}

/**
 * The picture shown beside a name: the private `library` rendition behind a
 * same-origin authenticated Media route. Never relays a stored URL, and a
 * portrait that isn't an image yields none (a profile shows a photo or nothing).
 */
export function portraitUrl(api: string, asset: PortraitDoc | undefined): string | null {
  const filename = asset?.mimeType?.startsWith("image/") ? asset.sizes?.library?.filename : null;
  return filename && filename !== "." && filename !== ".." ? `${api}/media/file/${encodeURIComponent(filename)}` : null;
}

/** Person id → avatar URL, for the people (with `portrait`) that have a readable picture. */
export async function personAvatarUrls(ctx: ScreenContext, persons: { id: number; portrait?: unknown }[]): Promise<Map<number, string>> {
  const media = await portraits(ctx, persons);
  const api = ctx.req.payload.config.routes.api;
  const urls = new Map<number, string>();
  for (const person of persons) {
    const url = portraitUrl(api, media.get(Number(relationId(person.portrait))));
    if (url) urls.set(person.id, url);
  }
  return urls;
}

/** Account id → avatar URL through each account's linked byline person. */
export async function userAvatarUrls(ctx: ScreenContext, users: { id: number; linkedPerson?: unknown }[]): Promise<Map<number, string>> {
  const linked = users.flatMap((user) => { const person = relationId(user.linkedPerson); return person === null ? [] : [[user.id, Number(person)] as const]; });
  if (!linked.length) return new Map();
  const found = await ctx.req.payload.find({
    collection: "people", where: { id: { in: [...new Set(linked.map(([, person]) => person))] } }, select: { portrait: true },
    depth: 0, pagination: false, req: ctx.req, overrideAccess: false
  });
  const byPerson = await personAvatarUrls(ctx, found.docs);
  return new Map(linked.flatMap(([user, person]) => byPerson.has(person) ? [[user, byPerson.get(person)!] as const] : []));
}
