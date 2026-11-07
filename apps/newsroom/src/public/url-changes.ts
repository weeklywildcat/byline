import { recordStoryActivity } from "../newsroom/story-activity";
import { sql } from "@payloadcms/db-postgres";
import { CODE_ROUTED_PAGE_SLUGS, collapseRedirects, isCodeOwnedPublicPath, publicStoryPath } from "@byline/content";
import { APIError, type CollectionBeforeChangeHook, type CollectionAfterChangeHook, type PayloadRequest } from "payload";
import { relationId, requestUser } from "../access/user";
import { drizzleFor } from "../publication-media/state";
import { publicPagePaths } from "./page-paths";
import { publicationConfigFromGlobal, readPublishedPublication } from "./publication-config";

type Kind = "stories" | "pages" | "sections";
const reasons = { stories: "story-url-change", pages: "page-url-change", sections: "section-slug-change" } as const;
const key = (kind: Kind, id: unknown) => `bylinePaths:${kind}:${String(id)}`;

export async function lockPublicPaths(req: PayloadRequest) {
  // Serialize graph changes with public path changes, inside Payload's write transaction.
  await (await drizzleFor(req.payload, req)).execute(sql`select pg_advisory_xact_lock(461230118, 1)`);
}

export async function readRedirects(req: PayloadRequest) {
  return (await req.payload.find({ collection: "redirects", req, depth: 0, pagination: false, overrideAccess: true, sort: "id" })).docs;
}

export async function readPublicPaths(req: PayloadRequest, kind: Kind, id?: number): Promise<Map<number, string>> {
  if (kind === "pages") {
    const { docs } = await req.payload.find({
      collection: "pages", req, draft: false, depth: 0, pagination: false, overrideAccess: true,
      where: { _status: { equals: "published" } }, select: { slug: true, parent: true }
    });
    return publicPagePaths(docs);
  }

  const { docs } = await req.payload.find({
    collection: "stories", req, draft: false, depth: 0, pagination: false, overrideAccess: true,
    where: { and: [{ _status: { equals: "published" } }, ...(id === undefined ? [] : [kind === "sections" ? { section: { equals: id } } : { id: { equals: id } }])] },
    select: { slug: true, section: true, publishedAt: true }
  });
  if (!docs.length) return new Map();
  const ids = [...new Set(docs.map((story) => relationId(story.section)).filter((section) => section !== null))];
  const sections = ids.length ? (await req.payload.find({
    collection: "sections", req, depth: 0, pagination: false, overrideAccess: true,
    where: { id: { in: ids } }, select: { slug: true, hidden: true }
  })).docs : [];
  const sectionById = new Map(sections.filter((row) => !row.hidden).map((row) => [String(row.id), row.slug]));
  const { timezone } = publicationConfigFromGlobal(await readPublishedPublication(req.payload, req), 0);
  const paths = new Map(docs.map((row) => [row.id, publicStoryPath({
    slug: row.slug, sectionSlug: sectionById.get(String(relationId(row.section))), publishedAt: row.publishedAt, timeZone: timezone
  })]));
  return new Map([...paths].filter(([, path]) => path));
}

export function publicURLHooks(kind: Kind): { beforeChange: CollectionBeforeChangeHook; afterChange: CollectionAfterChangeHook } {
  return {
    beforeChange: async ({ req, data, originalDoc, operation }) => {
      if (req.context?.bylineImport === true) return data;
      if (kind === "sections" && (operation === "create" || !data.slug || data.slug === originalDoc?.slug)) return data;
      if (kind !== "sections" && data._status === "draft") return data;
      await lockPublicPaths(req);
      const id = originalDoc?.id;
      if (operation === "update" && id != null) {
        const paths = await readPublicPaths(req, kind, Number(id));
        if (kind === "sections" && !originalDoc?.hidden && originalDoc?.slug) paths.set(0, `/category/${originalDoc.slug}/`);
        req.context[key(kind, id)] = paths;
      }
      return data;
    },
    afterChange: async ({ req, doc, operation }) => {
      if (req.context?.bylineImport === true) return doc;
      const old = req.context[key(kind, doc.id)] as Map<number, string> | undefined;
      delete req.context[key(kind, doc.id)];
      if (!old && (operation !== "create" || kind === "sections" || doc._status !== "published")) return doc;
      let current: Map<number, string>;
      try {
        current = await readPublicPaths(req, kind, Number(doc.id));
      } catch (error) {
        throw new APIError((error as Error).message, 409);
      }
      if (kind === "sections" && !doc.hidden && doc.slug) current.set(0, `/category/${doc.slug}/`);
      await applyPublicPathMoves(req, kind, old ?? new Map(), current);
      return doc;
    }
  };
}

