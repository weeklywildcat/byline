// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import path from "node:path";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { collectionRoute, type Collection } from "@byline/newsroom-screens/collections/collection-model";

/* ------------------------------------------------ the Payload/Next boundary */

const env = vi.hoisted(() => ({
  pathname: "/admin/collections",
  search: "",
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
  useSearchParams: () => new URLSearchParams(env.search),
  useRouter: () => ({ push: (href: string) => env.push(href) })
}));
vi.mock("next/link", () => ({
  default: ({ href, prefetch: _prefetch, children, ...props }: { href: string; prefetch?: boolean; children?: ReactNode } & Record<string, unknown>) => <a href={href} {...props}>{children}</a>
}));

const { BylineShell } = await import("../src/ui/shell/BylineShell");
const { BylineSidebar } = await import("../src/ui/shell/BylineSidebar");
const { BylineNav } = await import("../src/ui/shell/BylineNav");
const { shellLayoutFor, shellSidebarStyle } = await import("../src/ui/shell/layout");
const { COLLECTION_GEOMETRY, COLLECTION_WORKSPACE_MIN_WIDTH, COLLECTION_WORKSPACE_QUERY, COLLECTION_SWITCHER_VIEW_PREFERENCE } = await import("../src/ui/shell/shell-config");
const { activeNavKey, NAVIGATION, ADMINISTRATION, CREATE_ACTIONS, locationFor } = await import("../src/domain/navigation");
const { collectionSearch } = await import("../src/ui/collections/collection-route");
const { pinnedCurrentCollection } = await import("../src/ui/collections/CollectionSwitcher");

const src = (relative: string) => readFileSync(path.resolve(__dirname, "../src", relative), "utf8");

/* ------------------------------------------------------------- fixtures */

const person = (id: number, name: string) => ({ id, name, kind: "user" as const, avatarUrl: null });
function collection(id: number, name: string, patch: Partial<Collection> = {}): Collection {
  return {
    id, name, brief: "", type: "event", status: "active", lead: person(7, "Gibson Bell"), members: [], startDate: "", endDate: "", archived: false,
    createdAt: "", updatedAt: "2026-11-01T00:00:00Z", storyIds: [], storyCount: 3, storySummary: {}, interviewCount: 0, openTaskCount: 0, canEdit: true,
    ...patch
  };
}
const COLLECTIONS = [collection(1, "Marching Band State", { storyCount: 12 }), collection(2, "Election 2026"), collection(3, "Football playoffs", { status: "wrapping-up" })];

let requests: string[] = [];
function serve() {
  requests = [];
  vi.stubGlobal("fetch", vi.fn(async (input: string) => {
    requests.push(input);
    const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
    const detail = /\/byline\/collections\/(\d+)$/.exec(input);
    if (detail) {
      const found = [...COLLECTIONS, collection(9, "Archived project", { status: "archived", archived: true })].find((c) => c.id === Number(detail[1]));
      return found ? json({ collection: found, stories: [], interviews: [], tasks: [], resources: [], appointments: [] }) : new Response("{}", { status: 404 });
    }
    if (input.includes("/byline/collections")) {
      const search = new URL(input, "http://x").searchParams.get("search") ?? "";
      const rows = COLLECTIONS.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()));
      return json({ collections: rows, people: [], timezone: "America/New_York", canCreate: true, total: rows.length, pages: 1 });
    }
    return json({ stories: [], timezone: "America/New_York", workflowStatuses: [], capabilities: {}, currentUser: null });
  }));
}

/* ------------------------------------------------------------- harness */

function matchMedia() {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query === COLLECTION_WORKSPACE_QUERY ? env.wide : false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {}
  }));
}

