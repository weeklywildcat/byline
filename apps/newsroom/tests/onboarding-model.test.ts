// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { firstName } from "../src/ui/onboarding/first-name";
import { normalizeWelcomePreference, welcomeIsDue, welcomePreferenceAfter, WELCOME_ONBOARDING_PREFERENCE } from "../src/ui/onboarding/tour-preferences";
import { saveTourHandoff, takeTourHandoff, TOUR_HANDOFF_KEY, TOUR_HANDOFF_TTL_MS } from "../src/ui/onboarding/tour-handoff";
import { isTourId, stepsFor, tourProgress, TOURS, type TourContext } from "../src/ui/onboarding/tour-registry";
import { nextTabStop, tourKeyIntent } from "../src/ui/onboarding/tour-keyboard";
import { spotlightHole, spotlightPanes } from "../src/ui/onboarding/tour-geometry";
import { comfortablyVisible } from "../src/ui/onboarding/tour-targets";
import { navigationFor } from "../src/domain/navigation";
import type { Role } from "../src/domain/vocabulary";

const REQUEST = "2026-11-10T15:00:00.000Z";
const LATER = "2026-11-12T09:30:00.000Z";
const record = (patch: Record<string, unknown> = {}) => ({ schema: 1, status: "completed", finishedAt: "2026-11-01T12:00:00.000Z", acknowledgedRequestAt: null, ...patch });

describe("welcome greeting", () => {
  it("greets by the first word of the account name", () => {
    expect(firstName("Maycie Hart")).toBe("Maycie");
    expect(firstName("  Gibson   Bell ")).toBe("Gibson");
    expect(firstName("José")).toBe("José");
    expect(firstName("\"Sam\" O'Neil")).toBe("Sam");
  });
  it("has no first name for blank, symbolic or email-like names", () => {
    for (const name of ["", "   ", "@@@", "-", "maycie@example.test", null, undefined, 42]) expect(firstName(name)).toBeNull();
  });
});

describe("welcome eligibility (Payload Preference vs administrator request)", () => {
  it("uses a versioned preference key", () => {
    expect(WELCOME_ONBOARDING_PREFERENCE).toBe("byline:onboarding:welcome:v1");
    expect(TOURS.welcome.preferenceKey).toBe(WELCOME_ONBOARDING_PREFERENCE);
  });
  it("is due with no preference", () => {
    expect(welcomeIsDue(undefined, null)).toBe(true);
    expect(welcomeIsDue(null, null)).toBe(true);
  });
  it("is not due once completed or skipped", () => {
    expect(welcomeIsDue(record(), null)).toBe(false);
    expect(welcomeIsDue(record({ status: "skipped" }), null)).toBe(false);
  });
  it("is due again for a newer administrator request, and not for the acknowledged one", () => {
    expect(welcomeIsDue(record(), REQUEST)).toBe(true);
    expect(welcomeIsDue(record({ acknowledgedRequestAt: REQUEST }), REQUEST)).toBe(false);
    expect(welcomeIsDue(record({ acknowledgedRequestAt: "2026-11-10T15:00:00Z" }), "2026-11-10T15:00:00.000Z")).toBe(false);
    expect(welcomeIsDue(record({ acknowledgedRequestAt: REQUEST }), LATER)).toBe(true);
  });
  it("finishing or skipping acknowledges the current request, so it never reopens", () => {
    const now = new Date("2026-11-13T10:00:00.000Z");
    const skipped = welcomePreferenceAfter("skipped", undefined, LATER, now);
    expect(skipped).toEqual({ schema: 1, status: "skipped", finishedAt: now.toISOString(), acknowledgedRequestAt: LATER });
    expect(welcomeIsDue(skipped, LATER)).toBe(false);
    expect(welcomePreferenceAfter("completed", skipped, null, now)).toMatchObject({ status: "completed", acknowledgedRequestAt: null });
  });
  it("skipping a replay never turns a finished tour into a skipped one", () => {
    expect(welcomePreferenceAfter("skipped", record(), REQUEST).status).toBe("completed");
  });
  it("normalizes malformed or foreign values to no record", () => {
    for (const value of ["completed", 1, [], {}, record({ schema: 2 }), record({ status: "done" }), record({ finishedAt: "yesterday" }), record({ acknowledgedRequestAt: 5 }), record({ acknowledgedRequestAt: "not a date" })]) {
      expect(normalizeWelcomePreference(value)).toBeNull();
      expect(welcomeIsDue(value, null)).toBe(true);
    }
    expect(normalizeWelcomePreference({ ...record(), extra: "dropped", finishedAt: "2026-11-01T12:00:00Z" })).toEqual(record());
    expect(welcomeIsDue(record(), "garbage")).toBe(false);
  });
});

