import { sql } from "@payloadcms/db-postgres";
import type { ArticleNotesResponse, ArticleNotesSummary } from "@byline/newsroom-screens/story/notes-model";
import { APIError, commitTransaction, initTransaction, killTransaction } from "payload";
import { scopeManages, scopeParticipates, storyScope } from "../access/story-context";
import { relationId, sameId } from "../access/user";
import { drizzleFor } from "../publication-media/state";
import type { ScreenContext } from "./screen-models";

const read = (ctx: ScreenContext) => ({ req: ctx.req, overrideAccess: false as const, depth: 0 });
async function authorize(ctx: ScreenContext, id: number) {
  const scope = await storyScope(ctx.req);
  const manager = scopeManages(scope, id);
  if (!manager && !scopeParticipates(scope, id)) throw new APIError("You are not part of this story.", 403);
  await ctx.req.payload.findByID({ collection: "stories", id, select: {}, ...read(ctx) });
  return manager;
}

export async function storyNoteSummary(ctx: ScreenContext, id: number): Promise<ArticleNotesSummary> {
  const { payload } = ctx.req;
  const story = { story: { equals: id } };
  const [open, resolved] = await Promise.all([
    payload.count({ collection: "story-notes", where: { and: [story, { resolved: { not_equals: true } }] }, ...read(ctx) }),
    payload.count({ collection: "story-notes", where: { and: [story, { resolved: { equals: true } }] }, ...read(ctx) })
  ]);
  return { kind: "story", available: true, canView: true, openCount: open.totalDocs, resolvedCount: resolved.totalDocs, editUrl: `${ctx.admin}/collections/stories/${id}?tab=plan#story-notes` };
}

export async function storyNotes(ctx: ScreenContext, id: number, resolved: boolean, page: number) {
  const manager = await authorize(ctx, id);
  const { payload } = ctx.req;
  const [summary, notes] = await Promise.all([
    storyNoteSummary(ctx, id),
    payload.find({ collection: "story-notes", where: { and: [{ story: { equals: id } }, { resolved: resolved ? { equals: true } : { not_equals: true } }] }, limit: 15, page, sort: "-updatedAt", ...read(ctx) })
  ]);
  const ids = [...new Set(notes.docs.flatMap((note) => [note.author, ...(note.replies ?? []).map((reply) => reply.author)]).map(relationId).filter((actor) => actor !== null))];
  const users = ids.length ? (await payload.find({ collection: "users", where: { id: { in: ids } }, select: { name: true }, pagination: false, ...read(ctx) })).docs : [];
  const names = new Map(users.map((user) => [user.id, user.name]));
  const author = (id: unknown) => ({ id: Number(relationId(id)) || 0, name: names.get(Number(relationId(id))) ?? "Former newsroom member" });
  return {
    summary, hasNextPage: notes.hasNextPage,
    threads: notes.docs.map((note) => ({
      id: note.id, text: note.text, author: author(note.author), createdAt: note.createdAt, updatedAt: note.updatedAt, resolved: note.resolved === true,
      canResolve: manager || sameId(note.author, ctx.user.id),
      replies: (note.replies ?? []).map((reply) => ({ id: reply.id, text: reply.text, at: reply.at, author: author(reply.author) }))
    }))
  };
}

export async function storyNotePreviews(ctx: ScreenContext, id: number): Promise<ArticleNotesResponse> {
  const { summary, threads } = await storyNotes(ctx, id, false, 1);
  return { summary, open: threads.slice(0, 3).map(({ id, author, createdAt, updatedAt, text, replies }) => ({ id, author, createdAt, updatedAt, excerpt: text.slice(0, 220), replyCount: replies.length })) };
}

export async function changeStoryNote(ctx: ScreenContext, id: number, noteId: number | null, input: { text?: unknown; resolved?: unknown; expected?: unknown }) {
  const manager = await authorize(ctx, id);
  const { req } = ctx;
  const { payload } = req;
  const actor = Number(ctx.user.id);
  const text = typeof input.text === "string" ? input.text.trim() : "";
  if ((noteId === null || input.resolved === undefined) && (!text || text.length > 4000)) throw new APIError("Enter a note of 1 to 4,000 characters.", 400);
  const opts = { req, overrideAccess: true as const, depth: 0 };
  if (noteId === null) {
    await payload.create({ collection: "story-notes", data: { story: id, author: actor, text, resolved: false }, ...opts });
    return { saved: true };
  }
  const started = await initTransaction(req);
  try {
    await (await drizzleFor(payload, req)).execute(sql`select id from story_notes where id = ${noteId} and story_id = ${id} for update`);
    const note = await payload.findByID({ collection: "story-notes", id: noteId, ...read(ctx) });
    if (!sameId(note.story, id)) throw new APIError("Note not found.", 404);
    if (typeof input.resolved === "boolean") {
      if (!manager && !sameId(note.author, actor)) throw new APIError("Only the author or a story manager can resolve this note.", 403);
      if (input.expected !== note.updatedAt) throw new APIError("This note changed. Reload it before saving.", 409);
      await payload.update({ collection: "story-notes", id: noteId, data: { resolved: input.resolved }, ...opts });
    } else {
      if (note.resolved) throw new APIError("Reopen this note before replying.", 409);
      await payload.update({ collection: "story-notes", id: noteId, data: { replies: [...(note.replies ?? []), { author: actor, text, at: ctx.now.toISOString() }] }, ...opts });
    }
    if (started) await commitTransaction(req);
    return { saved: true };
  } catch (error) {
    if (started) await killTransaction(req);
    throw error;
  }
}
export type StoryNotes = Awaited<ReturnType<typeof storyNotes>>;
