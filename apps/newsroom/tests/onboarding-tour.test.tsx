// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/* ------------------------------------------------ the Payload/Next boundary */

const env = vi.hoisted(() => ({
  pathname: "/admin",
  role: "staff" as string,
  name: "Maycie Hart" as string,
  requestedAt: null as string | null,
  preferences: new Map<string, unknown>(),
  writes: [] as Array<{ key: string; value: unknown }>,
  pushes: [] as string[]
}));

vi.mock("@payloadcms/ui", () => ({
  useAuth: () => ({ user: { id: 7, collection: "users", role: env.role, enabled: true, name: env.name, linkedPerson: null, welcomeOnboardingRequestedAt: env.requestedAt } }),
  useConfig: () => ({ config: { routes: { admin: "/admin", api: "/api" } } }),
  usePreferences: () => ({
    getPreference: async (key: string) => env.preferences.get(key),
    setPreference: async (key: string, value: unknown) => {
      env.writes.push({ key, value });
      env.preferences.set(key, value);
    }
  }),
  useRouteTransition: () => ({ startRouteTransition: (run: () => void) => run() })
}));
vi.mock("next/navigation", () => ({
  usePathname: () => env.pathname,
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: (href: string) => env.pushes.push(href), prefetch: () => {} })
}));
vi.mock("sonner", () => ({ toast: Object.assign(() => {}, { error: () => {}, success: () => {}, loading: () => 0, dismiss: () => {} }) }));

const { OnboardingProvider, useOnboarding } = await import("../src/ui/onboarding/OnboardingProvider");
const { createTourRun } = await import("../src/ui/onboarding/tour-run");
const { WELCOME_ONBOARDING_PREFERENCE } = await import("../src/ui/onboarding/tour-preferences");
const { TOUR_HANDOFF_KEY } = await import("../src/ui/onboarding/tour-handoff");
const { ShellNavigationProvider } = await import("../src/ui/shell/navigation");

/* ------------------------------------------------------------- harness */

// jsdom lays nothing out: anything with a tour anchor gets a visible box.
const BOX = { top: 120, left: 140, width: 160, height: 36 };
function layout() {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    const visible = this.closest("[data-byline-tour]") && !this.closest("[data-hidden-layout]");
    const box = visible ? BOX : { top: 0, left: 0, width: 0, height: 0 };
    return { ...box, x: box.left, y: box.top, right: box.left + box.width, bottom: box.top + box.height, toJSON: () => box } as DOMRect;
  });
  // Every rendered control has a box (the tour's Tab order skips ones that don't).
  vi.spyOn(HTMLElement.prototype, "getClientRects").mockImplementation(function (this: HTMLElement) {
    return (this.isConnected ? [{ top: 0, left: 0, width: 10, height: 10 }] : []) as unknown as DOMRectList;
  });
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: false, media: query, addEventListener: () => {}, removeEventListener: () => {} }));
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 20));
async function until(check: () => unknown, label: string, ms = 3_000) {
  const start = Date.now();
  for (;;) {
    let ok: unknown = false;
    try { ok = check(); } catch { ok = false; }
    if (ok) return;
    if (Date.now() - start > ms) throw new Error(`Timed out waiting for ${label}`);
    await act(tick);
  }
}

let root: Root | null = null;
let host: HTMLDivElement;
let replay: () => void = () => {};

function ReplayHandle() {
  replay = useOnboarding().replayWelcome;
  return null;
}

/** A Byline screen with the anchors the welcome tour points at. */
function Page({ children }: { children?: ReactNode }) {
  return (
    <main>
      <header data-byline-tour="home-screen"><h1>Today</h1></header>
      <ul data-byline-tour="create"><li><button type="button">Create</button></li></ul>
      <button type="button" data-byline-tour="search">Search</button>
      <a href="/admin/stories" data-byline-tour="nav-stories" onClick={(event) => event.preventDefault()}>Stories</a>
      <a href="/admin/calendar" data-byline-tour="nav-calendar" onClick={(event) => event.preventDefault()}>Calendar</a>
      <a href="/admin/media" data-byline-tour="nav-media" onClick={(event) => event.preventDefault()}>Media</a>
      <ul data-byline-tour="account"><li><button type="button">Account</button></li></ul>
      {children}
    </main>
  );
}

