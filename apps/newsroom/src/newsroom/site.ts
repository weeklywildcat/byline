import { APIError, commitTransaction, initTransaction, killTransaction, type Field } from "payload";
import { atLeast } from "../access/user";
import { isSlug, slugify } from "../domain/slug";
import { PUBLICATION_GLOBAL, Publication } from "../globals/Publication";
import { lockPublicPaths, readPublicPaths } from "../public/url-changes";
import type { ScreenContext } from "./screen-models";

const read = (ctx: ScreenContext) => ({ req: ctx.req, overrideAccess: false as const, depth: 0 });
function administrator(ctx: ScreenContext) {
  if (!atLeast(ctx.user, "administrator")) throw new APIError("Only administrators can manage the site.", 403);
}

type Fields = "text" | "textarea" | "number" | "checkbox" | "select" | "group" | "array";
export type SettingField = {
  name: string; label: string; type: Fields; description?: string; maxRows?: number; hasMany?: boolean;
  options?: { label: string; value: string }[]; children?: SettingField[]; defaultValue?: unknown;
};
const sentence = (name: string) => name.replace(/([A-Z])/g, " $1").replace(/^./, (letter) => letter.toUpperCase());

function describe(fields: Field[]): SettingField[] {
  return fields.flatMap((field) => {
    if (field.type === "row" || field.type === "collapsible") return describe(field.fields);
    if (!("name" in field) || !["text", "textarea", "number", "checkbox", "select", "group", "array"].includes(field.type)) return [];
    return [{
      name: field.name, type: field.type as Fields, label: typeof field.label === "string" ? field.label : sentence(field.name),
      description: field.admin && "description" in field.admin && typeof field.admin.description === "string" ? field.admin.description : undefined,
      ...(field.type === "select" ? { hasMany: field.hasMany, options: field.options.map((item) => typeof item === "string" ? { value: item, label: sentence(item) } : { value: item.value, label: typeof item.label === "string" ? item.label : sentence(item.value) }) } : {}),
      ...(field.type === "array" || field.type === "group" ? { children: describe(field.fields) } : {}),
      ...(field.type === "array" ? { maxRows: field.maxRows } : {}),
      ...("defaultValue" in field && typeof field.defaultValue !== "function" ? { defaultValue: field.defaultValue } : {})
    }];
  });
}

const fields = describe(Publication.fields);
function clean(fields: SettingField[], data: unknown): Record<string, unknown> {
  if (!data || typeof data !== "object" || Array.isArray(data)) return {};
  const row = data as Record<string, unknown>;
  return Object.fromEntries(fields.filter(({ name }) => Object.hasOwn(row, name)).map((field) => {
    const value = row[field.name];
    if (field.type === "group") return [field.name, clean(field.children!, value)];
    if (field.type === "array") return [field.name, Array.isArray(value) ? value.map((item) => clean(field.children!, item)) : []];
    return [field.name, value];
  }));
}

export async function publicationSettings(ctx: ScreenContext) {
  administrator(ctx);
  const [draft, published] = await Promise.all([
    ctx.req.payload.findGlobal({ slug: PUBLICATION_GLOBAL, draft: true, ...read(ctx) }),
    ctx.req.payload.findGlobal({ slug: PUBLICATION_GLOBAL, draft: false, ...read(ctx) })
  ]);
  return { fields, values: clean(fields, draft), revision: draft.updatedAt ?? null, hasPublished: published._status === "published", hasDraft: draft._status === "draft" && Boolean(draft.updatedAt) };
}

export async function savePublicationSettings(ctx: ScreenContext, input: { values?: unknown; expected?: unknown; publish?: unknown }) {
  administrator(ctx);
  const { req } = ctx;
  const started = await initTransaction(req);
  try {
    await lockPublicPaths(req);
    const current = await req.payload.findGlobal({ slug: PUBLICATION_GLOBAL, draft: true, ...read(ctx) });
    if (input.expected !== (current.updatedAt ?? null)) throw new APIError("Publication settings changed. Reload before saving.", 409);
    await req.payload.updateGlobal({ slug: PUBLICATION_GLOBAL, draft: input.publish !== true, data: { ...clean(fields, input.values), _status: input.publish === true ? "published" : "draft" }, ...read(ctx) });
    if (started) await commitTransaction(req);
    return publicationSettings(ctx);
  } catch (error) {
    if (started) await killTransaction(req);
    throw error;
  }
}