function memory() {
  const values = new Map<string, string>();
  return { values, getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => void values.set(key, value), removeItem: (key: string) => void values.delete(key) };
}

describe("route handoff (sessionStorage, this tab only)", () => {
  const value = { tour: "welcome" as const, stepId: "stories", expectedPath: "/admin/stories", replay: false };
  it("resumes on the expected page and is consumed", () => {
    const store = memory();
    saveTourHandoff(value, 1_000, store);
    expect(takeTourHandoff("/admin/stories/", isTourId, 2_000, store)).toMatchObject({ stepId: "stories" });
    expect(store.values.has(TOUR_HANDOFF_KEY)).toBe(false);
    expect(takeTourHandoff("/admin/stories", isTourId, 2_000, store)).toBeNull();
  });
  it("expires, and is dropped on another page or when malformed", () => {
    const store = memory();
    saveTourHandoff(value, 1_000, store);
    expect(takeTourHandoff("/admin/stories", isTourId, 1_000 + TOUR_HANDOFF_TTL_MS + 1, store)).toBeNull();
    saveTourHandoff(value, 1_000, store);
    expect(takeTourHandoff("/admin/calendar", isTourId, 2_000, store)).toBeNull();
    expect(store.values.size).toBe(0);
    store.setItem(TOUR_HANDOFF_KEY, "{not json");
    expect(takeTourHandoff("/admin/stories", isTourId, 2_000, store)).toBeNull();
    store.setItem(TOUR_HANDOFF_KEY, JSON.stringify({ ...value, tour: "made-up", savedAt: 1_000 }));
    expect(takeTourHandoff("/admin/stories", isTourId, 2_000, store)).toBeNull();
  });
  it("survives storage that throws", () => {
    const broken = { getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("denied"); }, removeItem: () => { throw new Error("denied"); } };
    expect(() => saveTourHandoff(value, 1, broken)).not.toThrow();
    expect(takeTourHandoff("/admin/stories", isTourId, 1, broken)).toBeNull();
  });
});

function context(role: Role, visible: string[] = ["nav-media", "account"]): TourContext {
  const navigation = navigationFor(role);
  return { role, navigation: new Set(navigation.map((item) => item.key)), publishDesks: navigation.filter((item) => item.group === "publish").map((item) => item.label), visible: (anchor) => visible.includes(anchor), modifier: "⌘" };
}
const ids = (role: Role, visible?: string[]) => stepsFor("welcome", context(role, visible)).map((step) => step.id);

describe("welcome tour registry", () => {
  it("gives staff the core tour, with no editor tools", () => {
    expect(ids("staff")).toEqual(["home", "create", "search", "stories-nav", "stories", "calendar-nav", "calendar", "media-nav", "media", "account", "done"]);
  });
  it("adds one short pointer for editors and administrators, naming only their real destinations", () => {
    expect(ids("editor")).toContain("desks");
    expect(ids("administrator")).toContain("desks");
    const desks = stepsFor("welcome", context("editor")).find((step) => step.id === "desks")!;
    for (const label of navigationFor("editor").filter((item) => item.group === "publish").map((item) => item.label)) expect(desks.description).toContain(label);
    for (const step of stepsFor("welcome", context("staff"))) expect(`${step.title} ${step.description}`).not.toMatch(/People|Front Page|Distribution|Content Health/);
  });
  it("follows the layout: Media and the account under More on narrow screens", () => {
    expect(ids("staff", [])).toEqual(["home", "create", "search", "stories-nav", "stories", "calendar-nav", "calendar", "more", "done"]);
    const more = stepsFor("welcome", context("staff", [])).find((step) => step.id === "more")!;
    expect(more.description).toMatch(/^Media, your profile/);
    expect(stepsFor("welcome", context("staff", ["nav-media"])).find((step) => step.id === "more")!.description).toMatch(/^Your profile/);
  });
  it("keeps the first run short and counts a navigation and its screen as one moment", () => {
    const steps = stepsFor("welcome", context("staff"));
    expect(tourProgress(steps, 0)).toEqual({ current: 1, total: 7 });
    expect(tourProgress(steps, steps.findIndex((s) => s.id === "stories-nav"))).toEqual(tourProgress(steps, steps.findIndex((s) => s.id === "stories")));
    expect(tourProgress(stepsFor("welcome", context("editor")), 0).total).toBe(8);
  });
  it("uses stable, unique step IDs and only semantic anchors", () => {
    const all = TOURS.welcome.steps.map((step) => step.id);
    expect(new Set(all).size).toBe(all.length);
    for (const step of TOURS.welcome.steps) for (const anchor of step.targets ?? []) expect(anchor).toMatch(/^[a-z-]+$/);
    // Every step that opens a screen is followed by the step that explains it.
    const steps = stepsFor("welcome", context("staff"));
    steps.forEach((step, index) => { if (step.action) expect(steps[index + 1]?.screen).toBe(step.action.to); });
  });
  it("names the platform's shortcut", () => {
    expect(stepsFor("welcome", context("staff")).find((s) => s.id === "search")!.description).toContain("⌘K");
    expect(stepsFor("welcome", { ...context("staff"), modifier: "Ctrl" }).find((s) => s.id === "search")!.description).toContain("Ctrl K");
  });
});

