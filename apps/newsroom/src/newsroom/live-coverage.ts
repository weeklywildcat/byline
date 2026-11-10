import type { LiveCoverage } from "@byline/core";
import { APIError, type Payload, type Where } from "payload";
import { ASSIGNED_WORK_COLLECTIONS, scopeManages, scopeParticipates, storyScope } from "../access/story-context";
import { atLeast, relationId, relationIds } from "../access/user";
import { canPublishLive, canPublishLiveNow, liveGate, resetLivePublisherStories, storyIsPublic } from "../access/live-context";
import { LiveTransitionError, normalizeLiveSettings, transition, type CoverageAction, type CoverageState, type LiveMode, type PublishBlock } from "../domain/live-coverage";
import { PreparedMediaCatalog } from "../public/snapshot/media";
import { hasLiveCoverage } from "../domain/live-coverage";
import { liveCoverageProjection, readLivePlans, readLiveUpdates } from "../public/snapshot/live";
import { recordStoryActivity } from "./story-activity";
import { userAvatarUrls } from "./portraits";
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

export type LivePublisher = { id: number; name: string; avatarUrl: string | null };

export type LiveDeskResponse = {
  storyId: number;
  /** Story mode: Standard or Live. Separate from coverage state. */
  mode: LiveMode;
  /** Coverage state: off (Not started), live (Live now) or ended. */
  status: CoverageState;
  startedAt: string | null;
  endedAt: string | null;
  storyPublished: boolean;
  /** May send an update (to the desk, or public when `canPublishNow`): anyone on the Story. */
  canCompose: boolean;
  /** May edit and delete any update (Story managers). */
  canManage: boolean;
  /** Holds the live-publishing right on this Story (editors, or its direct-publisher grant). */
  canPublish: boolean;
  /** ...and coverage accepts public updates right now: the one rule Write, Field and the collection share. */
  canPublishNow: boolean;
  /** Why `canPublishNow` is false (never about the person's right, see `canPublish`). */
  publishBlock: PublishBlock | null;
  /** Editor-level: change mode, start, end, resume and manage direct publishers. */
  canControl: boolean;
  /** Reporters who may also publish live updates directly on this Story. */
  publishers: LivePublisher[];
  updates: LiveDeskUpdate[];
  hasMore: boolean;
};

export type LivePostResult = { id: number; status: "posted" | "sent-to-desk"; reason?: PublishBlock };

export type LiveUpdateInput = { title?: unknown; text?: unknown; photoId?: unknown; pinned?: unknown; state?: unknown; delivery?: unknown };

const PAGE = 100;
const as = (ctx: ScreenContext) => ({ req: ctx.req, overrideAccess: false as const, depth: 0 });

