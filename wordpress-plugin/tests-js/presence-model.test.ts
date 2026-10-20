import { describe, expect, it } from "vitest";
import { groupPresence, initials, presenceActivityLabel, relativePresenceTime, samePresenceLocation, type PresencePerson } from "../src/presence/presence-model";

const person = (overrides: Partial<PresencePerson>): PresencePerson => ({
  id: 1,
  name: "Gibson Bell",
  status: "offline",
  lastSeen: null,
  ...overrides,
});

describe("newsroom presence model", () => {
  it("groups active, away, recently active, and offline staff", () => {
    const now = 10_000;
    const groups = groupPresence([
      person({ id: 1, status: "active", lastSeen: 9_995 }),
      person({ id: 2, status: "away", lastSeen: 9_900 }),
      person({ id: 3, lastSeen: 9_000 }),
      person({ id: 4, lastSeen: 1_000 }),
      person({ id: 5, lastSeen: null }),
    ], now, 2_000);
    expect(groups.active.map((p) => p.id)).toEqual([1]);
    expect(groups.away.map((p) => p.id)).toEqual([2]);
    expect(groups.recent.map((p) => p.id)).toEqual([3]);
    expect(groups.offline.map((p) => p.id)).toEqual([4, 5]);
  });

  it("formats the compact last-online language used in the popover", () => {
    expect(relativePresenceTime(9_990, 10_000)).toBe("just now");
    expect(relativePresenceTime(9_880, 10_000)).toBe("2 min ago");
    expect(presenceActivityLabel(person({ status: "active", lastSeen: 9_990 }), 10_000)).toBe("Active now");
    expect(presenceActivityLabel(person({ status: "away", lastSeen: 9_880 }), 10_000)).toBe("Away · 2 min ago");
    expect(presenceActivityLabel(person({ status: "offline", lastSeen: 9_880 }), 10_000)).toBe("Last active 2 min ago");
    expect(presenceActivityLabel(person({ status: "offline", lastSeen: null }), 10_000)).toBe("Offline");
  });

  it("identifies people on the same story even when the URL representation differs", () => {
    expect(samePresenceLocation(
      { kind: "story", label: "Garden", storyId: 42, href: "https://cms.test/a" },
      { kind: "story", label: "Garden", storyId: 42, href: "https://cms.test/b" },
    )).toBe(true);
    expect(samePresenceLocation(
      { kind: "planning", label: "Stories", href: "https://cms.test/stories" },
      { kind: "planning", label: "Stories", href: "https://cms.test/stories" },
    )).toBe(true);
    expect(samePresenceLocation(
      { kind: "story", label: "Garden", storyId: 42 },
      { kind: "story", label: "Canteen", storyId: 43 },
    )).toBe(false);
  });

  it("uses a restrained initials fallback only when an image cannot render", () => {
    expect(initials("Gibson Bell")).toBe("GB");
    expect(initials("Caroline")).toBe("C");
    expect(initials("   ")).toBe("?");
  });
});
