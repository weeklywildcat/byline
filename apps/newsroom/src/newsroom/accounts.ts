import { randomBytes } from "node:crypto";
import { sql } from "@payloadcms/db-postgres";
import { APIError, commitTransaction, initTransaction, killTransaction, type PayloadRequest } from "payload";
import { atLeast, relationId } from "../access/user";
import { ROLES, type Role } from "../domain/vocabulary";
import type { User } from "../payload-types";
import { drizzleFor } from "../publication-media/state";
import type { ScreenContext } from "./screen-models";

const asUser = (ctx: ScreenContext) => ({ req: ctx.req, overrideAccess: false as const, depth: 0 });
function administrator(ctx: ScreenContext) {
  if (!atLeast(ctx.user, "administrator")) throw new APIError("Only administrators can manage access.", 403);
}

function account(user: User) {
  return { id: user.id, name: user.name, email: user.email, role: user.role, enabled: user.enabled === true, linkedPerson: relationId(user.linkedPerson), googleConnected: Boolean(user.googleSubject), revision: user.updatedAt };
}

export async function accountList(ctx: ScreenContext, search: string, page = 1) {
  administrator(ctx);
  search = search.trim().slice(0, 120);
  const { docs, hasNextPage } = await ctx.req.payload.find({
    collection: "users", where: search ? { or: [{ name: { like: search } }, { email: { like: search } }] } : undefined,
    page: Number.isSafeInteger(page) && page > 0 ? page : 1, limit: 40, sort: "name", ...asUser(ctx)
  });
  return { accounts: docs.map(account), hasNextPage };
}

export type AccountInput = { name?: unknown; email?: unknown; role?: unknown; enabled?: unknown; linkedPerson?: unknown; password?: unknown; expected?: unknown };

export async function saveAccount(ctx: ScreenContext, input: AccountInput, id?: number) {
  administrator(ctx);
  const name = typeof input.name === "string" ? input.name.trim() : "";
  const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
  const role = input.role as Role;
  if (!name || name.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !ROLES.includes(role) || typeof input.enabled !== "boolean") {
    throw new APIError("Enter a name, valid email, role and access status.", 400);
  }
  const password = typeof input.password === "string" ? input.password : "";
  if (password && (password.length < 12 || password.length > 128)) throw new APIError("Use a password of 12 to 128 characters.", 400);
  const person = input.linkedPerson === null ? null : Number(input.linkedPerson);
  if (person !== null && (!Number.isSafeInteger(person) || person <= 0)) throw new APIError("Choose a public Person or leave it unlinked.", 400);
  const { req } = ctx;
  const payload = req.payload;
  const started = await initTransaction(req);
  try {
    await lockAccountChanges(req);
    if (person !== null) await payload.findByID({ collection: "people", id: person, ...asUser(ctx), select: {} });
    const data = { name, email, role, enabled: input.enabled, linkedPerson: person, ...(password ? { password } : {}) };
    let saved: User;
    if (id === undefined) {
      // Payload requires a local credential. Google-only accounts get an unknown
      // random one; it is never displayed or returned, and can be set later.
      saved = await payload.create({ collection: "users", data: { ...data, password: password || randomBytes(32).toString("base64url") }, ...asUser(ctx) });
    } else {
      const current = await payload.findByID({ collection: "users", id, ...asUser(ctx) });
      if (input.expected !== current.updatedAt) throw new APIError("This account changed. Reload it before saving.", 409);
      saved = await payload.update({ collection: "users", id, data, overrideLock: false, ...asUser(ctx) });
    }
    if (started) await commitTransaction(req);
    return account(saved);
  } catch (error) {
    if (started) await killTransaction(req);
    throw error;
  }
}

export async function lockAccountChanges(req: PayloadRequest) {
  await (await drizzleFor(req.payload, req)).execute(sql`select pg_advisory_xact_lock(461230120, 1)`);
}

export async function requireOtherAdministrator(req: PayloadRequest, id: number | string) {
  const { totalDocs } = await req.payload.count({
    collection: "users",
    where: { and: [{ role: { equals: "administrator" } }, { enabled: { equals: true } }, { id: { not_equals: id } }] },
    overrideAccess: true, req
  });
  if (!totalDocs) throw new APIError("Byline needs at least one enabled administrator.", 400);
}

export type AccountRow = ReturnType<typeof account>;
export type AccountList = Awaited<ReturnType<typeof accountList>>;
