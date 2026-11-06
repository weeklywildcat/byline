import type { Access, PayloadRequest } from "payload";
import { ROLES, type Role } from "../domain/vocabulary";

/** A signed-in, enabled newsroom account. Everything else is anonymous. */
export type NewsroomUser = {
  id: number | string;
  role: Role;
  linkedPerson: number | string | null;
};

const RANK: Record<Role, number> = { staff: 1, editor: 2, administrator: 3 };

/** A relationship value (an ID or a populated document) as its ID. */
export function relationId(value: unknown): number | string | null {
  if (typeof value === "number" || (typeof value === "string" && value !== "")) return value;
  if (value && typeof value === "object" && "id" in value) return relationId((value as { id: unknown }).id);
  return null;
}

export function relationIds(value: unknown): Array<number | string> {
  return Array.isArray(value) ? value.map(relationId).filter((id): id is number | string => id !== null) : [];
}

export function sameId(left: unknown, right: unknown): boolean {
  const a = relationId(left);
  const b = relationId(right);
  return a !== null && b !== null && String(a) === String(b);
}

/** Whether a relationship changed: two empty values are the same; an ID and its populated document are the same. */
export function relationChanged(left: unknown, right: unknown): boolean {
  const a = relationId(left);
  const b = relationId(right);
  return a === null || b === null ? a !== b : String(a) !== String(b);
}

/**
 * The request's user if it is an enabled Byline account. A disabled account
 * is treated exactly like no account, on every operation, even while its
 * session cookie is still valid (Payload loads the user row on each request).
 */
export function newsroomUser(user: unknown): NewsroomUser | null {
  if (!user || typeof user !== "object") return null;
  const record = user as Record<string, unknown>;
  if (record.collection !== undefined && record.collection !== "users") return null;
  if (record.enabled === false) return null;
  const role = record.role;
  if (typeof role !== "string" || !(ROLES as readonly string[]).includes(role)) return null;
  const id = relationId(record.id);
  if (id === null) return null;
  return { id, role: role as Role, linkedPerson: relationId(record.linkedPerson) };
}

export function atLeast(user: NewsroomUser | null, role: Role): boolean {
  return Boolean(user && RANK[user.role] >= RANK[role]);
}

export function requestUser(req: Pick<PayloadRequest, "user">): NewsroomUser | null {
  return newsroomUser(req.user);
}

export const signedIn: Access = ({ req }) => requestUser(req) !== null;
export const editorsOnly: Access = ({ req }) => atLeast(requestUser(req), "editor");
export const administratorsOnly: Access = ({ req }) => atLeast(requestUser(req), "administrator");
export const nobody: Access = () => false;

export const signedInField = ({ req }: { req: PayloadRequest }) => requestUser(req) !== null;
export const editorsOnlyField = ({ req }: { req: PayloadRequest }) => atLeast(requestUser(req), "editor");
export const administratorsOnlyField = ({ req }: { req: PayloadRequest }) => atLeast(requestUser(req), "administrator");
