// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import path from "node:path";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BUILT_IN_STORY_VIEWS } from "@byline/newsroom-screens/planning/story-views";
import { EMPTY_PLANNING_FILTERS, type PlanningStory } from "@byline/newsroom-screens/planning/planning-model";
import { workspaceQueryClient } from "@byline/newsroom-screens/workspace/workspace-query";

/* ------------------------------------------------ the Payload/Next boundary */

const env = vi.hoisted(() => ({
  pathname: "/admin",
  wide: true,
  role: "editor" as string,
  push: (() => {}) as (href: string) => void,
  preferences: new Map<string, unknown>()
}));

vi.mock("@payloadcms/ui", () => ({
  useAuth: () => ({ user: { id: 7, collection: "users", role: env.role, enabled: true, name: "Gibson Bell", linkedPerson: null } }),
  useConfig: () => ({ config: { routes: { admin: "/admin", api: "/api" } } }),
  usePreferences: () => ({
    getPreference: async (key: string) => env.preferences.get(key) ?? null,
    setPreference: async (key: string, value: unknown) => { env.preferences.set(key, value); }
  }),
  useRouteTransition: () => ({ startRouteTransition: (run: () => void) => run() })
}));
vi.mock("next/navigation", () => ({
  usePathname: () => env.pathname,
  useRouter: () => ({ push: (href: string) => env.push(href) })
}));
vi.mock("next/link", () => ({
  default: ({ href, prefetch: _prefetch, children, ...props }: { href: string; prefetch?: boolean; children?: ReactNode } & Record<string, unknown>) => <a href={href} {...props}>{children}</a>
}));

const { BylineShell } = await import("../src/ui/shell/BylineShell");
const { BylineSidebar } = await import("../src/ui/shell/BylineSidebar");
const { useStorySwitcher } = await import("../src/ui/shell/StorySwitcher");
const { useLeaveGuard, waitForSavedDocument } = await import("../src/ui/shell/navigation");
const { shellLayoutFor, shellSidebarStyle } = await import("../src/ui/shell/layout");
const { STORY_WORKSPACE_MIN_WIDTH, STORY_WORKSPACE_QUERY } = await import("../src/ui/shell/shell-config");
const { pinnedCurrentStory, storySwitcherFilters, storySwitcherMeta, storySwitcherQueues, storySwitcherRows } = await import("../src/ui/shell/story-switcher-model");
const { activeNavKey } = await import("../src/domain/navigation");

const src = (relative: string) => readFileSync(path.resolve(__dirname, "../src", relative), "utf8");
const screens = (relative: string) => readFileSync(path.resolve(__dirname, "../../../packages/newsroom-screens/src", relative), "utf8");

/* ------------------------------------------------------------- fixtures */

const person = (id: number, name: string) => ({ id, name, kind: "user" as const, avatarUrl: null });
function story(id: number, title: string, patch: Partial<PlanningStory> = {}): PlanningStory {
  return {
    id, title, editUrl: "", authors: [], writer: null, editor: null,
    workflow: { id: "reporting", label: "Reporting", group: "main" } as PlanningStory["workflow"],
    publicationState: { id: "draft", label: "Draft", isPublished: false } as PlanningStory["publicationState"],
    deadline: null, plannedPublication: null, modifiedAt: null,
    visual: { type: "none", status: "none" } as PlanningStory["visual"],
    openTaskCount: 0, featuredImage: null,
    ...patch
  };
}

const STORIES = [
  story(1, "Robotics team heads to state", { writer: person(7, "Gibson Bell"), deadline: "2026-11-08" }),
  story(2, "AI jobs in Greenwood", { editor: person(7, "Gibson Bell"), workflow: { id: "writing", label: "Writing", group: "main" } as PlanningStory["workflow"] }),
  story(3, "Band director profile", { writer: person(9, "Ana Ruiz"), workflow: { id: "ready-for-review", label: "Ready for review", group: "main" } as PlanningStory["workflow"] })
];