const sidebarProps = {
  items: NAVIGATION.map((item) => ({ key: item.key, label: item.label, path: item.path, ...(item.exact ? { exact: true } : {}), href: `/admin${item.path}` })),
  adminRoute: "/admin",
  homeHref: "/admin",
  user: { name: "Gibson Bell", subtitle: "Editor", avatarUrl: null },
  systemHref: null,
  logoutUrl: "/api/users/logout",
  loginHref: "/admin/login"
};

let root: Root | null = null;
async function render({ defaultOpen = true } = {}) {
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => { root!.render(<BylineShell defaultOpen={defaultOpen}><BylineSidebar {...sidebarProps} /></BylineShell>); });
  await settle();
}
async function rerender() {
  await act(async () => { root!.render(<BylineShell defaultOpen><BylineSidebar {...sidebarProps} /></BylineShell>); });
  await settle();
}
async function settle(ms = 0) {
  for (let i = 0; i < 5; i++) await act(async () => { await new Promise((resolve) => setTimeout(resolve, ms)); });
}

const $ = <T extends Element = HTMLElement>(selector: string) => document.querySelector<T>(selector);
const sidebarWidth = () => $(`[data-slot=sidebar-wrapper]`)!.style.getPropertyValue("--sidebar-width");

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
Element.prototype.scrollIntoView ??= () => {};

beforeEach(() => {
  env.pathname = "/admin/collections";
  env.search = "";
  env.wide = true;
  env.role = "editor";
  env.push = vi.fn();
  env.preferences = new Map();
  document.cookie = "byline_sidebar=; max-age=0; path=/";
  matchMedia();
  serve();
});