async function authorize(ctx: ScreenContext, storyId: number) {
  const scope = await storyScope(ctx.req);
  const manager = scopeManages(scope, storyId);
  if (!manager && !scopeParticipates(scope, storyId) && !(await canPublishLive(ctx.req, storyId))) throw new APIError("You are not part of this story.", 403);
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
  const [gate, publisher, plan] = await Promise.all([
    liveGate(ctx.req, storyId), canPublishLive(ctx.req, storyId),
    payload.find({ collection: "story-plans", where: { story: { equals: storyId } }, limit: 1, depth: 0, select: { livePublishers: true }, overrideAccess: true, req: ctx.req })
  ]);
  // Drafts are private working copies: the story's managers and live publishers see them all; anyone else only their own.
  const where: Where = { and: [{ story: { equals: storyId } }, ...(manager || publisher ? [] : [{ or: [{ state: { equals: "published" } }, { author: { equals: ctx.user.id } }] }])] };
  const page = await payload.find({ collection: "live-updates", where, sort: "-publishedAt", limit: PAGE, depth: 1, req: ctx.req, overrideAccess: false });
  const granted = relationIds(plan.docs[0]?.livePublishers).map(Number).filter(Boolean);
  const authors = [...new Set([...page.docs.map((row) => relationId(row.author)).filter((id): id is number | string => id !== null), ...granted])];
  const users = authors.length ? (await payload.find({ collection: "users", where: { id: { in: authors } }, select: { name: true, linkedPerson: true }, pagination: false, ...as(ctx) })).docs : [];
  const names = new Map(users.map((user) => [String(user.id), user.name]));
  const avatars = await userAvatarUrls(ctx, users);
  return {
    storyId,
    mode: gate.settings.mode,
    status: gate.settings.state,
    startedAt: gate.settings.startedAt,
    endedAt: gate.settings.endedAt,
    storyPublished: gate.storyPublic,
    canCompose: true,
    canManage: manager,
    canPublish: publisher,
    canPublishNow: publisher && gate.block === null,
    publishBlock: gate.block,
    canControl: atLeast(ctx.user, "editor"),
    publishers: granted.flatMap((id) => (names.has(String(id)) ? [{ id, name: names.get(String(id))!, avatarUrl: avatars.get(id) ?? null }] : [])),
    hasMore: page.hasNextPage,
    updates: page.docs.map((row): LiveDeskUpdate => {
      const author = Number(relationId(row.author)) || 0;
      const photo = row.photo && typeof row.photo === "object" ? row.photo : null;
      return {
        id: row.id, title: row.headline ?? "", text: lexicalToPlainText(row.body), state: row.state === "draft" ? "draft" : "published", pinned: row.pinned === true,
        publishedAt: row.publishedAt ?? row.createdAt, updatedAt: row.updatedAt,
        author: author ? { id: author, name: names.get(String(author)) ?? "Former newsroom member", avatarUrl: avatars.get(author) ?? null } : null,
        photo: photo ? { id: photo.id, alt: photo.alt ?? "", previewUrl: photo.thumbnailURL ?? photo.url ?? null } : null
      };
    })
  };
}

/** What a person may set on an existing update: anyone without the publish right (editors, or this Story's live grant) always writes drafts. */
async function stateFor(ctx: ScreenContext, storyId: number, requested: unknown, fallback: "draft" | "published") {
  if (!(await canPublishLive(ctx.req, storyId))) return "draft" as const;
  return requested === "draft" || requested === "published" ? requested : fallback;
}

/**
 * Media for a live update: editors choose any Media; everyone else only a photo captured for this Story or
 * uploaded by themselves (never an arbitrary asset by ID).
 */
async function assertLivePhoto(ctx: ScreenContext, storyId: number, photo: number) {
  if (atLeast(ctx.user, "editor")) return;
  const ok = (await ctx.req.payload.find({
    collection: "media", where: { and: [{ id: { equals: photo } }, { or: [{ "capture.story": { equals: storyId } }, { uploadedBy: { equals: ctx.user.id } }] }] },
    limit: 1, depth: 0, select: {}, overrideAccess: true, req: ctx.req
  })).docs.length;
  if (!ok) throw new APIError("That photo isn't from this story.", 400);
}

export type NewLiveUpdate = { text: unknown; headline?: unknown; photoId?: unknown; pinned?: unknown; clientKey?: string; queued?: boolean; source: "write" | "field"; wantsPublish: boolean };

/**
 * The one way a live update is created, from Write or Field. The reporter's intent is explicit
 * (`wantsPublish`); it becomes public only if, RIGHT NOW, they still hold the right and the Story's coverage
 * accepts public updates (`canPublishLiveNow`). Otherwise it is a draft for the desk, and the reason is
 * returned so no screen claims "Posted" for something readers cannot see.
 */
