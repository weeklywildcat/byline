/**
 * How the reader likes the Stories board laid out, and which stages they
 * folded away. Both are reader preferences kept in this browser, like
 * `byline:stories-view`: never a filter, never in a saved view or the address.
 */
export const BOARD_LAYOUT_PREFERENCE_KEY = "byline:stories-board-layout";
export const BOARD_COLLAPSED_PREFERENCE_KEY = "byline:stories-board-collapsed";
export const BOARD_LAYOUTS = ["lanes", "dense", "stacked"] as const;
export type BoardLayout = (typeof BOARD_LAYOUTS)[number];
export const DEFAULT_BOARD_LAYOUT: BoardLayout = "lanes";

export const BOARD_LAYOUT_OPTIONS: ReadonlyArray<{ id: BoardLayout; label: string; description: string }> = [
  { id: "lanes", label: "Lanes", description: "Columns with compact cards" },
  { id: "dense", label: "Dense", description: "One-line rows" },
  { id: "stacked", label: "Stacked", description: "Stages top to bottom" }
];

/** Stages that start folded until the reader opens them. */
const COLLAPSED_BY_DEFAULT = new Set(["dropped"]);

function storageAvailable(storage: Storage | null | undefined): storage is Storage {
  return Boolean(storage && typeof storage.getItem === "function" && typeof storage.setItem === "function");
}

/** This browser's localStorage, or null on the server or where the browser refuses it. */
export function browserStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function isBoardLayout(value: unknown): value is BoardLayout {
  return BOARD_LAYOUTS.includes(value as BoardLayout);
}

export function preferredBoardLayout(storage?: Storage | null): BoardLayout {
  if (!storageAvailable(storage)) return DEFAULT_BOARD_LAYOUT;
  try {
    const value = storage.getItem(BOARD_LAYOUT_PREFERENCE_KEY);
    return isBoardLayout(value) ? value : DEFAULT_BOARD_LAYOUT;
  } catch {
    return DEFAULT_BOARD_LAYOUT;
  }
}

export function writeBoardLayoutPreference(layout: BoardLayout, storage?: Storage | null): void {
  if (!storageAvailable(storage)) return;
  try {
    storage.setItem(BOARD_LAYOUT_PREFERENCE_KEY, layout);
  } catch {
    // Storage can be refused; the chosen layout still holds for this visit.
  }
}

/** `{ [statusId]: collapsed }`: only the stages the reader folded or opened themselves. */
export type BoardCollapsedChoices = Record<string, boolean>;

export function readBoardCollapsed(storage?: Storage | null): BoardCollapsedChoices {
  if (!storageAvailable(storage)) return {};
  try {
    const parsed: unknown = JSON.parse(storage.getItem(BOARD_COLLAPSED_PREFERENCE_KEY) || "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).filter((entry): entry is [string, boolean] => typeof entry[1] === "boolean"));
  } catch {
    return {};
  }
}

export function writeBoardCollapsed(choices: BoardCollapsedChoices, storage?: Storage | null): void {
  if (!storageAvailable(storage)) return;
  try {
    storage.setItem(BOARD_COLLAPSED_PREFERENCE_KEY, JSON.stringify(choices));
  } catch {
    // As above: the choice holds for this visit.
  }
}

/** A stage is folded when the reader folded it, or, without a choice of theirs, when it is empty or starts folded (Dropped). */
export function isStageCollapsed(statusId: string, storyCount: number, choices: BoardCollapsedChoices): boolean {
  if (typeof choices[statusId] === "boolean") return choices[statusId];
  return storyCount === 0 || COLLAPSED_BY_DEFAULT.has(statusId);
}
