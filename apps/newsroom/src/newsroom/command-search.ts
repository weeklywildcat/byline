import { atLeast, relationId } from "../access/user";
import { mediaSearchWhere } from "./media-search";
import type { ScreenContext } from "./screen-models";

/** One result. A task or source says where it lives (`storyId`, `collectionId`) so the palette opens it there. */
export type CommandSearchEntry = { id: number; title: string; detail?: string; storyId?: number | null; collectionId?: number | null };

export type CommandSearchResult = {
  people: CommandSearchEntry[];
  media: CommandSearchEntry[];
  datasets: CommandSearchEntry[];
  projects: CommandSearchEntry[];
  tasks: CommandSearchEntry[];
  sources: CommandSearchEntry[];
};

const EMPTY: CommandSearchResult = { people: [], media: [], datasets: [], projects: [], tasks: [], sources: [] };

const idOf = (value: unknown): number | null => {
  const id = Number(relationId(value as never));
  return Number.isSafeInteger(id) && id > 0 ? id : null;
};

/**
 * ⌘K's search beyond stories and collections: people (editors), media,
 * Byline Data's datasets and projects, and the tasks and sources on work the
 * reader can see. Every read is the reader's own (`overrideAccess: false`)
 * and matches a name or title only: never a note, a brief or a source's
 * private details. A collection that cannot be read narrows the results
 * instead of failing them.
 */
export async function commandSearch(ctx: ScreenContext, query: string): Promise<CommandSearchResult> {
  const search = query.trim().slice(0, 120);
  if (search.length < 2) return EMPTY;
  const read = { req: ctx.req, overrideAccess: false as const, depth: 0, limit: 6 };
  const none = { docs: [] as never[] };
  const [people, media, datasets, projects, tasks, sources] = await Promise.all([
    atLeast(ctx.user, "editor") ? ctx.req.payload.find({
      collection: "people", where: { or: [{ name: { like: search } }, { newsroomRole: { like: search } }] },
      select: { name: true, newsroomRole: true }, sort: "name", ...read
    }) : none,
    ctx.req.payload.find({
      collection: "media", where: mediaSearchWhere(search), select: { filename: true, alt: true, credit: true, creator: true },
      sort: "-updatedAt", ...read
    }),
    ctx.req.payload.find({ collection: "data-datasets", where: { title: { like: search } }, select: { title: true, key: true }, sort: "title", ...read }).catch(() => none),
    ctx.req.payload.find({ collection: "data-projects", where: { title: { like: search } }, select: { title: true, slug: true }, sort: "title", ...read }).catch(() => none),
    ctx.req.payload.find({ collection: "tasks", where: { title: { like: search } }, select: { title: true, state: true, story: true, collection: true }, sort: "-updatedAt", ...read }).catch(() => none),
    ctx.req.payload.find({ collection: "sources", where: { label: { like: search } }, select: { label: true, role: true, story: true }, sort: "label", ...read }).catch(() => none)
  ]);
  return {
    people: people.docs.map((row) => ({ id: row.id, title: row.name, detail: row.newsroomRole ?? "" })),
    media: media.docs.map((row) => ({ id: row.id, title: row.filename ?? "Media file", detail: row.credit || row.creator || row.alt || "" })),
    datasets: datasets.docs.map((row) => ({ id: row.id, title: row.title, detail: row.key ?? "" })),
    projects: projects.docs.map((row) => ({ id: row.id, title: row.title, detail: row.slug ? `/${row.slug}` : "" })),
    tasks: tasks.docs.map((row) => ({ id: row.id, title: row.title, detail: row.state === "completed" ? "Completed task" : "Open task", storyId: idOf(row.story), collectionId: idOf(row.collection) })),
    sources: sources.docs.map((row) => ({ id: row.id, title: row.label, detail: row.role ?? "", storyId: idOf(row.story) }))
  };
}
