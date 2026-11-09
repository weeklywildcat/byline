import type { LiveCoverage } from "@byline/core";
import { APIError, type Payload, type Where } from "payload";
import { scopeManages, scopeParticipates, storyScope } from "../access/story-context";
import { relationId } from "../access/user";
import { canPublishLive } from "../access/live-context";
import { PreparedMediaCatalog } from "../public/snapshot/media";
import { liveCoverageProjection, readLiveUpdates } from "../public/snapshot/live";
import { lexicalToPlainText, LIVE_TEXT_MAX, plainTextToLexical } from "./live-text";
import type { ScreenContext } from "./screen-models";

/**
 * The live desk: posting, editing, pinning, publishing and removing a story's
 * live updates, and the published-only feed the Worker serves between builds.
 *
 * Reads and writes go through the `live-updates` collection as the signed-in
 * person (`overrideAccess: false`), so its access and publishing rules (staff
 * write drafts; an editor publishes; pinning replaces the previous pin) are the
 * collection's, never re-implemented here. See docs/live-coverage.md.
 */

export type LiveDeskUpdate = {
  id: number;
  title: string;
  text: string;
  state: "draft" | "published";
  pinned: boolean;
  publishedAt: string;
  updatedAt: string;
  author: { id: number; name: string; avatarUrl: string | null } | null;
  photo: { id: number; alt: string; previewUrl: string | null } | null;
};

export type LiveDeskResponse = {
  storyId: number;
  status: "off" | "live" | "ended";
  startedAt: string | null;
  endedAt: string | null;
  storyPublished: boolean;
  /** May post, edit and delete (story managers). */
  canManage: boolean;
  /** May publish updates readers can see (editors). */
  canPublish: boolean;
  updates: LiveDeskUpdate[];
  hasMore: boolean;
};

export type LiveUpdateInput = { title?: unknown; text?: unknown; photoId?: unknown; pinned?: unknown; state?: unknown };

const PAGE = 100;
const as = (ctx: ScreenContext) => ({ req: ctx.req, overrideAccess: false as const, depth: 0 });

async function authorize(ctx: ScreenContext, storyId: number) {
  const scope = await storyScope(ctx.req);
  const manager = scopeManages(scope, storyId);
  if (!manager && !scopeParticipates(scope, storyId)) throw new APIError("You are not part of this story.", 403);
  return manager;
}

const clean = (value: unknown, max: number) => (typeof value === "string" ? value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim().slice(0, max) : "");
const positive = (value: unknown) => {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
};

export async function liveDesk(ctx: ScreenContext, storyId: number): Promise<LiveDeskResponse> {
  const manager = await authorize(ctx, storyId);
  const { payload } = ctx.req;
  const story = await payload.findByID({ collection: "stories", id: storyId, draft: true, select: { liveCoverage: true, _status: true }, ...as(ctx) });
  const publisher = await canPublishLive(ctx.req, storyId);
  // Drafts are private working copies: the story's managers and live publishers see them all; anyone else only their own.
  const where: Where = { and: [{ story: { equals: storyId } }, ...(manager || publisher ? [] : [{ or: [{ state: { equals: "published" } }, { author: { equals: ctx.user.id } }] }])] };
  const page = await payload.find({ collection: "live-updates", where, sort: "-publishedAt", limit: PAGE, depth: 1, req: ctx.req, overrideAccess: false });
  const authors = page.docs.map((row) => relationId(row.author)).filter((id): id is number | string => id !== null);
  const users = authors.length ? (await payload.find({ collection: "users", where: { id: { in: authors } }, select: { name: true, linkedPerson: true }, pagination: false, ...as(ctx) })).docs : [];
  const names = new Map(users.map((user) => [String(user.id), user.name]));
  return {
    storyId,
    status: story.liveCoverage?.state ?? "off",
    startedAt: story.liveCoverage?.startedAt ?? null,
    endedAt: story.liveCoverage?.endedAt ?? null,
    storyPublished: story._status === "published",
    canManage: manager,
    canPublish: publisher,
    hasMore: page.hasNextPage,
    updates: page.docs.map((row): LiveDeskUpdate => {
      const author = Number(relationId(row.author)) || 0;
      const photo = row.photo && typeof row.photo === "object" ? row.photo : null;
      return {
        id: row.id, title: row.headline ?? "", text: lexicalToPlainText(row.body), state: row.state === "draft" ? "draft" : "published", pinned: row.pinned === true,
        publishedAt: row.publishedAt ?? row.createdAt, updatedAt: row.updatedAt,
        author: author ? { id: author, name: names.get(String(author)) ?? "Former newsroom member", avatarUrl: null } : null,
        photo: photo ? { id: photo.id, alt: photo.alt ?? "", previewUrl: photo.thumbnailURL ?? photo.url ?? null } : null
      };
    })
  };
}

