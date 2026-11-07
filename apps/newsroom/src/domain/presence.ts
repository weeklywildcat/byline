import { NAVIGATION, SYSTEM_ADMINISTRATION_PATH, storyIdFromPath } from "./navigation";

// All durations are milliseconds. Idle describes interaction; freshness describes transport.
export const PRESENCE_TIMING = {
  heartbeat: 30_000,
  activeFreshness: 90_000,
  idle: 5 * 60_000,
  recent: 5 * 60_000,
  retention: 30 * 24 * 60 * 60_000,
  housekeeping: 60 * 60_000
} as const;

const screens = ["home", "stories", "calendar", "media", "collections", "people", "system", "other"] as const;
export type PresenceLocation = { kind: (typeof screens)[number] } | { kind: "story" | "collection"; targetId: number };
export type PresenceState = "active" | "away" | "offline";
export type Heartbeat = { sessionId: string; revision: number; state: "active" | "away"; location: PresenceLocation };
export type PresenceSession = Pick<Heartbeat, "state" | "location"> & { lastSeen: number; lastActive: number | null };
export type EffectivePresence = { state: PresenceState; location: PresenceLocation | null; lastSeen: number | null; lastActive: number | null };
export type ResolvedPresenceLocation = { label: string; detail?: string; href?: string; location?: PresenceLocation };
export type PresencePerson = Omit<EffectivePresence, "location"> & {
  key: string;
  name: string;
  avatarUrl: string | null;
  location: ResolvedPresenceLocation | null;
};
export type PresenceSnapshot = {
  now: number;
  self: Pick<PresencePerson, "state" | "location">;
  people: PresencePerson[];
};

export const PRESENCE_SESSION_ID = /^[0-9a-f]{32}$/;
const recordId = (id: unknown): id is number => typeof id === "number" && Number.isInteger(id) && id > 0 && id <= 2_147_483_647;
const object = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value));

export function parsePresenceLocation(value: unknown): PresenceLocation | null {
  if (!object(value)) return null;
  const { kind, targetId } = value;
  if (kind === "story" || kind === "collection") {
    return recordId(targetId) && Object.keys(value).length === 2 ? { kind, targetId } : null;
  }
  return screens.some((screen) => screen === kind) && Object.keys(value).length === 1
    ? { kind: kind as (typeof screens)[number] }
    : null;
}

export function parseHeartbeat(value: unknown): Heartbeat | null {
  if (!object(value) || Object.keys(value).length !== 4) return null;
  const { sessionId, state, revision } = value;
  const location = parsePresenceLocation(value.location);
  return typeof sessionId === "string" && PRESENCE_SESSION_ID.test(sessionId) &&
    typeof revision === "number" && Number.isSafeInteger(revision) && revision > 0 &&
    (state === "active" || state === "away") && location
    ? { sessionId, revision, state, location } : null;
}

export function presenceLocationFor(pathname: string, admin: string, collectionId: number | null): PresenceLocation {
  const path = pathname.replace(/\/$/, "");
  const prefix = admin.replace(/\/$/, "");
  if (prefix && path !== prefix && !path.startsWith(prefix + "/")) return { kind: "other" };
  const story = storyIdFromPath(pathname, admin);
  if (recordId(story)) return { kind: "story", targetId: story };
  const nav = NAVIGATION.find(({ path: route }) => path === prefix + route);
  if (nav?.key === "collections" && recordId(collectionId)) return { kind: "collection", targetId: collectionId };
  if (path === prefix + SYSTEM_ADMINISTRATION_PATH) return { kind: "system" };
  return parsePresenceLocation({ kind: nav?.key }) ?? { kind: "other" };
}

export function samePresenceLocation(a?: PresenceLocation | null, b?: PresenceLocation | null): boolean {
  return Boolean(a && b && "targetId" in a && "targetId" in b && a.kind === b.kind && a.targetId === b.targetId);
}

export function effectivePresence(sessions: readonly PresenceSession[], now: number): EffectivePresence {
  let latest: PresenceSession | undefined;
  let active: PresenceSession | undefined;
  let lastActive: number | null = null;
  for (const session of sessions) {
    if (!latest || session.lastSeen > latest.lastSeen) latest = session;
    if (session.lastActive !== null && (lastActive === null || session.lastActive > lastActive)) lastActive = session.lastActive;
    if (session.state === "active" && now - session.lastSeen <= PRESENCE_TIMING.activeFreshness &&
        (!active || session.lastSeen > active.lastSeen)) active = session;
  }
  if (active) return { state: "active", location: active.location, lastSeen: active.lastSeen, lastActive };
  if (latest && now - latest.lastSeen <= PRESENCE_TIMING.recent) {
    return {
      state: "away",
      location: now - latest.lastSeen <= PRESENCE_TIMING.activeFreshness ? latest.location : null,
      lastSeen: latest.lastSeen,
      lastActive
    };
  }
  return { state: "offline", location: null, lastSeen: latest?.lastSeen ?? null, lastActive };
}

export function groupPresence(people: readonly PresencePerson[], current: PresenceLocation) {
  const groups = { here: [] as PresencePerson[], around: [] as PresencePerson[], away: [] as PresencePerson[], offline: [] as PresencePerson[] };
  const sorted = [...people].sort((a, b) => (b.lastSeen ?? -1) - (a.lastSeen ?? -1) ||
    a.name.localeCompare(b.name, "en") || a.key.localeCompare(b.key, "en"));
  for (const person of sorted) {
    if (person.state === "active") groups[samePresenceLocation(person.location?.location, current) ? "here" : "around"].push(person);
    else groups[person.state].push(person);
  }
  return groups;
}

export function presenceActivityLabel(person: Pick<PresencePerson, "state" | "lastActive" | "lastSeen">, now: number): string {
  if (person.state === "active") return "Active now";
  const time = person.lastActive ?? person.lastSeen;
  if (time === null) return "Not seen yet";
  const minutes = Math.max(0, Math.floor((now - time) / 60_000));
  if (minutes === 0) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 24 * 60) return `${Math.floor(minutes / 60)} hr ago`;
  const days = Math.floor(minutes / (24 * 60));
  return `${days} ${days === 1 ? "day" : "days"} ago`;
}
