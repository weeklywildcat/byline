import { describe, expect, it } from "vitest";
import {
  BOARD_COLLAPSED_PREFERENCE_KEY,
  BOARD_LAYOUT_PREFERENCE_KEY,
  isStageCollapsed,
  preferredBoardLayout,
  readBoardCollapsed,
  writeBoardCollapsed,
  writeBoardLayoutPreference
} from "../../src/planning/stories-board-layout";

function memoryStorage(initial: Record<string, string> = {}): Storage {
  const values = new Map(Object.entries(initial));
  return {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => Array.from(values.keys())[index] ?? null,
    removeItem: (key) => { values.delete(key); },
    setItem: (key, value) => { values.set(key, String(value)); }
  };
}

describe("the board layout preference", () => {
  it("round-trips each layout under its own key", () => {
    const storage = memoryStorage();
    for (const layout of ["lanes", "dense", "stacked"] as const) {
      writeBoardLayoutPreference(layout, storage);
      expect(storage.getItem(BOARD_LAYOUT_PREFERENCE_KEY)).toBe(layout);
      expect(preferredBoardLayout(storage)).toBe(layout);
    }
  });

  it("falls back to Lanes for nothing stored or an unknown value", () => {
    expect(preferredBoardLayout(memoryStorage())).toBe("lanes");
    expect(preferredBoardLayout(memoryStorage({ [BOARD_LAYOUT_PREFERENCE_KEY]: "kanban" }))).toBe("lanes");
  });

  it("works without storage (server rendering) and when storage refuses", () => {
    expect(preferredBoardLayout(undefined)).toBe("lanes");
    expect(preferredBoardLayout(null)).toBe("lanes");
    expect(() => writeBoardLayoutPreference("dense", null)).not.toThrow();
    const refusing = { ...memoryStorage(), getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("denied"); } } as Storage;
    expect(preferredBoardLayout(refusing)).toBe("lanes");
    expect(() => writeBoardLayoutPreference("dense", refusing)).not.toThrow();
  });
});

describe("folded stages", () => {
  it("round-trips the reader's choices and ignores anything malformed", () => {
    const storage = memoryStorage();
    writeBoardCollapsed({ pitch: true, dropped: false }, storage);
    expect(readBoardCollapsed(storage)).toEqual({ pitch: true, dropped: false });
    expect(readBoardCollapsed(memoryStorage({ [BOARD_COLLAPSED_PREFERENCE_KEY]: "not json" }))).toEqual({});
    expect(readBoardCollapsed(memoryStorage({ [BOARD_COLLAPSED_PREFERENCE_KEY]: "[1,2]" }))).toEqual({});
    expect(readBoardCollapsed(memoryStorage({ [BOARD_COLLAPSED_PREFERENCE_KEY]: '{"pitch":"yes","ready":true}' }))).toEqual({ ready: true });
    expect(readBoardCollapsed(null)).toEqual({});
  });

  it("folds empty stages and Dropped unless the reader chose otherwise", () => {
    expect(isStageCollapsed("pitch", 0, {})).toBe(true);
    expect(isStageCollapsed("pitch", 2, {})).toBe(false);
    expect(isStageCollapsed("dropped", 4, {})).toBe(true);
    expect(isStageCollapsed("dropped", 4, { dropped: false })).toBe(false);
    expect(isStageCollapsed("pitch", 0, { pitch: false })).toBe(false);
    expect(isStageCollapsed("pitch", 3, { pitch: true })).toBe(true);
  });
});
