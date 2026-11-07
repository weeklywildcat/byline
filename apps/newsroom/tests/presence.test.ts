import { describe, expect, it } from "vitest";
import { effectivePresence, groupPresence, parseHeartbeat, presenceActivityLabel, presenceLocationFor, PRESENCE_TIMING, samePresenceLocation, type PresencePerson, type PresenceSession } from "../src/domain/presence";

const now = 1_800_000_000_000;
const story = { kind: "story", targetId: 81 } as const;
const media = { kind: "media" } as const;
const tab = (age: number, fields: Partial<PresenceSession> = {}): PresenceSession => ({
  state: "active", location: story, lastSeen: now - age, lastActive: now - age, ...fields
});

describe("effective newsroom presence", () => {
  it("keeps a single tab active through the inclusive freshness boundary", () => {
    expect(effectivePresence([tab(PRESENCE_TIMING.activeFreshness)], now)).toMatchObject({ state: "active", location: story });
    expect(effectivePresence([tab(PRESENCE_TIMING.activeFreshness + 1)], now)).toMatchObject({ state: "away", location: null });
  });

  it("uses the freshest active tab even if a hidden tab checked in more recently", () => {
    const sessions = [tab(10, { state: "away", location: media }), tab(2_000, { location: media }), tab(20)];
    expect(effectivePresence(sessions, now)).toMatchObject({ state: "active", location: story, lastSeen: now - 20 });
  });

  it("uses the freshest away tab and drops its location before its away state expires", () => {
    expect(effectivePresence([tab(2, { state: "away" }), tab(1, { state: "away", location: media })], now))
      .toMatchObject({ state: "away", location: media });
    expect(effectivePresence([tab(PRESENCE_TIMING.activeFreshness, { state: "away" })], now)).toMatchObject({ state: "away", location: story });
    expect(effectivePresence([tab(PRESENCE_TIMING.recent, { state: "away" })], now)).toMatchObject({ state: "away", location: null });
    const expired = tab(PRESENCE_TIMING.recent + 1);
    expect(effectivePresence([expired], now)).toEqual({ state: "offline", location: null, lastSeen: expired.lastSeen, lastActive: expired.lastActive });
    expect(effectivePresence([], now)).toEqual({ state: "offline", location: null, lastSeen: null, lastActive: null });
  });
});

describe("presence panel model", () => {
  const person = (name: string, fields: Partial<PresencePerson> = {}): PresencePerson => ({
    key: name, name, state: "active", location: { label: "Story", location: story }, avatarUrl: null, lastSeen: now, lastActive: now, ...fields
  });

  it("only groups exact shared records as Here; a masked location cannot match", () => {
    expect(samePresenceLocation(story, { ...story })).toBe(true);
    expect(samePresenceLocation(story, { kind: "collection", targetId: 81 })).toBe(false);
    expect(samePresenceLocation(story, { kind: "story", targetId: 82 })).toBe(false);
    expect(samePresenceLocation(media, media)).toBe(false);
    expect(groupPresence([person("A", { location: { label: "Working in Byline" } })], story).here).toEqual([]);
  });

  it("groups before display and sorts by recency, then name, with unseen accounts last", () => {
    const people = [
      person("Zelda"), person("Dan", { lastSeen: now - 1 }), person("Alice"),
      person("Dee", { location: { label: "Media", location: media } }),
      person("Carl", { state: "away", lastSeen: now - 1 }), person("Beth", { state: "away" }),
      person("Abby", { state: "offline", lastSeen: null }), person("Ben", { state: "offline", lastSeen: now - 10 })
    ];
    const names = (group: PresencePerson[]) => group.map(({ name }) => name);
    const grouped = groupPresence(people, story);
    expect(Object.values(grouped).map(names)).toEqual([["Alice", "Zelda", "Dan"], ["Dee"], ["Beth", "Carl"], ["Ben", "Abby"]]);
    expect(groupPresence([...people].reverse(), story)).toEqual(grouped);
  });

  it("labels activity relative to last active, even after a later away heartbeat", () => {
    expect(presenceActivityLabel(person("A"), now)).toBe("Active now");
    expect(presenceActivityLabel(person("A", { state: "away", lastActive: now - 120_000 }), now)).toBe("2 min ago");
    expect(presenceActivityLabel(person("A", { state: "offline", lastActive: now - 86_400_000 }), now)).toBe("1 day ago");
    expect(presenceActivityLabel(person("A", { state: "offline", lastSeen: null, lastActive: null }), now)).toBe("Not seen yet");
  });

  it("derives only allowlisted routes and rejects unstructured inputs", () => {
    expect(presenceLocationFor("/admin/collections/stories/81", "/admin", null)).toEqual(story);
    expect(presenceLocationFor("/admin/collections", "/admin", 81)).toEqual({ kind: "collection", targetId: 81 });
    expect(presenceLocationFor("/admin/collections/stories/create", "/admin", 81)).toEqual({ kind: "other" });
    expect(presenceLocationFor("/collections/stories/81", "/admin", null)).toEqual({ kind: "other" });
    const input = { sessionId: "a".repeat(32), state: "active", revision: 1, location: story };
    expect(parseHeartbeat(input)).toEqual(input);
    expect(parseHeartbeat({ ...input, location: { ...story, href: "https://example.com" } })).toBeNull();
  });
});