/** What a person may set: anyone without the publish right (editors, or this Story's live grant) always writes drafts. */
async function stateFor(ctx: ScreenContext, storyId: number, requested: unknown, fallback: "draft" | "published") {
  if (!(await canPublishLive(ctx.req, storyId))) return "draft" as const;
  return requested === "draft" || requested === "published" ? requested : fallback;
}

export async function postLiveUpdate(ctx: ScreenContext, storyId: number, input: LiveUpdateInput): Promise<{ id: number }> {
  // Anyone on the story may write; only those who may publish make it public (the collection enforces it too).
  await authorize(ctx, storyId);
  const text = clean(input.text, LIVE_TEXT_MAX);
  if (!text) throw new APIError("Write the update readers should see.", 400);
  const photo = input.photoId === undefined || input.photoId === null || input.photoId === 0 ? null : positive(input.photoId);
  if (input.photoId && !photo) throw new APIError("Choose a photo from Media.", 400);
  const created = await ctx.req.payload.create({
    collection: "live-updates", ...as(ctx),
    data: { story: storyId, headline: clean(input.title, 200) || undefined, body: plainTextToLexical(text) as never, photo: photo ?? undefined, pinned: input.pinned === true, state: await stateFor(ctx, storyId, input.state, "published") }
  });
  return { id: created.id };
}

export async function changeLiveUpdate(ctx: ScreenContext, storyId: number, updateId: number, input: LiveUpdateInput): Promise<{ id: number }> {
  await authorize(ctx, storyId);
  const existing = await ctx.req.payload.find({ collection: "live-updates", where: { and: [{ id: { equals: updateId } }, { story: { equals: storyId } }] }, limit: 1, ...as(ctx) });
  if (!existing.docs[0]) throw new APIError("That update is not on this story.", 404);
  const data: Record<string, unknown> = {};
  if (input.text !== undefined) {
    const text = clean(input.text, LIVE_TEXT_MAX);
    if (!text) throw new APIError("An update needs some text.", 400);
    data.body = plainTextToLexical(text);
  }
  if (input.title !== undefined) data.headline = clean(input.title, 200) || null;
  if (input.photoId !== undefined) {
    const photo = input.photoId === null || input.photoId === 0 ? null : positive(input.photoId);
    if (input.photoId && !photo) throw new APIError("Choose a photo from Media.", 400);
    data.photo = photo;
  }
  if (input.pinned !== undefined) data.pinned = input.pinned === true;
  if (input.state !== undefined) data.state = await stateFor(ctx, storyId, input.state, existing.docs[0].state === "draft" ? "draft" : "published");
  await ctx.req.payload.update({ collection: "live-updates", id: updateId, data: data as never, ...as(ctx) });
  return { id: updateId };
}

export async function deleteLiveUpdate(ctx: ScreenContext, storyId: number, updateId: number): Promise<{ id: number }> {
  await authorize(ctx, storyId);
  const existing = await ctx.req.payload.find({ collection: "live-updates", where: { and: [{ id: { equals: updateId } }, { story: { equals: storyId } }] }, limit: 1, select: {}, ...as(ctx) });
  if (!existing.docs[0]) throw new APIError("That update is not on this story.", 404);
  await ctx.req.payload.delete({ collection: "live-updates", id: updateId, ...as(ctx) });
  return { id: updateId };
}

/**
 * The published-only projection: only a published, untrashed story with live
 * or ended coverage, and only its published updates. Raw text, drafts, account
 * IDs and author names never leave. Photos are the prepared public renditions
 * (the same ones the static build materializes); when any is not yet prepared
 * the feed omits photos rather than failing, and the next build brings them.
 * Null when there is no coverage to show.
 */
export async function publicLiveFeed(payload: Payload, storyId: number): Promise<LiveCoverage | null> {
  const { docs } = await payload.find({
    collection: "stories", where: { id: { equals: storyId } }, draft: false, limit: 1, depth: 0, overrideAccess: true,
    select: { liveCoverage: true, _status: true, publishedAt: true, updatedAt: true, deletedAt: true }
  });
  const story = docs[0];
  if (!story || story._status !== "published" || story.deletedAt) return null;
  const rows = await readLiveUpdates(payload, [storyId]);
  const photoIds = [...new Set(rows.map((row) => Number(relationId(row.photo))).filter((id) => id > 0))];
  const catalog = await PreparedMediaCatalog.load(payload, new Map(photoIds.map((id) => [id, { usage: `a live update on Story ${storyId}`, kind: "image" as const }])))
    .catch(() => PreparedMediaCatalog.load(payload, new Map()));
  return liveCoverageProjection(story, rows, catalog);
}