afterEach(async () => {
  await act(async () => { root?.unmount(); });
  root = null;
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

/* --------------------------------------------------------------- tests */

describe("Collections in the newsroom", () => {
  it("is the destination after Media, named Collections, never Coverage", () => {
    expect(NAVIGATION.map((item) => item.key)).toEqual(["home", "stories", "calendar", "media", "collections", "people"]);
    expect(NAVIGATION.find((item) => item.key === "collections")).toMatchObject({ label: "Collections", path: "/collections", exact: true });
    expect(JSON.stringify(NAVIGATION)).not.toMatch(/coverage/i);
    expect(ADMINISTRATION.find((item) => item.key === "raw-collections")).toMatchObject({ path: "/collections/collections", minimumRole: "administrator" });
    expect(ADMINISTRATION.some((item) => item.path.includes("coverages"))).toBe(false);
    expect(src("ui/shell/nav-items.ts")).toContain("collections: Layers");
  });

  it("is active on the list and an open Collection, and never on Payload's raw collection screens", () => {
    expect(activeNavKey(sidebarProps.items, "/admin/collections", "/admin")).toBe("collections");
    expect(activeNavKey(sidebarProps.items, "/admin/collections/", "/admin")).toBe("collections");
    expect(activeNavKey(sidebarProps.items, "/admin/collections/media", "/admin")).toBeNull();
    expect(activeNavKey(sidebarProps.items, "/admin/collections/collections", "/admin")).toBeNull();
    expect(activeNavKey(sidebarProps.items, "/admin/collections/stories/4", "/admin")).toBe("stories");
    expect(locationFor("/admin/collections", "/admin")).toEqual([{ label: "Collections" }]);
  });

  it("is created by editors, after Story and Task, through the one Create controller", () => {
    expect(CREATE_ACTIONS.map((action) => action.kind)).toEqual(["story", "task", "collection", "media"]);
    expect(CREATE_ACTIONS.find((action) => action.kind === "collection")!.minimumRole).toBe("editor");
    const create = src("ui/shell/create.tsx");
    expect(create.match(/<CollectionDialog/g)).toHaveLength(1);
    expect(src("ui/collections/NewsroomCollectionsScreen.tsx")).toContain('openCreate("collection")');
  });

  it("preserves exact matching through BylineNav's server-to-sidebar mapping", async () => {
    const sidebar = await BylineNav({
      user: { id: 7, collection: "users", role: "editor", enabled: true, name: "Editor", linkedPerson: null },
      payload: { config: { routes: { admin: "/admin", api: "/api" } } }
    } as Parameters<typeof BylineNav>[0]);
    const items = sidebar!.props.items;
    expect(items.find((item: { key: string }) => item.key === "collections")).toMatchObject({ exact: true });
    expect(activeNavKey(items, "/admin/collections", "/admin")).toBe("collections");
    expect(activeNavKey(items, "/admin/collections/collections", "/admin")).toBeNull();
    expect(activeNavKey(items, "/admin/collections/stories/4", "/admin")).toBe("stories");
  });

  it("serves exactly /admin/collections without touching Payload's /admin/collections/<slug> screens", () => {
    const page = src("app/(payload)/admin/collections/page.tsx");
    expect(page).toContain("RootPage({ config, params, searchParams, importMap })");
    expect(src("payload.config.ts")).toContain("path: COLLECTIONS_VIEW_PATH, exact: true");
  });
});

describe("the Collection workspace composition", () => {
  const wide = { storyWorkspace: true, calendarWorkspace: true, mediaWorkspace: true, collectionWorkspace: true };
  const narrow = { storyWorkspace: false, calendarWorkspace: false, mediaWorkspace: false, collectionWorkspace: false };

  it("is only an open Collection on a wide enough screen; the list keeps the ordinary sidebar", () => {
    expect(shellLayoutFor("/admin/collections", "/admin", wide)).toEqual({ storyId: null, stories: false, calendar: false, media: false, collections: true, collectionId: null, composition: "default" });
    expect(shellLayoutFor("/admin/collections", "/admin", wide, "collection=12&tab=stories")).toEqual({ storyId: null, stories: false, calendar: false, media: false, collections: true, collectionId: 12, composition: "collection-workspace" });
    expect(shellLayoutFor("/admin/collections", "/admin", narrow, "collection=12").composition).toBe("default");
    expect(shellLayoutFor("/admin/collections", "/admin", wide, "collection=nope").collectionId).toBeNull();
    // A `collection` query anywhere else is not a Collection.
    expect(shellLayoutFor("/admin/calendar", "/admin", wide, "collection=12").collectionId).toBeNull();
    expect(shellLayoutFor("/admin/collections/collections", "/admin", wide, "collection=12").composition).toBe("default");
  });

  it("reserves the rail plus the switcher (340px), on a breakpoint measured for Collections", () => {
    expect(shellSidebarStyle({ composition: "collection-workspace" })).toMatchObject({ "--sidebar-width": "340px", "--sidebar-width-icon": "48px" });
    expect(COLLECTION_WORKSPACE_MIN_WIDTH).toBeGreaterThanOrEqual(COLLECTION_GEOMETRY.sidebar + COLLECTION_GEOMETRY.sidePadding + COLLECTION_GEOMETRY.contentMin);
    expect(COLLECTION_WORKSPACE_QUERY).toBe(`(min-width: ${COLLECTION_WORKSPACE_MIN_WIDTH}px)`);
  });

  it("keeps a Collection, its section and an open interview in the address", () => {
    expect(collectionSearch({ collectionId: null, tab: "overview", interviewId: null })).toBe("");
    expect(collectionSearch({ collectionId: 12, tab: "overview", interviewId: null })).toBe("?collection=12");
    expect(collectionSearch({ collectionId: 12, tab: "stories", interviewId: null })).toBe("?collection=12&tab=stories");
    expect(collectionSearch({ collectionId: 12, tab: "overview", interviewId: 4 })).toBe("?collection=12&tab=reporting&interview=4");
    const round = new URLSearchParams(collectionSearch({ collectionId: 12, tab: "resources", interviewId: null }));
    expect(collectionRoute({ collection: round.get("collection"), tab: round.get("tab"), interview: round.get("interview") })).toEqual({ collectionId: 12, tab: "resources", interviewId: null });
  });

  it("never lets the open Collection disappear from the switcher", () => {
    expect(pinnedCurrentCollection(COLLECTIONS, COLLECTIONS[0])).toBeNull();
    expect(pinnedCurrentCollection(COLLECTIONS.slice(1), COLLECTIONS[0])?.id).toBe(1);
    expect(pinnedCurrentCollection(COLLECTIONS, null)).toBeNull();
  });
});

describe("the one sidebar on Collections", () => {
  it("the Collections list keeps the global sidebar at 256px", async () => {
    await render();
    expect(sidebarWidth()).toBe("256px");
    expect($("[data-composition]")!.dataset.composition).toBe("default");
    expect($("[data-byline-collection-pane]")).toBeNull();
    expect($("nav[aria-label=Byline] a[aria-current=page]")!.textContent).toBe("Collections");
  });

  it("an open Collection is sidebar-09: the icon rail and the Collection switcher, the open one current", async () => {
    env.search = "collection=1";
    await render();
    expect(document.querySelectorAll("[data-slot=sidebar-wrapper]")).toHaveLength(1);
    expect(sidebarWidth()).toBe("340px");
    expect($("[data-composition]")!.dataset.composition).toBe("collection-workspace");
    expect($("[data-byline-rail]")).not.toBeNull();
    const pane = $("[data-byline-collection-pane]")!;
    expect(pane.querySelector("input[type=search]")!.getAttribute("aria-label")).toBe("Search collections");
    const current = pane.querySelector<HTMLAnchorElement>("a[aria-current=page]")!;
    expect(current.dataset.collectionId).toBe("1");
    expect(current.getAttribute("href")).toBe("/admin/collections?collection=1");
    expect([...pane.querySelectorAll("a[data-collection-id]")].map((a) => a.textContent)).toEqual(expect.arrayContaining([expect.stringContaining("Election 2026")]));
    // The view is remembered in Payload Preferences, read once.
    expect(env.preferences.has(COLLECTION_SWITCHER_VIEW_PREFERENCE)).toBe(false);
  });

  it("⌘\\ leaves the rail; the pane is inert until expanded again", async () => {
    env.search = "collection=1";
    await render();
    await act(async () => { window.dispatchEvent(new KeyboardEvent("keydown", { key: "\\", metaKey: true })); });
    expect($("[data-slot=sidebar]")!.dataset.state).toBe("collapsed");
    expect($("[data-byline-rail]")).not.toBeNull();
    expect($("[data-byline-collection-pane]")!.hasAttribute("inert")).toBe(true);
    await act(async () => { window.dispatchEvent(new KeyboardEvent("keydown", { key: "\\", metaKey: true })); });
    expect($("[data-slot=sidebar]")!.dataset.state).toBe("expanded");
    expect($("[data-byline-collection-pane]")!.hasAttribute("inert")).toBe(false);
  });

  it("keeps the switcher's search while moving between Collections, and pins the open one", async () => {
    env.search = "collection=1";
    await render();
    const input = $<HTMLInputElement>("[data-byline-collection-pane] input[type=search]")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "election");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await settle(250);
    const pane = () => $("[data-byline-collection-pane]")!;
    expect(pane().textContent).toContain("Current collection");
    env.search = "collection=2";
    await rerender();
    expect($<HTMLInputElement>("[data-byline-collection-pane] input[type=search]")!.value).toBe("election");
    expect(pane().querySelector<HTMLElement>("a[aria-current=page]")!.dataset.collectionId).toBe("2");
    expect(pane().textContent).not.toContain("Current collection");
  });

  it("a narrower screen keeps the ordinary sidebar and reserves no switcher", async () => {
    env.search = "collection=1";
    env.wide = false;
    await render();
    expect(sidebarWidth()).toBe("256px");
    expect($("[data-byline-collection-pane]")).toBeNull();
    expect($("nav[aria-label=Byline] a[aria-current=page]")!.textContent).toBe("Collections");
  });
});