const groups = ["sections", "topics", "redirects", "pages"] as const;
export type SiteGroup = typeof groups[number];
export function siteGroup(value: unknown): SiteGroup {
  if (!groups.includes(value as SiteGroup)) throw new APIError("Unknown site view.", 404);
  return value as SiteGroup;
}

export async function siteRows(ctx: ScreenContext, collection: SiteGroup) {
  administrator(ctx);
  const { docs } = await ctx.req.payload.find({ collection, ...(collection === "pages" ? { draft: true } : {}), pagination: false, sort: collection === "redirects" ? "from" : collection === "pages" ? "title" : "name", ...read(ctx) });
  return { rows: docs.map((doc) => ({
    id: doc.id, revision: doc.updatedAt,
    title: "title" in doc ? doc.title : "name" in doc ? doc.name : doc.from,
    slug: "slug" in doc ? doc.slug : undefined,
    description: "description" in doc ? doc.description : undefined,
    hidden: "hidden" in doc && doc.hidden === true,
    reason: "reason" in doc ? doc.reason : undefined, to: "to" in doc ? doc.to : undefined,
    published: "_status" in doc && doc._status === "published"
  })) };
}

export async function sectionImpact(ctx: ScreenContext, id: number) {
  administrator(ctx);
  await ctx.req.payload.findByID({ collection: "sections", id, ...read(ctx), select: {} });
  return { stories: (await readPublicPaths(ctx.req, "sections", id)).size };
}

type SiteInput = { title?: unknown; slug?: unknown; description?: unknown; hidden?: unknown; to?: unknown; expected?: unknown; impact?: unknown };
export async function saveSiteRow(ctx: ScreenContext, collection: SiteGroup, input: SiteInput, id?: number, remove = false) {
  administrator(ctx);
  const { req } = ctx;
  const started = await initTransaction(req);
  const options = read(ctx);
  try {
    await lockPublicPaths(req);
    const current = id === undefined ? null : await req.payload.findByID({ collection, id, ...options });
    if (current && current.updatedAt !== input.expected) throw new APIError("This item changed. Reload it before saving.", 409);
    let saved;
    const title = typeof input.title === "string" ? input.title.trim() : "";
    if (remove) {
      if (collection !== "redirects" || !current || !id) throw new APIError("Only manual redirects can be removed here.", 400);
      await req.payload.delete({ collection, id, ...options });
    } else if (collection === "redirects") {
      const data = { from: title, to: typeof input.to === "string" ? input.to.trim() : "", reason: "manual" as const };
      saved = id ? await req.payload.update({ collection, id, data, overrideLock: false, ...options }) : await req.payload.create({ collection, data, ...options });
    } else if (collection === "pages") {
      if (id || !title) throw new APIError("Enter a title to create a page.", 400);
      saved = await req.payload.create({ collection, draft: true, data: { title }, ...options });
    } else {
      const slug = slugify(input.slug || title);
      if (!title || !isSlug(slug)) throw new APIError("Enter a name and a valid slug.", 400);
      if (collection === "sections" && current && "slug" in current && slug !== current.slug && id) {
        const count = (await readPublicPaths(req, collection, id)).size;
        if (count > 0 && input.impact !== count) throw new APIError("Review the affected public Story URLs before changing this slug.", 409);
      }
      const data = { name: title, slug, description: typeof input.description === "string" ? input.description : "", ...(collection === "sections" ? { hidden: input.hidden === true } : {}) };
      saved = id ? await req.payload.update({ collection, id, data, overrideLock: false, ...options }) : await req.payload.create({ collection, data, ...options });
    }
    if (started) await commitTransaction(req);
    return { id: saved?.id ?? id };
  } catch (error) {
    if (started) await killTransaction(req);
    throw error;
  }
}

export type PublicationSettings = Awaited<ReturnType<typeof publicationSettings>>;
export type SiteRows = Awaited<ReturnType<typeof siteRows>>;
