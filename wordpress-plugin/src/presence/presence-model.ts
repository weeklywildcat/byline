export type PresenceStatus = "active" | "away" | "offline";

export type PresenceLocation = {
  kind: string;
  label: string;
  detail?: string;
  href?: string;
  storyId?: number;
};

export type PresencePerson = {
  id: number;
  name: string;
  avatarUrl?: string;
  status: PresenceStatus;
  lastSeen: number | null;
  location?: PresenceLocation | null;
  current?: boolean;
};

export type PresencePayload = {
  serverTime: number;
  people: PresencePerson[];
};

export type PresenceGroups = {
  active: PresencePerson[];
  away: PresencePerson[];
  recent: PresencePerson[];
  offline: PresencePerson[];
};

export function groupPresence(people: PresencePerson[], now: number, recentSeconds = 86_400): PresenceGroups {
  const groups: PresenceGroups = { active: [], away: [], recent: [], offline: [] };
  for (const person of people) {
    if (person.status === "active") groups.active.push(person);
    else if (person.status === "away") groups.away.push(person);
    else if (person.lastSeen && now - person.lastSeen <= recentSeconds) groups.recent.push(person);
    else groups.offline.push(person);
  }
  return groups;
}

export function initials(name: string): string {
  return name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase() || "").join("") || "?";
}

export function relativePresenceTime(lastSeen: number | null, now: number): string {
  if (!lastSeen) return "Not seen yet";
  const seconds = Math.max(0, now - lastSeen);
  if (seconds < 45) return "just now";
  if (seconds < 90) return "1 min ago";
  if (seconds < 3_600) return `${Math.round(seconds / 60)} min ago`;
  if (seconds < 5_400) return "1 hr ago";
  if (seconds < 86_400) return `${Math.round(seconds / 3_600)} hr ago`;
  if (seconds < 129_600) return "1 day ago";
  if (seconds < 604_800) return `${Math.round(seconds / 86_400)} days ago`;
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(lastSeen * 1000));
}

export function presenceActivityLabel(person: PresencePerson, now: number): string {
  if (person.status === "active") return "Active now";
  if (person.status === "away") return `Away · ${relativePresenceTime(person.lastSeen, now)}`;
  if (!person.lastSeen) return "Offline";
  return `Last active ${relativePresenceTime(person.lastSeen, now)}`;
}

export function samePresenceLocation(a?: PresenceLocation | null, b?: PresenceLocation | null): boolean {
  if (!a || !b) return false;
  if (a.storyId && b.storyId) return a.storyId === b.storyId;
  if (a.href && b.href) return a.href === b.href;
  return a.kind === b.kind && a.label === b.label;
}
