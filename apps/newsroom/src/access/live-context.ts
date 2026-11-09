import type { PayloadRequest } from "payload";
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
