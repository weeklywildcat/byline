import { describe, expect, it } from "vitest";
import { createShortcutMachine, goShortcuts, isTypingTarget, shortcutGroups, GO_KEYS } from "../src/ui/shell/shortcuts-model";
import { NAVIGATION } from "../src/domain/navigation";

const key = (value: string, extra: Partial<{ metaKey: boolean; ctrlKey: boolean; altKey: boolean; shiftKey: boolean; repeat: boolean }> = {}) => ({ key: value, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, ...extra });

describe("keyboard navigation", () => {
  it("offers a Go to letter for exactly the destinations a role's sidebar shows, with no letter used twice", () => {
    const staff = goShortcuts("staff").map((item) => item.label);
    expect(staff).toEqual(["Home", "Stories", "Calendar", "Media", "Collections", "Data"]);
    const editor = goShortcuts("editor");
    expect(editor.map((item) => item.label)).toEqual(["Home", "Stories", "Calendar", "Media", "Collections", "Data", "People", "Front Page", "Distribution", "Content Health"]);
    expect(new Set(editor.map((item) => item.key)).size).toBe(editor.length);
    // Every destination in the navigation has a letter, so a new one cannot be left without.
    expect(NAVIGATION.filter((item) => !GO_KEYS[item.key]).map((item) => item.key)).toEqual([]);
  });

  it("maps ?, / and c to help, search and a new story, and ignores c when the account cannot create stories", () => {
    const machine = createShortcutMachine({ role: "staff", canCreateStory: true });
    expect(machine.press(key("?", { shiftKey: true }), null)).toEqual({ action: { type: "help" }, consumed: true });
    expect(machine.press(key("/"), null)).toEqual({ action: { type: "search" }, consumed: true });
    expect(machine.press(key("c"), null)).toEqual({ action: { type: "create-story" }, consumed: true });
    expect(createShortcutMachine({ role: "staff", canCreateStory: false }).press(key("c"), null).action).toBeNull();
  });

  it("goes to a destination on g then its letter, only within the chord window and only once", () => {
    const machine = createShortcutMachine({ role: "editor", canCreateStory: true, chordMs: 1000 });
    expect(machine.press(key("g"), null, 0)).toEqual({ action: null, consumed: false });
    expect(machine.press(key("s"), null, 400).action).toEqual({ type: "go", path: "/stories", label: "Stories" });
    // The chord is spent: a lone s does nothing.
    expect(machine.press(key("s"), null, 500).action).toBeNull();
    // Too slow: the second key is just a key (and `c` after a stale g is still "new story").
    machine.press(key("g"), null, 0);
    expect(machine.press(key("c"), null, 1500).action).toEqual({ type: "create-story" });
    // Home is the admin root.
    machine.press(key("g"), null, 0);
    expect(machine.press(key("h"), null, 10).action).toEqual({ type: "go", path: "", label: "Home" });
    // A letter this role has no destination for does nothing.
    const staff = createShortcutMachine({ role: "staff", canCreateStory: true });
    staff.press(key("g"), null, 0);
    expect(staff.press(key("p"), null, 10).action).toBeNull();
  });

  it("stays out of the way of modifiers, held keys and anything being typed", () => {
    const machine = createShortcutMachine({ role: "editor", canCreateStory: true });
    expect(machine.press(key("c", { metaKey: true }), null).action).toBeNull();
    expect(machine.press(key("c", { ctrlKey: true }), null).action).toBeNull();
    expect(machine.press(key("c", { altKey: true }), null).action).toBeNull();
    expect(machine.press(key("c", { repeat: true }), null).action).toBeNull();
    const input = { tagName: "INPUT", isContentEditable: false, closest: () => null } as unknown as EventTarget;
    expect(machine.press(key("c"), input).action).toBeNull();
    // Typing cancels a pending chord.
    machine.press(key("g"), null, 0);
    machine.press(key("x"), input, 10);
    expect(machine.press(key("s"), null, 20).action).toBeNull();
  });

  it("treats inputs, rich text, comboboxes, menus and dialogs as typing targets", () => {
    const element = (patch: Record<string, unknown>) => ({ tagName: "DIV", isContentEditable: false, closest: () => null, ...patch }) as unknown as EventTarget;
    expect(isTypingTarget(null)).toBe(false);
    expect(isTypingTarget(element({}))).toBe(false);
    expect(isTypingTarget(element({ tagName: "TEXTAREA" }))).toBe(true);
    expect(isTypingTarget(element({ isContentEditable: true }))).toBe(true);
    expect(isTypingTarget(element({ closest: () => ({}) }))).toBe(true);
  });

  it("describes itself from the same table, so the help can never list a key that does nothing", () => {
    const groups = shortcutGroups("staff", { canCreateStory: true, modifier: "⌘" });
    expect(groups.map((group) => group.title)).toEqual(["Anywhere", "Go to"]);
    expect(groups[0].items.map((item) => item.label)).toContain("New story");
    expect(groups[1].items.find((item) => item.label === "Stories")?.keys).toEqual([["G", "S"]]);
    expect(shortcutGroups("staff", { canCreateStory: false, modifier: "Ctrl" })[0].items.map((item) => item.label)).not.toContain("New story");
  });
});
