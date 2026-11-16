import { APIError } from "payload";
import { atLeast } from "../access/user";
import { storyAccounts } from "../newsroom/live-coverage";
import { userAvatarUrls } from "../newsroom/portraits";
import type { ScreenContext } from "../newsroom/screen-models";

/**
 * "Posting as" (docs/field-mode.md#shared-phones). A newsroom phone is often passed around at an event while
 * an editor stays signed in. An editor may credit a live update (and the photo that goes with it) to the person
 * who actually wrote it. It changes attribution only: whether the update publishes is still decided by the
 * signed-in account, and the Story's activity keeps that account as the actor, so the record shows both.
 */

export type PostingAsPerson = { id: number; name: string; avatarUrl: string | null; onStory: string | null };

/** Only editors and administrators may credit someone else. */
export const canPostAs = (ctx: ScreenContext) => atLeast(ctx.user, "editor");

/**
 * Everyone an editor may credit: every enabled account, the Story's own people first (with why they belong).
 * Never disabled accounts. The signed-in account is the client's default and is not repeated here.
 */
export async function postingAsPeople(ctx: ScreenContext, storyId: number): Promise<PostingAsPerson[]> {
  if (!canPostAs(ctx)) throw new APIError("Only editors can post for someone else.", 403);
  const { payload } = ctx.req;
  const [{ relation }, users] = await Promise.all([
    storyAccounts(ctx.req, storyId),
    payload.find({ collection: "users", where: { and: [{ enabled: { equals: true } }, { id: { not_equals: ctx.user.id } }] }, select: { name: true, linkedPerson: true }, sort: "name", depth: 0, pagination: false, overrideAccess: true, req: ctx.req })
  ]);
  const avatars = await userAvatarUrls(ctx, users.docs);
  const people = users.docs.map((user) => ({ id: user.id, name: user.name, avatarUrl: avatars.get(user.id) ?? null, onStory: relation.get(String(user.id)) ?? null }));
  return [...people.filter((person) => person.onStory), ...people.filter((person) => !person.onStory)];
}

export type PostingAuthor = { id: number; linkedPerson: number | null; self: boolean };

/**
 * Who a capture is credited to. Missing, or the signed-in account, is the person themself. Anyone else needs an
 * editor's account, decided again at send time (an outbox item queued before a demotion is refused, not
 * silently credited to the wrong person), and must be an enabled account.
 */
export async function resolvePostingAs(ctx: ScreenContext, value: unknown): Promise<PostingAuthor> {
  const me = { id: Number(ctx.user.id), linkedPerson: ctx.user.linkedPerson === null ? null : Number(ctx.user.linkedPerson), self: true };
  if (value === undefined || value === null || value === "" || String(value) === String(ctx.user.id)) return me;
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw new APIError("Choose who this is from.", 400);
  if (!canPostAs(ctx)) throw new APIError("Only editors can post for someone else. Sign in as yourself to post this.", 403);
  const found = await ctx.req.payload.find({ collection: "users", where: { and: [{ id: { equals: id } }, { enabled: { equals: true } }] }, select: { linkedPerson: true }, limit: 1, depth: 0, overrideAccess: true, req: ctx.req });
  const user = found.docs[0];
  if (!user) throw new APIError("That person can't be credited: their account isn't active.", 400);
  const person = typeof user.linkedPerson === "object" && user.linkedPerson ? user.linkedPerson.id : user.linkedPerson;
  return { id, linkedPerson: person ? Number(person) : null, self: false };
}
