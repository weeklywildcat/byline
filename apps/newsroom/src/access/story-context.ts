import type { PayloadRequest, Where } from "payload";
import { OPEN_RUN_STATUSES } from "../domain/review";
import { atLeast, relationId, relationIds, requestUser, sameId, type NewsroomUser } from "./user";

/**
 * Who may see and change a story's private context. Ported from
 *
 * - **manager**: an editor or administrator; the story's creator; its assigned
 *   editor; or one of its contributors (through the account's linked person).
 *   Managers read and change the plan, sources, appointments, tasks and
 *   production.
 * - **participant**: holds a task, a production assignment, a source or an
 *   appointment on the story, or was routed to its open (or just approved)
 *   review (docs/review.md), and nothing stronger. Participants read the plan
 *   and change only the records assigned to them; a reviewer acts only
 *   through the review engine, which checks the open step itself.
 * - **none**: everyone else, who may read only published stories.
 *
 * This is enforced through Payload access functions (SQL `Where` constraints
 * for lists, field access and hooks for writes), never by hiding UI.
 */
export type StoryRelationship = "manager" | "participant" | "none";

export type StoryTeam = {
  createdBy?: unknown;
  editor?: unknown;
  contributors?: unknown;
};

export function managesStory(user: NewsroomUser | null, team: StoryTeam | null | undefined): boolean {
  if (!user) return false;
  if (atLeast(user, "editor")) return true;
  if (!team) return false;
  if (sameId(team.createdBy, user.id) || sameId(team.editor, user.id)) return true;
  return user.linkedPerson !== null && relationIds(team.contributors).some((id) => sameId(id, user.linkedPerson));
}

export function storyRelationship(user: NewsroomUser | null, team: StoryTeam | null | undefined, holdsAssignedWork: boolean): StoryRelationship {
  if (managesStory(user, team)) return "manager";
  return user && holdsAssignedWork ? "participant" : "none";
}

/** Collections whose records hang off a story and carry `assignees`. */
export const ASSIGNED_WORK_COLLECTIONS = ["tasks", "sources", "appointments", "production-assignments"] as const;

export type StoryScope =
  | { all: true; user: NewsroomUser }
  | { all: false; user: NewsroomUser; managed: Array<number | string>; participant: Array<number | string> };

const SCOPE_KEY = "bylineStoryScope";

/**
 * The stories this request's user manages or participates in, computed once
 * per request. Editors and administrators manage every story.
 */
export async function storyScope(req: PayloadRequest): Promise<StoryScope | null> {
  const user = requestUser(req);
  if (!user) return null;
  if (atLeast(user, "editor")) return { all: true, user };
  const cache = req.context as Record<string, unknown>;
  const cached = cache[SCOPE_KEY] as Promise<StoryScope> | undefined;
  if (cached) return cached;
  const pending = loadStoryScope(req, user);
  cache[SCOPE_KEY] = pending;
  return pending;
}

async function storyIds(req: PayloadRequest, collection: "story-plans" | "review-runs" | (typeof ASSIGNED_WORK_COLLECTIONS)[number], where: Where) {
  const result = await req.payload.find({
    collection,
    where,
    depth: 0,
    pagination: false,
    overrideAccess: true,
    select: { story: true },
    req
  });
  return result.docs.map((doc) => relationId((doc as { story?: unknown }).story)).filter((id): id is number | string => id !== null);
}

async function loadStoryScope(req: PayloadRequest, user: NewsroomUser): Promise<StoryScope> {
  const teamWhere: Where[] = [{ createdBy: { equals: user.id } }, { editor: { equals: user.id } }];
  if (user.linkedPerson !== null) teamWhere.push({ contributors: { in: [user.linkedPerson] } });
  const [managed, ...assigned] = await Promise.all([
    storyIds(req, "story-plans", { or: teamWhere }),
    ...ASSIGNED_WORK_COLLECTIONS.map((collection) => storyIds(req, collection, { assignees: { in: [user.id] } })),
    storyIds(req, "review-runs", { and: [{ participants: { in: [user.id] } }, { status: { in: [...OPEN_RUN_STATUSES, "approved"] } }] })
  ]);
  const managedSet = new Set(managed.map(String));
  const participant = [...new Set(assigned.flat().filter((id) => !managedSet.has(String(id))))];
  return { all: false, user, managed: [...new Set(managed)], participant };
}

export function scopeManages(scope: StoryScope | null, storyId: unknown): boolean {
  if (!scope) return false;
  if (scope.all) return true;
  const id = relationId(storyId);
  return id !== null && scope.managed.some((candidate) => sameId(candidate, id));
}

export function scopeParticipates(scope: StoryScope | null, storyId: unknown): boolean {
  if (!scope || scope.all) return false;
  const id = relationId(storyId);
  return id !== null && scope.participant.some((candidate) => sameId(candidate, id));
}

/** `{ <field>: { in: ids } }`, or a constraint that matches nothing when `ids` is empty. */
export function inIds(field: string, ids: ReadonlyArray<number | string>): Where {
  return ids.length > 0 ? { [field]: { in: [...ids] } } : { id: { exists: false } };
}

/** Forget this request's cached scope, after a write that changes who manages what (e.g. creating a story). */
export function resetStoryScope(req: PayloadRequest): void {
  delete (req.context as Record<string, unknown>)[SCOPE_KEY];
}