describe("tour keyboard", () => {
  document.body.innerHTML = `<div role="dialog" id="card"><button id="next">Next</button></div><input id="field" type="text"><a id="link" href="/admin/stories">Stories</a><div role="menu"><div role="menuitem" id="item">Item</div></div>`;
  const $ = (id: string) => document.getElementById(id)!;
  const [card, button, field, link, menuItem] = ["card", "next", "field", "link", "item"].map($) as HTMLElement[];
  const key = (k: string) => ({ key: k, metaKey: false, ctrlKey: false, altKey: false, defaultPrevented: false, isComposing: false });
  const ctx = (target: Element, patch: Record<string, unknown> = {}) => ({ target, card: card!, highlighted: link!, stepKind: "info" as const, canGoBack: true, ...patch });

  it("Escape skips, arrows move on informational steps", () => {
    expect(tourKeyIntent(key("Escape"), ctx(button!))).toBe("skip");
    expect(tourKeyIntent(key("Escape"), ctx(link!))).toBe("skip");
    expect(tourKeyIntent(key("ArrowRight"), ctx(button!))).toBe("next");
    expect(tourKeyIntent(key("ArrowLeft"), ctx(button!))).toBe("back");
    expect(tourKeyIntent(key("ArrowLeft"), ctx(button!, { canGoBack: false }))).toBeNull();
    expect(tourKeyIntent(key("ArrowRight"), ctx(link!, { stepKind: "action" }))).toBeNull();
    expect(tourKeyIntent(key("ArrowRight"), ctx(button!, { stepKind: "status" }))).toBeNull();
  });
  it("never takes keys from fields, widgets, other menus, or chords", () => {
    expect(tourKeyIntent(key("ArrowRight"), ctx(field!))).toBeNull();
    expect(tourKeyIntent(key("Escape"), ctx(field!))).toBeNull();
    expect(tourKeyIntent(key("ArrowRight"), ctx(menuItem!))).toBeNull();
    expect(tourKeyIntent(key("Escape"), ctx(menuItem!))).toBeNull();
    expect(tourKeyIntent({ ...key("ArrowRight"), metaKey: true }, ctx(button!))).toBeNull();
    expect(tourKeyIntent({ ...key("Escape"), defaultPrevented: true }, ctx(button!))).toBeNull();
    expect(tourKeyIntent(key("Tab"), ctx(link!))).toBe("tab");
  });
  it("cycles Tab through the tour's own stops", () => {
    const [a, b, c] = [{}, {}, {}] as HTMLElement[];
    expect(nextTabStop([a!, b!, c!], null, false)).toBe(a);
    expect(nextTabStop([a!, b!, c!], null, true)).toBe(c);
    expect(nextTabStop([a!, b!, c!], c!, false)).toBe(a);
    expect(nextTabStop([a!, b!, c!], a!, true)).toBe(c);
    expect(nextTabStop([], null, false)).toBeNull();
  });
});

describe("spotlight geometry", () => {
  const viewport = { width: 1000, height: 800 };
  it("pads the hole and keeps it on screen", () => {
    expect(spotlightHole({ top: 100, left: 200, width: 50, height: 20 }, viewport)).toEqual({ top: 94, left: 194, width: 62, height: 32 });
    expect(spotlightHole({ top: -10, left: 980, width: 50, height: 20 }, viewport)).toEqual({ top: 0, left: 974, width: 26, height: 16 });
  });
  it("surrounds the hole with four panes that cover the rest exactly", () => {
    const hole = { top: 100, left: 200, width: 300, height: 50 };
    const panes = spotlightPanes(hole, viewport);
    const area = Object.values(panes).reduce((sum, pane) => sum + pane.width * pane.height, 0);
    expect(area + hole.width * hole.height).toBe(viewport.width * viewport.height);
    expect(panes.right).toEqual({ top: 100, left: 500, width: 500, height: 50 });
  });
  it("treats a target under the sticky header or bottom bar as not comfortably visible", () => {
    expect(comfortablyVisible({ top: 30, bottom: 60 }, viewport, { top: 48, bottom: 0 })).toBe(false);
    expect(comfortablyVisible({ top: 100, bottom: 760 }, viewport, { top: 48, bottom: 56 })).toBe(false);
    expect(comfortablyVisible({ top: 100, bottom: 400 }, viewport, { top: 48, bottom: 56 })).toBe(true);
  });
});