export async function createLiveUpdate(ctx: ScreenContext, storyId: number, input: NewLiveUpdate): Promise<LivePostResult> {
  const text = clean(input.text, LIVE_TEXT_MAX);
  if (!text) throw new APIError("Write the update readers should see.", 400);
  const photo = input.photoId === undefined || input.photoId === null || input.photoId === 0 ? null : positive(input.photoId);
  if (input.photoId && !photo) throw new APIError("Choose a photo from Media.", 400);
  if (photo) await assertLivePhoto(ctx, storyId, photo);
  const decision = input.wantsPublish ? await canPublishLiveNow(ctx.req, storyId) : null;
  const publish = decision?.ok === true;
  const deskReason = decision && !decision.ok ? decision.reason : undefined;
  const created = await ctx.req.payload.create({
    // The system flag only lets this one write store `deskReason`; the person's own access still decides everything else.
    collection: "live-updates", ...as(ctx), context: { ...ctx.req.context, bylineSystem: true },
    data: {
      ...(deskReason ? { deskReason } : {}),
      story: storyId, headline: clean(input.headline, 200) || undefined, body: plainTextToLexical(text) as never, photo: photo ?? undefined,
      // A key update is a publisher's call; a draft is never pinned (publishing it later is a separate decision).
      pinned: input.pinned === true && publish, state: publish ? "published" : "draft", ...(input.clientKey ? { clientKey: input.clientKey } : {})
    }
  });
  await recordStoryActivity(ctx.req, storyId, !publish ? "live-submitted" : input.queued ? "live-queued-sent" : input.source === "field" ? "live-published-from-field" : "live-published", created.id);
  return { id: created.id, status: publish ? "posted" : "sent-to-desk", ...(deskReason ? { reason: deskReason } : {}) };
}

export async function postLiveUpdate(ctx: ScreenContext, storyId: number, input: LiveUpdateInput): Promise<LivePostResult> {
  // Anyone on the story may write; only those who may publish, while coverage is live, make it public.
  await authorize(ctx, storyId);
  // `delivery` is the intent. The older `state` field still maps to it for existing clients.
  const wantsPublish = input.delivery === "publish" || (input.delivery === undefined && input.state === "published");
  return createLiveUpdate(ctx, storyId, { text: input.text, headline: input.title, photoId: input.photoId, pinned: input.pinned, source: "write", wantsPublish });
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
    if (photo) await assertLivePhoto(ctx, storyId, photo);
    data.photo = photo;
  }
  if (input.pinned !== undefined) {
    if (!(await canPublishLive(ctx.req, storyId))) throw new APIError("Only editors, or people this story allows to publish live updates, can pin a key update.", 403);
    data.pinned = input.pinned === true;
  }
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

/* ------------------------------------------------------------- coverage */

export type LiveCandidate = { id: number; name: string; avatarUrl: string | null; granted: boolean; relation: string };

/**
 * Who an editor may offer direct publishing: staff accounts on this Story through the existing Story access
 * model (its creator, a contributor through their linked person, anyone holding assigned work), plus anyone who
 * already has the grant, so it can always be taken away. Never every account, never editors or administrators
 * (they already have the authority), and not required to be public byline contributors.
 */
