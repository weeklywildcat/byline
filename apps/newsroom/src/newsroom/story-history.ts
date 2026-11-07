import { stableDigest } from "@byline/content";
import { APIError, commitTransaction, initTransaction, killTransaction, restoreVersionOperation, type TypeWithVersion } from "payload";
import { atLeast, sameId } from "../access/user";
import type { Story } from "../payload-types";
import { scheduledPublicationsForStories } from "./scheduled-publication";
import type { ScreenContext } from "./screen-models";

type Version = TypeWithVersion<Story> & { autosave?: boolean };
const options = (ctx: ScreenContext) => ({ req: ctx.req, overrideAccess: false as const, depth: 0 });
const parent = (story: number) => ({ parent: { equals: story } });
const facts = { headline: true, deck: true, slug: true, _status: true, versionActor: true, versionRestored: true, updatedAt: true } as const;

export async function storyVersions(ctx: ScreenContext, story: number) {
  const payload = ctx.req.payload;
  const found = await payload.findVersions({ collection: "stories", where: parent(story), sort: ["-updatedAt", "-id"], limit: 200, select: { version: facts, autosave: true, updatedAt: true, parent: true }, ...options(ctx) });
  const rows = found.docs as Version[];
  const live = await payload.findByID({ collection: "stories", id: story, draft: false, select: { _status: true }, ...options(ctx) });
  const current = live._status === "published" ? rows.find((row) => row.version._status === "published")?.id ?? null : null;
  const actors = [...new Set(rows.map((row) => row.version.versionActor).filter((id): id is number => Boolean(id)))];
  const users = actors.length ? (await payload.find({ collection: "users", where: { id: { in: actors } }, select: { name: true }, pagination: false, ...options(ctx) })).docs : [];
  const names = new Map(users.map((user) => [user.id, user.name]));
  return {
    current, latest: rows[0]?.id ?? null,
    versions: rows.map((row) => ({
      id: row.id, at: row.updatedAt, title: row.version.headline, actor: names.get(row.version.versionActor ?? 0) ?? null,
      kind: row.version.versionRestored ? "Restored" : row.version._status === "published" ? "Publication" : row.autosave ? "Autosave" : "Draft save"
    }))
  };
}

async function versionFor(ctx: ScreenContext, story: number, version: number) {
  const row = await ctx.req.payload.findVersionByID({ collection: "stories", id: String(version), ...options(ctx) });
  if (!sameId(row.parent, story)) throw new APIError("This version does not belong to this story.", 404);
  return row;
}

const compare = {
  headline: "Headline", deck: "Deck", kicker: "Kicker", slug: "Slug", publishedAt: "First publication date",
  section: "Section", topics: "Topics", contributors: "Byline", featuredMedia: "Lead image", featuredCaption: "Lead caption",
  format: "Format", video: "Video", presentation: "Presentation", immersiveAlignment: "Headline position",
  reportingNote: "Reporting note", body: "Story body", liveCoverage: "Live coverage"
} satisfies Partial<Record<keyof Story, string>>;

export async function storyVersion(ctx: ScreenContext, story: number, version: number) {
  const payload = ctx.req.payload;
  const row = await versionFor(ctx, story, version);
  const { docs } = await payload.findVersions({
    collection: "stories", where: { and: [parent(story), { or: [
      { updatedAt: { less_than: row.updatedAt } },
      { and: [{ updatedAt: { equals: row.updatedAt } }, { id: { less_than: row.id } }] }
    ] }] }, sort: ["-updatedAt", "-id"], limit: 1, ...options(ctx)
  });
  const previous = docs[0]?.version;
  const changes = previous ? (Object.entries(compare) as Array<[keyof typeof compare, string]>).flatMap(([field, label]) => {
    const before = previous[field] ?? null;
    const after = row.version[field] ?? null;
    if (stableDigest(before) === stableDigest(after)) return [];
    const text = field === "headline" || field === "deck" || field === "slug";
    return [{ label, before: text ? String(before ?? "") : null, after: text ? String(after ?? "") : null }];
  }) : null;
  return { title: row.version.headline, deck: row.version.deck ?? "", slug: row.version.slug, changes };
}

export async function restoreStoryVersion(ctx: ScreenContext, story: number, input: { version?: unknown; expected?: unknown; discard?: unknown }) {
  if (!Number.isSafeInteger(Number(input.version)) || !Number(input.version)) throw new APIError("Choose a version to restore.", 400);
  const { req } = ctx;
  const payload = req.payload;
  const started = await initTransaction(req);
  try {
    const version = await versionFor(ctx, story, Number(input.version));
    const history = await storyVersions(ctx, story);
    if (String(history.latest) !== String(input.expected)) throw new APIError("The story changed. Review the latest version and try again.", 409);
    const discard = input.discard === true;
    if (discard && (!atLeast(ctx.user, "editor") || String(history.current) !== String(version.id))) throw new APIError("Only the current published version can replace unpublished changes.", 403);
    const locked = await payload.findByID({ collection: "stories", id: story, includeLockStatus: true, ...options(ctx) }) as Story & { _isLocked?: boolean; _userEditing?: unknown };
    if (locked._isLocked && !sameId(locked._userEditing, ctx.user.id)) throw new APIError("Someone else is editing this story.", 409);
    if ((await scheduledPublicationsForStories(ctx, [story])).has(story)) throw new APIError("Cancel scheduled publication before restoring a version.", 409);
    // The native operation honors draft restore; Payload 3.92's Local API wrapper drops that flag.
    const doc = await restoreVersionOperation<Story>({ collection: payload.collections.stories, id: version.id, draft: !discard, ...options(ctx) });
    if (started) await commitTransaction(req);
    return { doc, published: history.current != null };
  } catch (error) {
    if (started) await killTransaction(req);
    throw error;
  }
}

export type StoryVersions = Awaited<ReturnType<typeof storyVersions>>;
export type StoryVersion = Awaited<ReturnType<typeof storyVersion>>;
