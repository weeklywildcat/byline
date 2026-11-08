import { createHmac } from "node:crypto";
import { APIError, type PayloadRequest } from "payload";
import { relationId } from "../access/user";
import { maybePrunePresenceSessions, readPresenceSessions, touchPresence } from "../db/presence-sessions";
import { canAdministerSystem, COLLECTIONS_PATH, navigationFor, SYSTEM_ADMINISTRATION_PATH } from "../domain/navigation";
import { effectivePresence, parseHeartbeat, type Heartbeat, type PresenceLocation, type PresencePerson, type PresenceSnapshot, type ResolvedPresenceLocation } from "../domain/presence";
import { portraits, portraitUrl } from "./portraits";
import { readableStories, type ScreenContext } from "./screen-models";

const GENERIC = { label: "Working in Byline" } satisfies ResolvedPresenceLocation;
const MAX_HEARTBEAT_BYTES = 1024;

async function heartbeatBody(req: PayloadRequest): Promise<Heartbeat> {
  const site = req.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") throw new APIError("Use Byline to update presence.", 403);
  if (req.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() !== "application/json") {
    throw new APIError("Send a JSON heartbeat.", 415);
  }
  const reader = req.body?.getReader();
  if (!reader) throw new APIError("Invalid presence heartbeat.", 400);
  const buffer = new Uint8Array(MAX_HEARTBEAT_BYTES);
  let length = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      if (length + value.byteLength > buffer.byteLength) {
        void reader.cancel().catch(() => {});
        throw new APIError("Presence heartbeat is too large.", 413);
      }
      buffer.set(value, length);
      length += value.byteLength;
    }
  } finally {
    reader.releaseLock();
  }
  let input: unknown;
  try {
    input = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(buffer.subarray(0, length)));
  } catch {
    throw new APIError("Invalid presence heartbeat.", 400);
  }
  const heartbeat = parseHeartbeat(input);
  if (!heartbeat) throw new APIError("Invalid presence heartbeat.", 400);
  return heartbeat;
}

/** Batch record reads with the requesting viewer's access and usual draft rules. */
async function locationResolver(ctx: ScreenContext, locations: (PresenceLocation | null)[]) {
  const ids = (kind: "story" | "collection") => [...new Set(locations.flatMap((location) => location?.kind === kind ? [location.targetId] : []))];
  const collectionIds = ids("collection");
  const [stories, collections] = await Promise.all([
    readableStories(ctx, ids("story"), { headline: true }),
    collectionIds.length ? ctx.req.payload.find({
      collection: "collections", where: { id: { in: collectionIds } },
      select: { name: true }, depth: 0, pagination: false, req: ctx.req, overrideAccess: false
    }).then(({ docs }) => docs) : []
  ]);
  const headlines = new Map(stories.map((story) => [story.id, story.headline]));
  const names = new Map(collections.map((collection) => [collection.id, collection.name]));
  const nav = navigationFor(ctx.user.role);

  return (location: PresenceLocation | null): ResolvedPresenceLocation | null => {
    if (!location) return null;
    if (location.kind === "story") {
      if (!headlines.has(location.targetId)) return GENERIC;
      return {
        label: headlines.get(location.targetId) || "Untitled story",
        detail: "Story workspace", href: `${ctx.admin}/collections/stories/${location.targetId}`, location
      };
    }
    if (location.kind === "collection") {
      if (!names.has(location.targetId)) return GENERIC;
      return {
        label: names.get(location.targetId) || "Untitled collection",
        detail: "Collection workspace", href: `${ctx.admin}${COLLECTIONS_PATH}?collection=${location.targetId}`, location
      };
    }
    if (location.kind === "system" && canAdministerSystem(ctx.user.role)) {
      return { label: "System administration", href: ctx.admin + SYSTEM_ADMINISTRATION_PATH, location };
    }
    const screen = nav.find(({ key }) => key === location.kind);
    return screen ? { label: screen.label, href: ctx.admin + screen.path || "/", location } : GENERIC;
  };
}

export async function presenceHeartbeat(ctx: ScreenContext): Promise<PresenceSnapshot> {
  const heartbeat = await heartbeatBody(ctx.req);
  // A caller can't claim to be inside a private workspace they can't read.
  const resolve = await locationResolver(ctx, [heartbeat.location]);
  heartbeat.location = resolve(heartbeat.location)?.location ?? { kind: "other" };
  await touchPresence(ctx.req.payload, Number(ctx.user.id), heartbeat, ctx.now);
  return presenceSnapshot(ctx);
}

export async function presenceSnapshot(ctx: ScreenContext): Promise<PresenceSnapshot> {
  const { req, user } = ctx;
  const now = ctx.now.getTime();
  const read = { req, overrideAccess: false, depth: 0, pagination: false } as const;
  const [{ docs: accounts }] = await Promise.all([
    req.payload.find({ collection: "users", where: { enabled: { equals: true } }, select: { name: true, linkedPerson: true }, ...read }),
    maybePrunePresenceSessions(req.payload, now)
  ]);
  const peopleIds = [...new Set(accounts.flatMap((account) => relationId(account.linkedPerson) ?? []))];
  const [sessions, people] = await Promise.all([
    readPresenceSessions(req.payload, accounts.map(({ id }) => id), now),
    peopleIds.length ? req.payload.find({
      collection: "people", where: { id: { in: peopleIds } }, select: { portrait: true }, ...read
    }).then(({ docs }) => docs) : []
  ]);
  const effective = accounts.map((account) => ({ account, ...effectivePresence(sessions.get(account.id) ?? [], now) }));
  const [resolve, media] = await Promise.all([
    locationResolver(ctx, effective.map(({ location }) => location)),
    portraits(ctx, people)
  ]);
  const personPortraits = new Map(people.map((person) => [person.id, Number(relationId(person.portrait))]));
  const api = req.payload.config.routes.api;
  const snapshot: PresenceSnapshot = { now, self: { state: "offline", location: null }, people: [] };
  for (const { account, location, state, lastSeen, lastActive } of effective) {
    const resolved = resolve(location);
    if (account.id === Number(user.id)) {
      snapshot.self = { state, location: resolved };
      continue;
    }
    const asset = media.get(personPortraits.get(Number(relationId(account.linkedPerson))) ?? 0);
    const person: PresencePerson = {
      key: createHmac("sha256", req.payload.secret).update(`byline-presence:${account.id}`).digest("base64url").slice(0, 22),
      name: account.name, state, lastSeen, lastActive, location: resolved,
      avatarUrl: portraitUrl(api, asset)
    };
    snapshot.people.push(person);
  }
  return snapshot;
}