export async function liveCandidates(ctx: ScreenContext, storyId: number): Promise<LiveCandidate[]> {
  if (!atLeast(ctx.user, "editor")) throw new APIError("Only editors can choose who publishes live updates.", 403);
  const { payload } = ctx.req;
  const base = { depth: 0, pagination: false, overrideAccess: true, req: ctx.req } as const;
  const [plan, ...work] = await Promise.all([
    payload.find({ collection: "story-plans", where: { story: { equals: storyId } }, limit: 1, depth: 0, select: { createdBy: true, contributors: true, livePublishers: true }, overrideAccess: true, req: ctx.req }),
    ...ASSIGNED_WORK_COLLECTIONS.map((collection) => payload.find({ collection, where: { story: { equals: storyId } }, select: { assignees: true } as never, ...base }))
  ]);
  const row = plan.docs[0];
  const granted = new Set(relationIds(row?.livePublishers).map(String));
  const relation = new Map<string, string>();
  const note = (id: unknown, why: string) => { const key = String(relationId(id) ?? ""); if (key && !relation.has(key)) relation.set(key, why); };
  note(row?.createdBy, "Started this story");
  const contributorPeople = relationIds(row?.contributors);
  if (contributorPeople.length) {
    const linked = await payload.find({ collection: "users", where: { linkedPerson: { in: contributorPeople } }, select: { linkedPerson: true }, ...base });
    for (const user of linked.docs) note(user.id, "On the byline");
  }
  for (const result of work) for (const record of result.docs as Array<{ assignees?: unknown }>) for (const user of relationIds(record.assignees)) note(user, "Has work on this story");
  for (const id of granted) note(id, "May already publish");
  const ids = [...relation.keys()].map(Number).filter(Boolean);
  if (!ids.length) return [];
  const users = (await payload.find({ collection: "users", where: { id: { in: ids } }, select: { name: true, role: true, linkedPerson: true, enabled: true }, sort: "name", ...base })).docs;
  const eligible = users.filter((user) => user.role === "staff" && (user.enabled !== false || granted.has(String(user.id))));
  const avatars = await userAvatarUrls(ctx, eligible);
  return eligible.map((user) => ({ id: user.id, name: user.name, avatarUrl: avatars.get(user.id) ?? null, granted: granted.has(String(user.id)), relation: relation.get(String(user.id)) ?? "" }));
}

export type CoverageInput = { action?: unknown; mode?: unknown; publishers?: unknown; start?: unknown };

/**
 * Story mode, coverage state and direct publishers: editor-level only, decided here on the server. State is
 * written to the unversioned plan, so going live never saves or publishes the article's unpublished draft;
 * the public projection reads it from there. A Story cannot go live unless it is already public.
 */
export async function changeLiveCoverage(ctx: ScreenContext, storyId: number, input: CoverageInput, seams: { /** Tests only: runs between reading the plan and writing the change. */ beforeWrite?: () => Promise<void> } = {}): Promise<LiveDeskResponse> {
  if (!atLeast(ctx.user, "editor")) throw new APIError("Only editors can change live coverage.", 403);
  const { payload } = ctx.req;
  const found = await payload.find({ collection: "story-plans", where: { story: { equals: storyId } }, limit: 1, depth: 0, select: { liveCoverage: true, livePublishers: true, updatedAt: true }, overrideAccess: true, req: ctx.req });
  const plan = found.docs[0];
  if (!plan) throw new APIError("That story was not found.", 404);
  const current = normalizeLiveSettings(plan.liveCoverage);
  const storyPublic = await storyIsPublic(ctx.req, storyId);
  const now = new Date().toISOString();
  const step = (settings: typeof current, action: CoverageAction) => transition(settings, action, { storyPublic, now });

  const action = input.action;
  let next = current;
  let publishers: number[] | null = null;
  let record: "live-mode-changed" | "live-coverage-started" | "live-coverage-resumed" | "live-coverage-ended" | null = null;
  try {
    if (action === "setup") {
      next = step(current, "set-live-mode");
      if (input.start === true) next = step(next, "start");
      publishers = await validPublishers(ctx, storyId, input.publishers);
      record = input.start === true ? (current.startedAt ? "live-coverage-resumed" : "live-coverage-started") : "live-mode-changed";
    } else if (action === "start") {
      next = step(current, "start");
      record = current.startedAt ? "live-coverage-resumed" : "live-coverage-started";
    } else if (action === "end") {
      next = step(current, "end");
      record = "live-coverage-ended";
    } else if (action === "mode") {
      if (input.mode !== "live" && input.mode !== "standard") throw new APIError("Choose Standard or Live.", 400);
      next = step(current, input.mode === "live" ? "set-live-mode" : "set-standard-mode");
      record = current.state === "live" && next.state === "ended" ? "live-coverage-ended" : "live-mode-changed";
    } else if (action === "publishers") {
      publishers = await validPublishers(ctx, storyId, input.publishers);
    } else {
      throw new APIError("Unknown live coverage action.", 400);
    }
  } catch (error) {
    if (error instanceof LiveTransitionError) throw new APIError(error.message, 409);
    throw error;
  }
  const settingsChanged = JSON.stringify(next) !== JSON.stringify(current);
  const before = relationIds(plan.livePublishers).map(Number).sort();
  const publishersChanged = publishers !== null && JSON.stringify([...publishers].sort()) !== JSON.stringify(before);
  if (settingsChanged || publishersChanged) {
    await seams.beforeWrite?.();
    // The change was computed from the plan as read above. Write it only if the plan is still exactly that one, so two
    // editors (or a slow setup racing an End) can never silently put back state the other already changed.
    const written = await payload.update({
      collection: "story-plans", where: { and: [{ id: { equals: plan.id } }, { updatedAt: { equals: plan.updatedAt } }] },
      depth: 0, overrideAccess: true, req: ctx.req, context: { ...ctx.req.context, bylineSystem: true },
      data: { ...(settingsChanged ? { liveCoverage: next } : {}), ...(publishersChanged ? { livePublishers: publishers! } : {}) }
    });
    if (written.errors?.length) throw new APIError(written.errors[0]?.message ?? "Byline could not change live coverage.", 500);
    if (!written.docs.length) throw new APIError("Live coverage changed while you were working. Review it, then try again.", 409);
    resetLivePublisherStories(ctx.req);
    if (settingsChanged && record) await recordStoryActivity(ctx.req, storyId, record);
    if (publishersChanged) await recordStoryActivity(ctx.req, storyId, "live-publishers-changed");
  }
  return liveDesk(ctx, storyId);
}