/** What the server would answer: only the stories this account may read (here, never story 99 or 404). */
let requests: string[] = [];
let workspaceStatus = 200;
function serve() {
  requests = [];
  vi.stubGlobal("fetch", vi.fn(async (input: string) => {
    requests.push(input);
    if (input.includes("/byline/planning")) {
      return new Response(JSON.stringify({ stories: STORIES, timezone: "America/New_York", workflowStatuses: [], capabilities: { canMoveStories: true, canAssign: true, canManageSavedViews: true, canManageMedia: false, canManageFeedback: false }, currentUser: person(7, "Gibson Bell") }), { status: 200, headers: { "content-type": "application/json" } });
    }
    const workspace = /\/stories\/(\d+)\/workspace/.exec(input);
    const readable = workspace ? [...STORIES, story(99, "Open but not in this queue", { workflow: { id: "editing", label: "Editing", group: "main" } as PlanningStory["workflow"] })].find((item) => item.id === Number(workspace[1])) : undefined;
    if (readable && workspaceStatus === 200) {
      return new Response(JSON.stringify({ story: readable }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response(JSON.stringify({ message: "Not allowed" }), { status: workspaceStatus === 200 ? 404 : workspaceStatus, headers: { "content-type": "application/json" } });
  }));
}

/* ------------------------------------------------------------- harness */

function matchMedia() {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query === STORY_WORKSPACE_QUERY ? env.wide : query.includes("max-width: 767px") ? false : false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {}
  }));
}

const sidebarProps = {
  items: [
    { key: "home", label: "Home", path: "", href: "/admin" },
    { key: "stories", label: "Stories", path: "/stories", href: "/admin/stories" }
  ],
  adminRoute: "/admin",
  homeHref: "/admin",
  user: { name: "Gibson Bell", subtitle: "Editor", avatarUrl: null },
  systemHref: null,
  logoutUrl: "/api/users/logout",
  loginHref: "/admin/login"
};

let root: Root | null = null;
let host: HTMLDivElement;

async function render(ui: ReactNode = null, { defaultOpen = true } = {}) {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => { root!.render(<BylineShell defaultOpen={defaultOpen}><BylineSidebar {...sidebarProps} />{ui}</BylineShell>); });
  await settle();
}

/** Let queries resolve and the AdminRoot second render happen. */
async function settle(ms = 0) {
  for (let i = 0; i < 4; i++) await act(async () => { await new Promise((resolve) => setTimeout(resolve, ms)); });
}

const $ = <T extends Element = HTMLElement>(selector: string) => document.querySelector<T>(selector);
const $$ = (selector: string) => Array.from(document.querySelectorAll<HTMLElement>(selector));
const sidebarWidth = () => $(`[data-slot=sidebar-wrapper]`)!.style.getPropertyValue("--sidebar-width");

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
// jsdom lays nothing out.
Element.prototype.scrollIntoView ??= () => {};

beforeEach(() => {
  env.pathname = "/admin";
  env.wide = true;
  env.role = "editor";
  env.push = vi.fn();
  env.preferences = new Map();
  workspaceStatus = 200;
  workspaceQueryClient.clear();
  document.cookie = "byline_sidebar=; max-age=0; path=/";
  matchMedia();
  serve();
});