export async function applyPublicPathMoves(req: PayloadRequest, kind: Kind, old: Map<number, string>, current: Map<number, string>) {
  const changed = [...current].filter(([id, path]) => path !== old.get(id));
  if (!changed.length) return;
  const existing = await readRedirects(req);
  const byId = new Map(existing.map((row) => [row.id, row]));
  const aliases = new Map(collapseRedirects(existing).map((row) => [row.from, row]));
  const reclaimed = new Set<number>();
  for (const [id, path] of changed) {
    if (kind === "pages" && isCodeOwnedPublicPath(path) && !CODE_ROUTED_PAGE_SLUGS.some((slug) => path === `/${slug}/`)) {
      throw new APIError("This page address is reserved for the public site.", 409);
    }
    const alias = aliases.get(path);
    if (!alias) continue;
    if (alias.reason !== "manual" && alias.to === old.get(id)) reclaimed.add(alias.id);
    else throw new APIError(`The path ${path} is reserved by another redirect.`, 409);
  }
  const moves = changed.flatMap(([id, to]) => {
    const from = old.get(id);
    return from && !isCodeOwnedPublicPath(from) ? [{ from, to }] : [];
  });
  if (!moves.length) return;
  let all;
  try {
    all = collapseRedirects([...existing.filter((row) => !reclaimed.has(row.id)), ...moves.map((move) => ({
      ...move, id: 0, reason: reasons[kind], createdBy: Number(requestUser(req)?.id) || null
    }))]);
  } catch (error) {
    throw new APIError((error as Error).message, 409);
  }
  const opts = { req, overrideAccess: true, context: { bylineAutomaticRedirect: true }, depth: 0 } as const;
  for (const id of reclaimed) await req.payload.delete({ collection: "redirects", id, ...opts });
  for (const { id, from, to, reason, createdBy } of all) {
    if (!id) await req.payload.create({ collection: "redirects", data: { from, to, reason, createdBy }, ...opts });
    else if (byId.get(id)?.to !== to) {
      await req.payload.update({ collection: "redirects", id, data: { to }, ...opts });
    }
  }
  if (kind !== "pages") for (const [id] of changed) {
    if (old.has(id)) await recordStoryActivity(req, id, "url-changed");
  }
}

export async function rejectLiveRedirectSource(req: PayloadRequest, from: string) {
  if (isCodeOwnedPublicPath(from) || /^\/(?:author|coverage|category|tag)\//.test(from)) {
    throw new APIError("This path is reserved for the public site.", 409);
  }
  const [pages, stories] = await Promise.all([readPublicPaths(req, "pages"), readPublicPaths(req, "stories")]);
  if ([...pages.values(), ...stories.values()].includes(from)) throw new APIError("A published story or page already uses this address.", 409);
}

/** A published child cannot be left without its canonical parent path. */
export async function protectPageDescendants(req: PayloadRequest, id: number | string) {
  await lockPublicPaths(req);
  const pages = await readPublicPaths(req, "pages");
  const path = pages.get(Number(id));
  if (path && [...pages].some(([child, childPath]) => child !== Number(id) && childPath.startsWith(path))) {
    throw new APIError("Move or unpublish this page's published descendants first.", 409);
  }
}
