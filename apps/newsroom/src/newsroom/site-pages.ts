import { APIError } from "payload";
import { atLeast, relationId } from "../access/user";
import { publicPagePaths } from "../public/page-paths";
import { publicationConfigFromGlobal, readPublishedPublication } from "../public/publication-config";
import { scheduledPublicationsForStories } from "./scheduled-publication";
import type { ScreenContext } from "./screen-models";

async function records(ctx: ScreenContext, id: number) {
  if (!atLeast(ctx.user, "administrator")) throw new APIError("Only administrators can manage pages.", 403);
  const { req } = ctx;
  const read = { depth: 0, overrideAccess: false as const, req };
  const [page, published] = await Promise.all([
    req.payload.findByID({ collection: "pages", id, draft: true, ...read }),
    req.payload.find({ collection: "pages", draft: false, where: { _status: { equals: "published" } }, select: { title: true, slug: true, parent: true }, pagination: false, ...read })
  ]);
  const paths = publicPagePaths(published.docs);
  return { page, published: published.docs, paths };
}

export async function pageContext(ctx: ScreenContext, id: number) {
  const { req } = ctx;
  const { published, paths } = await records(ctx, id);
  const [config, scheduled, versions] = await Promise.all([
    readPublishedPublication(req.payload, req),
    scheduledPublicationsForStories(ctx, [id], "pages"),
    req.payload.findVersions({ collection: "pages", where: { parent: { equals: id } }, limit: 30, sort: "-updatedAt", depth: 0, overrideAccess: false, req, select: { autosave: true, updatedAt: true, version: { title: true, _status: true } } })
  ]);
  return {
    path: paths.get(id) ?? "", publicSite: publicationConfigFromGlobal(config, 0).urls.publicSite.replace(/\/+$/, ""),
    parents: published.filter((row) => row.id !== id && !(paths.get(id) && paths.get(row.id)?.startsWith(paths.get(id)!))).map((row) => ({ id: row.id, label: row.title, path: paths.get(row.id)! })),
    scheduledAt: scheduled.get(id) ?? null,
    versions: versions.docs.map((row) => ({ id: row.id, title: row.version.title, at: row.updatedAt, published: row.version._status === "published", autosave: (row as { autosave?: boolean }).autosave === true }))
  };
}

export async function assertPageReadyToSchedule(ctx: ScreenContext, id: number, confirmed: unknown) {
  const { page, published, paths } = await records(ctx, id);
  if (!page.title.trim() || !page.slug) throw new APIError("Enter a title and slug before scheduling this page.", 400);
  let next: string | undefined;
  try {
    next = publicPagePaths([...published.filter((row) => row.id !== id), { id, slug: page.slug, parent: relationId(page.parent) }]).get(id);
  } catch {
    throw new APIError("Choose a published parent outside this page's descendants.", 400);
  }
  if (paths.has(id) && next !== paths.get(id) && confirmed !== next) throw new APIError("Review the changed public URL before scheduling.", 409);
}

export type PageContext = Awaited<ReturnType<typeof pageContext>>;