async function validPublishers(ctx: ScreenContext, storyId: number, value: unknown): Promise<number[]> {
  if (!Array.isArray(value)) throw new APIError("Choose who may publish live updates.", 400);
  const wanted = [...new Set(value.map(Number))];
  if (wanted.some((id) => !Number.isSafeInteger(id) || id <= 0)) throw new APIError("Choose people from the list.", 400);
  if (wanted.length > 12) throw new APIError("A story can have at most 12 direct publishers.", 400);
  const allowed = new Set((await liveCandidates(ctx, storyId)).map((person) => person.id));
  if (wanted.some((id) => !allowed.has(id))) throw new APIError("Direct publishing is for reporters who work on this story.", 400);
  return wanted;
}

/**
 * The published-only projection: only a published, untrashed story with live
 * or ended coverage, and only its published updates. Raw text, drafts, account
 * IDs and author names never leave. This read-only endpoint uses the same
 * projection contract as the static build. Photos are prepared public
 * renditions; if one is not ready yet, the endpoint omits photos while the
 * snapshot pipeline waits and re-queues once preparation finishes.
 * Null when there is no coverage to show.
 */
export async function publicLiveFeed(payload: Payload, storyId: number): Promise<LiveCoverage | null> {
  const { docs } = await payload.find({
    collection: "stories", where: { id: { equals: storyId } }, draft: false, limit: 1, depth: 0, overrideAccess: true,
    select: { _status: true, publishedAt: true, updatedAt: true, deletedAt: true }
  });
  const story = docs[0];
  if (!story || story._status !== "published" || story.deletedAt) return null;
  // Mode and state come from the unversioned plan, so the feed never depends on article drafts.
  const settings = (await readLivePlans(payload, [storyId])).get(storyId);
  if (!hasLiveCoverage(settings)) return null;
  const rows = await readLiveUpdates(payload, [storyId]);
  const photoIds = [...new Set(rows.map((row) => Number(relationId(row.photo))).filter((id) => id > 0))];
  const catalog = await PreparedMediaCatalog.load(payload, new Map(photoIds.map((id) => [id, { usage: `a live update on Story ${storyId}`, kind: "image" as const }])))
    .catch(() => PreparedMediaCatalog.load(payload, new Map()));
  return liveCoverageProjection(story, settings, rows, catalog);
}
