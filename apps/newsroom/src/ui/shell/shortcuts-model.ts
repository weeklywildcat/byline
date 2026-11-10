import { navigationFor } from "../../domain/navigation";
import type { Role } from "../../domain/vocabulary";

/**
 * Keyboard navigation for the whole newsroom: `?` for help, `/` for search, `c`
 * to start a story and `g` then a letter to go somewhere (Gmail's and GitHub's
 * habit). Pure and DOM-free where it can be: the provider only feeds it key
 * events and carries out the action it returns.
 */

/** The letter after `g` for each destination, by navigation key. */
export const GO_KEYS: Readonly<Record<string, string>> = {
  home: "h",
  stories: "s",
  calendar: "c",
  media: "m",
  collections: "o",
  data: "a",
  people: "p",
  "front-page": "f",
  distribution: "d",
  "content-health": "t"
};

export type GoShortcut = { key: string; label: string; path: string };

/** The "Go to" shortcuts this role can use: exactly the destinations its sidebar offers. */
export function goShortcuts(role: Role): GoShortcut[] {
  return navigationFor(role).flatMap((item) => (GO_KEYS[item.key] ? [{ key: GO_KEYS[item.key], label: item.label, path: item.path }] : []));
}

export type ShortcutAction =
  | { type: "help" }
  | { type: "search" }
  | { type: "create-story" }
  | { type: "go"; path: string; label: string };

/** How long `g` waits for its second key. */
export const CHORD_MS = 1500;

type KeyLike = { key: string; metaKey: boolean; ctrlKey: boolean; altKey: boolean; shiftKey: boolean; repeat?: boolean };

/** A control the reader is typing into, or an open menu or dialog: single keys belong to it, never to the shell. */
export function isTypingTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  if (!element || typeof element.closest !== "function") return false;
  const tag = element.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (element.isContentEditable) return true;
  return Boolean(element.closest('[contenteditable=""], [contenteditable="true"], [role="textbox"], [role="combobox"], [role="searchbox"], [role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]'));
}

export type ShortcutMachine = {
  /** The action a key press means, or null. `consumed` says whether the press should be kept from the page. */
  press: (event: KeyLike, target: EventTarget | null, now?: number) => { action: ShortcutAction | null; consumed: boolean };
  reset: () => void;
};

export function createShortcutMachine(options: { role: Role; canCreateStory: boolean; chordMs?: number }): ShortcutMachine {
  const go = new Map(goShortcuts(options.role).map((item) => [item.key, item]));
  const chordMs = options.chordMs ?? CHORD_MS;
  let pendingAt: number | null = null;
  const none = { action: null, consumed: false } as const;
  return {
    reset: () => { pendingAt = null; },
    press(event, target, now = Date.now()) {
      if (event.metaKey || event.ctrlKey || event.altKey || event.repeat || isTypingTarget(target)) {
        pendingAt = null;
        return none;
      }
      const key = event.key;
      if (pendingAt !== null) {
        const waited = now - pendingAt;
        pendingAt = null;
        const destination = waited <= chordMs && !event.shiftKey ? go.get(key.toLowerCase()) : undefined;
        if (destination) return { action: { type: "go", path: destination.path, label: destination.label }, consumed: true };
      }
      if (key === "?") return { action: { type: "help" }, consumed: true };
      if (key === "/" && !event.shiftKey) return { action: { type: "search" }, consumed: true };
      if (key === "c" && !event.shiftKey && options.canCreateStory) return { action: { type: "create-story" }, consumed: true };
      if (key === "g" && !event.shiftKey) {
        pendingAt = now;
        return none;
      }
      return none;
    }
  };
}

/** What the help dialog lists, so it can never drift from what the keys do. */
export type ShortcutGroup = { title: string; items: Array<{ label: string; keys: string[][] }> };

export function shortcutGroups(role: Role, { canCreateStory, modifier }: { canCreateStory: boolean; modifier: string }): ShortcutGroup[] {
  return [
    {
      title: "Anywhere",
      items: [
        { label: "Search stories, people and media", keys: [[modifier, "K"], ["/"]] },
        ...(canCreateStory ? [{ label: "New story", keys: [["C"]] }] : []),
        { label: "Show or hide the sidebar", keys: [[modifier, "\\"]] },
        { label: "Show these shortcuts", keys: [["?"]] }
      ]
    },
    { title: "Go to", items: goShortcuts(role).map((item) => ({ label: item.label, keys: [["G", item.key.toUpperCase()]] })) }
  ];
}
