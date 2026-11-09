import type { PayloadRequest } from "payload";
import { normalizeLiveSettings, publishBlock, type LiveSettings, type PublishBlock } from "../domain/live-coverage";
import { storyScope } from "./story-context";
import { atLeast, relationId, sameId } from "./user";

/**
 * The Story-level live grant: **May publish live updates**
 * (docs/field-mode.md#live-permissions).
 *
 * Editors and administrators publish anything. Beyond them, a Story's plan
 * may name accounts (`story-plans.livePublishers`, editors control it) who may
 * publish, edit, pin and unpublish *live updates on that Story only*. The
 * grant never publishes or unpublishes the article, never changes the Story's
 * publication state and never makes anyone an editor. Without it, anyone on
 * the Story may still write a draft update for the live desk.
 */

const KEY = "bylineLivePublisherStories";

/** Stories on which this request's account holds the live grant (cached per request). */
export async function livePublisherStories(req: PayloadRequest): Promise<Array<number | string>> {
  const scope = await storyScope(req);
  if (!scope) return [];
  const cache = req.context as Record<string, unknown>;
  const cached = cache[KEY] as Promise<Array<number | string>> | undefined;
  if (cached) return cached;
  const pending = req.payload
    .find({ collection: "story-plans", where: { livePublishers: { in: [scope.user.id] } }, depth: 0, pagination: false, overrideAccess: true, select: { story: true }, req })
    .then((found) => found.docs.map((plan) => relationId((plan as { story?: unknown }).story)).filter((id): id is number | string => id !== null));
  cache[KEY] = pending;
  return pending;
}

export function resetLivePublisherStories(req: PayloadRequest): void {
  delete (req.context as Record<string, unknown>)[KEY];
}

/** Whether this account may publish live updates readers can see on this Story. */
export async function canPublishLive(req: PayloadRequest, storyId: unknown): Promise<boolean> {
  const scope = await storyScope(req);
  if (!scope) return false;
  if (atLeast(scope.user, "editor")) return true;
  return (await livePublisherStories(req)).some((id) => sameId(id, storyId));
}

/** Whether the Story is public: its published version exists and it is not in the trash. Never a draft. */
export async function storyIsPublic(req: PayloadRequest, storyId: unknown): Promise<boolean> {
  const id = relationId(storyId);
  if (id === null) return false;
  const found = await req.payload.find({ collection: "stories", where: { id: { equals: id } }, draft: false, limit: 1, depth: 0, select: { _status: true, deletedAt: true }, overrideAccess: true, trash: true, req });
  const story = found.docs[0] as { _status?: string; deletedAt?: string | null } | undefined;
  return story?._status === "published" && !story.deletedAt;
}

/** The Story's mode and coverage state, from its unversioned plan (never from article drafts or versions). */
export async function readLiveSettings(req: PayloadRequest, storyId: unknown): Promise<LiveSettings> {
  const id = relationId(storyId);
  if (id === null) return normalizeLiveSettings(null);
  const found = await req.payload.find({ collection: "story-plans", where: { story: { equals: id } }, limit: 1, depth: 0, select: { liveCoverage: true }, overrideAccess: true, req });
  return normalizeLiveSettings((found.docs[0] as { liveCoverage?: unknown } | undefined)?.liveCoverage);
}

export type LiveGate = { settings: LiveSettings; storyPublic: boolean; block: Exclude<PublishBlock, "permission-revoked"> | null };

/** The shared "may an update become public now" rule for this Story, independent of who asks (domain/live-coverage.ts). */
export async function liveGate(req: PayloadRequest, storyId: unknown): Promise<LiveGate> {
  const [settings, storyPublic] = await Promise.all([readLiveSettings(req, storyId), storyIsPublic(req, storyId)]);
  return { settings, storyPublic, block: publishBlock(settings, storyPublic) };
}

/**
 * Whether this person may make a live update public RIGHT NOW: they hold the
 * live-publishing right on this Story and the Story's coverage accepts public
 * updates. The one decision used by the live desk, the Field endpoint and the
 * `live-updates` collection. Anything but `ok` becomes a desk draft.
 */
export async function canPublishLiveNow(req: PayloadRequest, storyId: unknown): Promise<{ ok: true } | { ok: false; reason: PublishBlock }> {
  if (!(await canPublishLive(req, storyId))) return { ok: false, reason: "permission-revoked" };
  const gate = await liveGate(req, storyId);
  return gate.block ? { ok: false, reason: gate.block } : { ok: true };
}
