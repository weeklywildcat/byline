import type { PayloadRequest, Where } from "payload";
import { inIds } from "./story-context";
import { atLeast, relationId, relationIds, requestUser, sameId, type NewsroomUser } from "./user";

/**
 * Who may do what with a Collection (a private newsroom reporting project).
 * The one place Collection permissions are decided; endpoints and access
 * functions call these helpers instead of comparing roles themselves.
 *
 * - Every signed-in newsroom account may **read** Collections (their name,
 *   brief, team and membership). Sub-records keep their own access: private
 *   interview contacts, Collection-only tasks.
 * - **Create**: editors and administrators.
 * - **Manage** (brief, status, story membership, interviews, resources,
 *   Collection tasks): editors, the Collection's lead and its members.
 * - **Manage the team** (lead, members): editors and the lead. A member may
 *   coordinate the work but not rewrite who leads it.
 * - **Public presentation** and **archive/restore**: editors. Archiving is the
 *   normal end of a Collection; the lead asks an editor (WordPress let any
 *   Collection editor archive; Payload deliberately narrows it).
 * - **Delete**: administrators only.
 *
 * Collection membership is never Story access: being on a Collection's team
 * does not make anyone a contributor to, or a manager of, its stories
 * (`story-context.ts` decides that alone).
 */
export type CollectionRelationship = "editor" | "lead" | "member" | "none";

export type CollectionTeam = { lead?: unknown; members?: unknown };

export type CollectionScope =
  | { all: true; user: NewsroomUser }
  | { all: false; user: NewsroomUser; led: Array<number | string>; member: Array<number | string> };

const SCOPE_KEY = "bylineCollectionScope";

export function collectionRelationship(user: NewsroomUser | null, team: CollectionTeam | null | undefined): CollectionRelationship {
  if (!user) return "none";
  if (atLeast(user, "editor")) return "editor";
  if (!team) return "none";
  if (sameId(team.lead, user.id)) return "lead";
  if (relationIds(team.members).some((id) => sameId(id, user.id))) return "member";
  return "none";
}

/** The Collections this request's user leads or is a member of, once per request. Editors manage every Collection. */
export async function collectionScope(req: PayloadRequest): Promise<CollectionScope | null> {
  const user = requestUser(req);
  if (!user) return null;
  if (atLeast(user, "editor")) return { all: true, user };
  const cache = req.context as Record<string, unknown>;
  const cached = cache[SCOPE_KEY] as Promise<CollectionScope> | undefined;
  if (cached) return cached;
  const pending = loadCollectionScope(req, user);
  cache[SCOPE_KEY] = pending;
  return pending;
}

async function loadCollectionScope(req: PayloadRequest, user: NewsroomUser): Promise<CollectionScope> {
  const found = await req.payload.find({
    collection: "collections",
    where: { or: [{ lead: { equals: user.id } }, { members: { in: [user.id] } }] },
    depth: 0,
    pagination: false,
    overrideAccess: true,
    select: { lead: true },
    req
  });
  const led: Array<number | string> = [];
  const member: Array<number | string> = [];
  for (const doc of found.docs) (sameId(doc.lead, user.id) ? led : member).push(doc.id);
  return { all: false, user, led, member };
}

/** Forget this request's cached scope after a write that changes a team (creating a Collection, changing its lead or members). */
export function resetCollectionScope(req: PayloadRequest): void {
  delete (req.context as Record<string, unknown>)[SCOPE_KEY];
}

export const collectionCanRead = (user: NewsroomUser | null): boolean => user !== null;
export const collectionCanCreate = (user: NewsroomUser | null): boolean => atLeast(user, "editor");
export const collectionCanManagePublic = (user: NewsroomUser | null): boolean => atLeast(user, "editor");
export const collectionCanArchive = (user: NewsroomUser | null): boolean => atLeast(user, "editor");
export const collectionCanDelete = (user: NewsroomUser | null): boolean => atLeast(user, "administrator");

/** Editors, the lead and members coordinate the Collection's work. */
export function collectionCanManage(scope: CollectionScope | null, collectionId: unknown): boolean {
  if (!scope) return false;
  if (scope.all) return true;
  const id = relationId(collectionId);
  return id !== null && [...scope.led, ...scope.member].some((candidate) => sameId(candidate, id));
}

/** Editors and the lead change who leads and who is on the team. */
export function collectionCanManageTeam(scope: CollectionScope | null, collectionId: unknown): boolean {
  if (!scope) return false;
  if (scope.all) return true;
  const id = relationId(collectionId);
  return id !== null && scope.led.some((candidate) => sameId(candidate, id));
}

/** The Collections this scope manages, as a Where on `field` (true: every Collection). */
export function managedCollections(scope: CollectionScope, field: string): Where | true {
  return scope.all ? true : inIds(field, [...scope.led, ...scope.member]);
}

/** What the screens are told this account may do with one Collection. */
export function collectionCapabilities(scope: CollectionScope | null, collectionId: unknown) {
  const user = scope?.user ?? null;
  return {
    canEdit: collectionCanManage(scope, collectionId),
    canManageTeam: collectionCanManageTeam(scope, collectionId),
    canPublish: collectionCanManagePublic(user),
    canArchive: collectionCanArchive(user),
    canDelete: collectionCanDelete(user)
  };
}