afterEach(async () => {
  await act(async () => { root?.unmount(); });
  root = null;
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

/* --------------------------------------------------------------- tests */

describe("the contextual sidebar's layout", () => {
  const wide = { storyWorkspace: true, calendarWorkspace: true };
  const narrow = { storyWorkspace: false, calendarWorkspace: false };

  it("is a Story workspace only on a saved story's Story screen, on a wide screen", () => {
    expect(shellLayoutFor("/admin/collections/stories/12", "/admin", wide)).toEqual({ storyId: 12, calendar: false, composition: "story-workspace" });
    expect(shellLayoutFor("/admin/collections/stories/12", "/admin", narrow)).toEqual({ storyId: 12, calendar: false, composition: "default" });
    for (const path of ["/admin", "/admin/stories", "/admin/collections/stories", "/admin/collections/stories/create"]) {
      expect(shellLayoutFor(path, "/admin", wide).composition).toBe("default");
    }
  });

  it("reserves sidebar-09's 350px only for a workspace; ordinary screens keep 256px", () => {
    expect(shellSidebarStyle({ composition: "default" })).toMatchObject({ "--sidebar-width": "256px", "--sidebar-width-icon": "48px" });
    expect(shellSidebarStyle({ composition: "story-workspace" })).toMatchObject({ "--sidebar-width": "350px", "--sidebar-width-icon": "48px" });
    expect(shellSidebarStyle({ composition: "calendar-workspace" })).toMatchObject({ "--sidebar-width": "350px", "--sidebar-width-icon": "48px" });
  });

  it("needs a viewport wide enough for the 760px article beside the workspace, and the header's CSS fallback agrees", () => {
    expect(STORY_WORKSPACE_MIN_WIDTH).toBeGreaterThanOrEqual(350 + 120 + 64 + 760);
    expect(src("ui/story/StoryHeader.tsx")).toContain(`min-[${STORY_WORKSPACE_MIN_WIDTH}px]:hidden`);
    expect(src("ui/story/WriteTab.tsx")).toContain("max-w-[760px]");
  });

  it("activates Stories inside a Story document", () => {
    expect(activeNavKey(sidebarProps.items, "/admin/collections/stories/12", "/admin")).toBe("stories");
    expect(activeNavKey(sidebarProps.items, "/admin/collections/stories/create", "/admin")).toBeNull();
  });
});

describe("the one sidebar, composed by route and width", () => {
  it("ordinary routes use the global sidebar at 256px", async () => {
    await render();
    expect(sidebarWidth()).toBe("256px");
    expect($("[data-composition]")!.dataset.composition).toBe("default");
    expect($("[data-byline-rail]")).toBeNull();
    expect($("[data-byline-story-pane]")).toBeNull();
  });

  it("a wide Story route is sidebar-09: one provider, an outer collapsible=icon sidebar holding the icon rail and the Story pane, at 350px", async () => {
    env.pathname = "/admin/collections/stories/1";
    await render();
    expect($$("[data-slot=sidebar-wrapper]")).toHaveLength(1);
    expect(sidebarWidth()).toBe("350px");
    const outer = $("[data-slot=sidebar]")!;
    const container = $("[data-composition]")!;
    expect(container.dataset.composition).toBe("story-workspace");
    expect(container.className).toContain("overflow-hidden");
    expect(container.className).toContain("*:data-[sidebar=sidebar]:flex-row");
    expect(outer.dataset.state).toBe("expanded");
    const rail = container.querySelector<HTMLElement>("[data-byline-rail]")!;
    const pane = container.querySelector<HTMLElement>("[data-byline-story-pane]")!;
    expect(rail.className).toContain("w-[calc(var(--sidebar-width-icon)+1px)]!");
    expect(pane.className).toContain("flex-1");
    expect(rail.compareDocumentPosition(pane) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // The outer sidebar is the only collapsible one; both inner sidebars are collapsible="none".
    expect(src("ui/shell/BylineSidebar.tsx")).toContain('<Sidebar collapsible="icon"');
    expect(src("ui/shell/BylineIconRail.tsx")).toContain('<Sidebar collapsible="none"');
    expect(src("ui/shell/StoryWorkspaceSidebar.tsx")).toContain('<Sidebar collapsible="none"');
    expect(src("ui/shell/BylineShell.tsx").match(/<SidebarProvider/g)).toHaveLength(1);
    expect(src("ui/story/StoryScreen.tsx")).not.toContain("SidebarProvider");
  });

  it("collapsing (⌘\\) leaves only the icon rail and remembers it in the one cookie", async () => {
    env.pathname = "/admin/collections/stories/1";
    await render();
    await act(async () => { window.dispatchEvent(new KeyboardEvent("keydown", { key: "\\", metaKey: true })); });
    const outer = $("[data-slot=sidebar]")!;
    expect(outer.dataset.state).toBe("collapsed");
    expect(outer.dataset.collapsible).toBe("icon");
    expect($("[data-byline-rail]")).not.toBeNull();
    expect($("[data-byline-story-pane]")!.hasAttribute("inert")).toBe(true);
    expect(document.cookie).toContain("byline_sidebar=false");
    expect(document.cookie).not.toMatch(/story/i);
  });

  it("entering a Story with the sidebar collapsed shows the rail alone", async () => {
    env.pathname = "/admin/collections/stories/1";
    await render(null, { defaultOpen: false });
    expect($("[data-slot=sidebar]")!.dataset.state).toBe("collapsed");
    expect($("[data-byline-rail]")).not.toBeNull();
  });

  it("a Story on a narrower screen keeps the ordinary sidebar and reserves no 350px", async () => {
    env.pathname = "/admin/collections/stories/1";
    env.wide = false;
    await render();
    expect(sidebarWidth()).toBe("256px");
    expect($("[data-composition]")!.dataset.composition).toBe("default");
    expect($("[data-byline-story-pane]")).toBeNull();
    expect($("nav[aria-label=Byline] a[aria-current=page]")!.textContent).toBe("Stories");
  });
});

describe("the global icon rail", () => {
  beforeEach(() => { env.pathname = "/admin/collections/stories/1"; });

  it("is icons only, named for assistive technology, with Stories current", async () => {
    await render();
    const links = $$("[data-byline-rail] nav a");
    expect(links.map((link) => link.getAttribute("href"))).toEqual(["/admin", "/admin/stories"]);
    expect(links.map((link) => link.textContent)).toEqual(["Home", "Stories"]);
    for (const link of links) expect(link.querySelector("span")!.className).toContain("sr-only");
    expect($("[data-byline-rail] a[aria-current=page]")!.getAttribute("href")).toBe("/admin/stories");
    // Tooltips stay on while the sidebar around the rail is expanded (sidebar-09's `hidden: false`).
    expect(src("ui/shell/BylineIconRail.tsx")).toContain("tooltip={{ children: item.label, hidden: false }}");
    expect(src("../../../packages/newsroom-ui/src/ui/sidebar.tsx")).toContain("content.hidden ??");
  });

  it("Create is a + that opens the Create menu, never a direct new story", async () => {
    await render();
    const create = $("[data-byline-rail] [aria-label=Create]")!;
    expect(create.textContent).toBe("Create");
    expect(create.querySelector("span")!.className).toContain("sr-only");
    expect(create.getAttribute("aria-haspopup")).toBe("menu");
    expect($("[data-byline-rail] [data-create-primary]")).toBeNull();
    expect(src("ui/shell/BylineIconRail.tsx")).toContain("<CreateMenu compact />");
  });

  it("the account is the avatar alone, with the same menu", async () => {
    await render();
    const account = $("[data-byline-rail] [aria-label='Account: Gibson Bell']")!;
    expect(account.getAttribute("aria-haspopup")).toBe("menu");
    expect(account.textContent).toBe("GB");
    expect(src("ui/shell/BylineIconRail.tsx")).toContain("<NavUser compact ");
  });

  it("global destinations leave the workspace for the ordinary screen", async () => {
    await render();
    expect($("[data-byline-rail] a[aria-label='Byline Home']")!.getAttribute("href")).toBe("/admin");
  });
});

describe("the Story switcher", () => {
  beforeEach(() => { env.pathname = "/admin/collections/stories/1"; });

  const queueParams = () => requests.filter((url) => url.includes("/byline/planning")).map((url) => new URL(url, "http://x").searchParams);

  it("starts on My stories, reads the canonical Planning preset through the Planning API, and lists only the stories it returns", async () => {
    await render();
    const [params] = queueParams();
    expect(params?.get("mine")).toBe("1");
    expect(params?.has("needs_review")).toBe(false);
    const rows = $$("[data-byline-story-pane] a[data-story-id]");
    // Mine = written or edited by the account (Planning's own rule): 1 and 2, never 3, never anything the server did not send.
    expect(rows.map((row) => row.dataset.storyId)).toEqual(["1", "2"]);
    expect($("[data-byline-story-pane]")!.textContent).not.toContain("Band director profile");
  });

  it("marks the open story as the current page, with one line of context", async () => {
    await render();
    const current = $("[data-byline-story-pane] a[aria-current=page]")!;
    expect(current.dataset.storyId).toBe("1");
    expect(current.getAttribute("href")).toBe("/admin/collections/stories/1");
    expect(current.textContent).toBe("Robotics team heads to stateReporting · Nov 8");
  });

  it("changing the queue changes the Planning filters, and remembers the choice in Payload Preferences", async () => {
    await render();
    await act(async () => { $("[aria-label='Story queue: My stories']")!.click(); });
    await settle();
    const review = $$("[role=menuitemradio]").find((item) => item.textContent === "Ready for review")!;
    await act(async () => { review.click(); });
    await settle();
    expect(queueParams().at(-1)?.get("needs_review")).toBe("1");
    // Only story 3 is ready for review; the open story 1 stays pinned above it.
    expect($$("[data-byline-story-pane] ul a[data-story-id]").map((row) => row.dataset.storyId)).toEqual(["3"]);
    expect($("[data-byline-story-pane] a[aria-current=page]")!.dataset.storyId).toBe("1");
    expect(env.preferences.get("byline:story-switcher:queue:v1")).toBe("review");
  });

  it("search is Planning's own query, scoped to the queue", async () => {
    await render();
    const input = $<HTMLInputElement>("[data-byline-story-pane] input[type=search]")!;
    expect(input.placeholder).toBe("Search stories...");
    await act(async () => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      set.call(input, "greenwood");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await settle(250);
    const params = queueParams().at(-1)!;
    expect(params.get("search")).toBe("greenwood");
    expect(params.get("mine")).toBe("1");
    // The open story (1) does not match, so it is pinned above the one result.
    expect($$("[data-byline-story-pane] a[data-story-id]").map((row) => row.dataset.storyId)).toEqual(["1", "2"]);
    expect($("[data-byline-story-pane]")!.textContent).toContain("Current story");
  });

  it("keeps the open story in view when its queue leaves it out, from the authenticated workspace", async () => {
    env.pathname = "/admin/collections/stories/99";
    await render();
    const pane = $("[data-byline-story-pane]")!;
    expect(pane.textContent).toContain("Current story");
    expect(pane.querySelector<HTMLElement>("a[aria-current=page]")!.dataset.storyId).toBe("99");
    expect(requests.some((url) => /\/stories\/99\/workspace/.test(url))).toBe(true);
  });

  it("pins nothing the account cannot read", async () => {
    env.pathname = "/admin/collections/stories/99";
    workspaceStatus = 403;
    await render();
    const pane = $("[data-byline-story-pane]")!;
    expect(pane.textContent).not.toContain("Current story");
    expect(pane.querySelector("[data-story-id='99']")).toBeNull();
  });

  it("the narrow-screen sheet is the same content and controller as the workspace pane", async () => {
    function OpenSheet() {
      const { openSheet } = useStorySwitcher();
      return <button type="button" data-open-sheet="" onClick={openSheet}>Switch story</button>;
    }
    await render(<OpenSheet />);
    await act(async () => { $("[data-open-sheet]")!.click(); });
    await settle();
    const sheet = $("[data-byline-story-sheet]")!;
    expect(sheet.querySelector("[data-byline-story-switcher=sheet]")).not.toBeNull();
    expect($("[data-byline-story-pane] [data-byline-story-switcher=sidebar]")).not.toBeNull();
    expect(sheet.querySelector("[aria-label='Story queue: My stories']")).not.toBeNull();
    expect(Array.from(sheet.querySelectorAll<HTMLElement>("a[data-story-id]")).map((row) => row.dataset.storyId)).toEqual(["1", "2"]);
    expect(src("ui/story/StoryHeader.tsx")).toContain("useStorySwitcher()");
  });
});

describe("Story switcher queues and rows", () => {
  it("are the canonical built-in views; staff do not get Ready for review", () => {
    expect(storySwitcherQueues("editor").map((queue) => queue.id)).toEqual(["mine", "review", "all"]);
    expect(storySwitcherQueues("administrator").map((queue) => queue.id)).toEqual(["mine", "review", "all"]);
    expect(storySwitcherQueues("staff").map((queue) => queue.id)).toEqual(["mine", "all"]);
    for (const id of ["mine", "review", "all"] as const) {
      expect(storySwitcherFilters(id, "")).toEqual({ ...EMPTY_PLANNING_FILTERS, ...BUILT_IN_STORY_VIEWS.find((view) => view.id === id)!.filters });
    }
    expect(storySwitcherFilters("mine", "  robots ")).toMatchObject({ mine: true, query: "robots" });
  });

  it("show stage then deadline, or else who has it", () => {
    expect(storySwitcherMeta(STORIES[0]!, "America/New_York")).toBe("Reporting · Nov 8");
    expect(storySwitcherMeta(STORIES[1]!, "America/New_York")).toBe("Writing · Gibson Bell");
    expect(storySwitcherMeta(story(5, "Done", { publicationState: { id: "published", label: "Published", isPublished: true } as PlanningStory["publicationState"] }), "UTC")).toBe("Published");
  });

  it("leave finished published stories out until searched for, and pin only a story missing from the list", () => {
    const published = story(6, "Homecoming recap", { publicationState: { id: "published", label: "Published", isPublished: true } as PlanningStory["publicationState"] });
    expect(storySwitcherRows([published, STORIES[0]!], storySwitcherFilters("all", ""), 7).map((row) => row.id)).toEqual([1]);
    expect(storySwitcherRows([published, STORIES[0]!], storySwitcherFilters("all", "homecoming"), 7).map((row) => row.id)).toEqual([6]);
    expect(pinnedCurrentStory(STORIES, STORIES[0])).toBeNull();
    expect(pinnedCurrentStory(STORIES, published)).toBe(published);
  });
});

describe("leaving a story with unsaved work", () => {
  it("waits for Payload's own autosave, and reports when waiting will not save it", async () => {
    vi.useFakeTimers();
    let state = { modified: true, saving: false };
    const saved = waitForSavedDocument(() => state);
    await vi.advanceTimersByTimeAsync(1200);
    state = { modified: true, saving: true };
    await vi.advanceTimersByTimeAsync(4000);
    state = { modified: false, saving: false };
    await vi.advanceTimersByTimeAsync(100);
    await expect(saved).resolves.toBe(true);

    const stuck = waitForSavedDocument(() => ({ modified: true, saving: false }));
    await vi.advanceTimersByTimeAsync(3100);
    await expect(stuck).resolves.toBe(false);
  });

  it("a shell link waits for the open story's save before navigating", async () => {
    env.pathname = "/admin/collections/stories/1";
    const state = { modified: true, saving: false };
    function Guard() { useLeaveGuard(() => state); return null; }
    await render(<Guard />);
    vi.useFakeTimers();
    await act(async () => { $("[data-byline-story-pane] a[data-story-id='2']")!.click(); });
    expect(env.push).not.toHaveBeenCalled();
    state.saving = true;
    await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
    expect(env.push).not.toHaveBeenCalled();
    state.modified = false;
    state.saving = false;
    await act(async () => { await vi.advanceTimersByTimeAsync(200); });
    expect(env.push).toHaveBeenCalledWith("/admin/collections/stories/2");
  });

  it("asks before leaving work that is still not saved, and stays unless told to leave", async () => {
    env.pathname = "/admin/collections/stories/1";
    function Guard() { useLeaveGuard(() => ({ modified: true, saving: false })); return null; }
    await render(<Guard />);
    vi.useFakeTimers();
    await act(async () => { $("[data-byline-rail] a[href='/admin']")!.click(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(3200); });
    vi.useRealTimers();
    await settle();
    expect(document.body.textContent).toContain("Leave without saving?");
    expect(env.push).not.toHaveBeenCalled();
    const leave = $$("button").find((button) => button.textContent === "Leave anyway")!;
    await act(async () => { leave.click(); });
    expect(env.push).toHaveBeenCalledWith("/admin");
  });

  it("the Story screen reports Payload's form state; it never saves on its own", () => {
    const screen = src("ui/story/StoryScreen.tsx");
    expect(screen).toContain("useLeaveGuard(() => ({ modified, saving: processing || background }))");
    const navigation = src("ui/shell/navigation.tsx");
    expect(navigation).not.toMatch(/\bsubmit\(|window\.location\.assign/);
    for (const file of ["ui/shell/create.tsx", "ui/shell/search.tsx", "ui/shell/StorySwitcher.tsx"]) expect(src(file)).not.toContain("window.location.assign");
  });
});

describe("Stories has one sidebar", () => {
  it("renders no contextual views rail beside the collection", () => {
    const page = screens("planning/StoriesPage.tsx");
    expect(page).not.toMatch(/StoryViewsRail|STORIES_RAIL|@min-\[1080px\]/);
    expect(page).toContain("<StoryViewsPicker views={storyViews} />");
    expect(screens("planning/StoryViews.tsx")).not.toContain("export function StoryViewsRail");
  });

  it("leaves New story to the shell's Create in the Payload newsroom", () => {
    expect(src("ui/stories/NewsroomStories.tsx")).not.toContain("onNewStory");
    expect(screens("planning/StoriesPage.tsx")).toContain("onNewStory?: () => void;");
  });
});