async function mount() {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(<ShellNavigationProvider><OnboardingProvider><Page /><ReplayHandle /></OnboardingProvider></ShellNavigationProvider>);
  });
}

async function unmount() {
  await act(async () => root?.unmount());
  root = null;
  host?.remove();
}

const welcome = () => document.querySelector("[data-byline-welcome]");
const card = () => document.querySelector<HTMLElement>("[data-byline-tour-card]");
const button = (name: string) => Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find((b) => b.textContent?.trim() === name);
const press = (key: string, target: EventTarget = document.activeElement ?? document.body) =>
  act(async () => { target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true })); });
const click = (element: Element | undefined | null) => act(async () => { (element as HTMLElement).click(); });
const stored = () => env.preferences.get(WELCOME_ONBOARDING_PREFERENCE) as Record<string, unknown> | undefined;

beforeEach(() => {
  env.pathname = "/admin";
  env.role = "staff";
  env.name = "Maycie Hart";
  env.requestedAt = null;
  env.preferences.clear();
  env.writes = [];
  env.pushes = [];
  sessionStorage.clear();
  layout();
});
afterEach(async () => {
  await unmount();
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

/* --------------------------------------------------------- Driver bridge */

describe("tour run (Driver.js headless)", () => {
  const steps = [
    { id: "one", moment: "one", title: "One", description: "", targets: ["first"] },
    { id: "go", moment: "two", title: "Go", description: "", targets: ["go"], action: { instruction: "Open it.", to: "/two" } },
    { id: "two", moment: "two", title: "Two", description: "", targets: ["second"], screen: "/two", place: "Two" },
    { id: "three", moment: "three", title: "Three", description: "", targets: ["third"] },
    { id: "done", moment: "done", title: "Done", description: "", final: true }
  ] as const;
  const add = (anchor: string) => {
    const element = document.createElement("button");
    element.dataset.bylineTour = anchor;
    document.body.append(element);
    return element;
  };

  it("moves forward and back, advances when the reader uses the control, and waits for a screen", async () => {
    const first = add("first");
    const go = add("go");
    const waiting: string[] = [];
    const run = createTourRun({ tour: "welcome", steps: [...steps], replay: false, waitMs: { screen: 2_000, control: 200 }, onWaitingForScreen: (step) => waiting.push(step.id) });
    await act(() => run.start());
    await until(() => run.getState().phase.kind === "step", "first step");
    expect(run.getState().phase).toMatchObject({ kind: "step", index: 0, element: first });
    await act(async () => run.next());
    await until(() => (run.getState().phase as { index: number }).index === 1, "action step");
    // Next does nothing on an action step: the reader uses the control.
    await act(async () => run.next());
    expect(run.getState().phase).toMatchObject({ kind: "step", index: 1, element: go });
    await act(async () => run.back());
    await until(() => (run.getState().phase as { index: number }).index === 0, "back");
    await act(async () => run.next());
    await until(() => (run.getState().phase as { index: number }).index === 1, "action again");
    await click(go);
    await until(() => run.getState().phase.kind === "waiting", "waiting for the screen");
    expect(waiting).toEqual(["two"]);
    const second = add("second");
    await until(() => run.getState().phase.kind === "step", "screen appeared");
    expect(run.getState().phase).toMatchObject({ kind: "step", index: 2, element: second });
    run.dispose();
    expect(run.getState().phase.kind).toBe("ended");
  });

  it("follows a target React replaced, and never deadlocks on a missing one", async () => {
    add("first");
    const run = createTourRun({ tour: "welcome", steps: [steps[0], steps[3], steps[4]], replay: false, waitMs: { screen: 100, control: 100 } });
    await act(() => run.start());
    await until(() => run.getState().phase.kind === "step", "first");
    const original = (run.getState().phase as { element: HTMLElement }).element;
    original.remove();
    const replacement = add("first");
    await until(() => (run.getState().phase as { element?: HTMLElement }).element === replacement, "replacement followed");

    // "third" never renders: the step gives up after its wait, explains, and offers to continue.
    await act(async () => run.next());
    await until(() => run.getState().phase.kind === "unavailable", "unavailable", 2_000);
    await act(async () => run.skipUnavailable());
    await until(() => run.getState().phase.kind === "step" && (run.getState().phase as { index: number }).index === 2, "continued past it");
    run.dispose();
  });
});

/* ------------------------------------------------------ the whole flow */

describe("welcome onboarding", () => {
  it("greets a first-time account by first name with focus on Show me around", async () => {
    await mount();
    await until(welcome, "welcome dialog");
    expect(document.body.textContent).toContain("Welcome to Byline, Maycie.");
    expect(document.body.textContent).toContain("We’ll show you around.");
    await until(() => document.activeElement === button("Show me around"), "initial focus");
  });

  it("falls back to a plain greeting without a usable first name", async () => {
    env.name = "maycie@example.test";
    await mount();
    await until(welcome, "welcome dialog");
    expect(document.querySelector("[data-byline-welcome] h2")?.textContent).toBe("Welcome to Byline.");
  });

  it("Skip for now is remembered (with the current request) and never asks again", async () => {
    env.requestedAt = "2026-11-12T09:30:00.000Z";
    env.preferences.set(WELCOME_ONBOARDING_PREFERENCE, { schema: 1, status: "completed", finishedAt: "2026-11-01T00:00:00.000Z", acknowledgedRequestAt: null });
    await mount();
    await until(welcome, "welcome for the administrator's request");
    // They have been here before.
    expect(document.body.textContent).toContain("Welcome back, Maycie.");
    await click(button("Not now"));
    await until(() => !welcome(), "dialog closed");
    await until(() => env.writes.length === 1, "preference written");
    // Skipping a re-request keeps the earlier completion, and acknowledges this request.
    expect(stored()).toMatchObject({ schema: 1, status: "completed", acknowledgedRequestAt: "2026-11-12T09:30:00.000Z" });
    await unmount();
    await mount();
    await act(tick);
    await act(tick);
    expect(welcome()).toBeNull();
  });

  it("Escape on the welcome counts as skipping", async () => {
    await mount();
    await until(welcome, "welcome");
    await press("Escape");
    await until(() => stored()?.status === "skipped", "skipped");
    expect(welcome()).toBeNull();
  });

  it("does not greet an account that finished or skipped", async () => {
    env.preferences.set(WELCOME_ONBOARDING_PREFERENCE, { schema: 1, status: "skipped", finishedAt: "2026-11-01T00:00:00.000Z", acknowledgedRequestAt: null });
    await mount();
    await act(tick);
    await act(tick);
    expect(welcome()).toBeNull();
  });

  it("does not greet outside a Byline screen (Field Mode)", async () => {
    env.pathname = "/admin/field";
    await mount();
    await act(tick);
    await act(tick);
    expect(welcome()).toBeNull();
  });

  it("Show me around starts the tour; the keyboard moves it and Escape skips it", async () => {
    await mount();
    await until(welcome, "welcome");
    await click(button("Show me around"));
    await until(() => card()?.textContent?.includes("This is your newsroom"), "first step");
    expect(card()!.textContent).toContain("1 / 7");
    expect(card()!.getAttribute("role")).toBe("dialog");
    expect(card()!.getAttribute("aria-labelledby")).toBeTruthy();
    expect(document.querySelectorAll("[data-byline-tour-card]")).toHaveLength(1);
    await until(() => document.activeElement === button("Next"), "focus in the guidance");
    await press("ArrowRight");
    await until(() => card()?.textContent?.includes("Start something"), "second step");
    await press("ArrowLeft");
    await until(() => card()?.textContent?.includes("This is your newsroom"), "back to the first");
    expect(env.writes).toHaveLength(0);
    await press("Escape");
    await until(() => !card(), "tour closed");
    await until(() => stored()?.status === "skipped", "skipped");
  });

  it("Tab stays among the tour's controls and the control a step asks the reader to use", async () => {
    sessionStorage.setItem(TOUR_HANDOFF_KEY, JSON.stringify({ tour: "welcome", stepId: "stories-nav", expectedPath: "/admin", replay: false, savedAt: Date.now() }));
    await mount();
    await until(() => card()?.textContent?.includes("Open Stories to continue."), "action step");
    expect(button("Next")).toBeUndefined();
    const stops = new Set<Element | null>();
    for (let i = 0; i < 6; i++) {
      await press("Tab");
      stops.add(document.activeElement);
    }
    const stories = document.querySelector("[data-byline-tour=nav-stories]");
    expect(stops.has(stories)).toBe(true);
    for (const stop of stops) expect(stop === stories || card()!.contains(stop)).toBe(true);
    expect(stops.has(document.querySelector("[data-byline-tour=search]"))).toBe(false);
    // Using the real control moves the tour on (to the Stories screen, which this test page never renders).
    await click(stories);
    await until(() => card()?.textContent?.includes("Opening Stories"), "waiting for Stories");
    expect(JSON.parse(sessionStorage.getItem(TOUR_HANDOFF_KEY)!)).toMatchObject({ stepId: "stories", expectedPath: "/admin/stories" });
  });

  it("resumes after a reload mid-navigation, and finishing records completed", async () => {
    sessionStorage.setItem(TOUR_HANDOFF_KEY, JSON.stringify({ tour: "welcome", stepId: "account", expectedPath: "/admin", replay: false, savedAt: Date.now() }));
    await mount();
    expect(welcome()).toBeNull();
    await until(() => card()?.textContent?.includes("Your account"), "resumed at the account step");
    // The resumed handoff was consumed; the tab now notes the step it is on, for the next reload.
    expect(JSON.parse(sessionStorage.getItem(TOUR_HANDOFF_KEY)!)).toMatchObject({ stepId: "account", expectedPath: "/" });
    await click(button("Next"));
    await until(() => document.querySelector("[data-byline-tour-complete]"), "completion");
    expect(document.body.textContent).toContain("You’re ready.");
    await click(button("Start working"));
    await until(() => stored()?.status === "completed", "completed");
    expect(document.querySelector("[data-byline-tour-complete]")).toBeNull();
    expect(sessionStorage.getItem(TOUR_HANDOFF_KEY)).toBeNull();
  });

  it("an internal teardown (unmount mid-tour) records nothing", async () => {
    await mount();
    await until(welcome, "welcome");
    await click(button("Show me around"));
    await until(() => card(), "tour");
    await unmount();
    await act(tick);
    expect(env.writes).toHaveLength(0);
  });

  it("a stale handoff is ignored, and the welcome is due as normal", async () => {
    sessionStorage.setItem(TOUR_HANDOFF_KEY, JSON.stringify({ tour: "welcome", stepId: "account", expectedPath: "/admin", replay: false, savedAt: Date.now() - 60 * 60_000 }));
    await mount();
    await until(welcome, "welcome instead of a resumed tour");
    expect(card()).toBeNull();
  });

  it("replays from the account menu without resetting anything first", async () => {
    env.preferences.set(WELCOME_ONBOARDING_PREFERENCE, { schema: 1, status: "completed", finishedAt: "2026-11-01T00:00:00.000Z", acknowledgedRequestAt: null });
    await mount();
    await act(tick);
    expect(welcome()).toBeNull();
    await act(async () => replay());
    await until(welcome, "replayed welcome");
    expect(document.body.textContent).toContain("Welcome back, Maycie.");
    await click(button("Not now"));
    await until(() => env.writes.length === 1, "recorded");
    expect(stored()).toMatchObject({ status: "completed" });
  });

  it("starting from another screen goes Home through the shell first", async () => {
    env.pathname = "/admin/collections/stories/12";
    await mount();
    await until(welcome, "welcome on a Story");
    await click(button("Show me around"));
    await until(() => env.pushes.includes("/admin"), "navigated Home");
  });
});
