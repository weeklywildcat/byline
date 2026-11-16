import type { Role } from "./vocabulary";

export type NavItem = {
  readonly key: string;
  readonly label: string;
  /** Path below the admin route. */
  readonly path: string;
  readonly minimumRole: Role;
  /** Active only on exactly its path (Collections: Payload's raw `/collections/<slug>` screens are not it). */
  readonly exact?: boolean;
  /** Editors' coordination desks are grouped under "Publish"; everything else is the main group. */
  readonly group?: "publish";
};

const RANK: Record<Role, number> = { staff: 1, editor: 2, administrator: 3 };

/** Whether a role reaches a minimum role (staff < editor < administrator). */
export function roleAllows(role: Role, minimumRole: Role): boolean {
  return RANK[role] >= RANK[minimumRole];
}

const allowed = (role: Role) => (item: { minimumRole: Role }) => roleAllows(role, item.minimumRole);

/** Stories' address below the admin route: Board, List and the filters are its query. */
export const STORIES_PATH = "/stories";

/** The Calendar's address below the admin route (a custom root view). */
export const CALENDAR_PATH = "/calendar";

/** Media's address below the admin route: the Library (files, folders) and Work (production assignments). */
export const MEDIA_PATH = "/media";

/**
 * Collections' address below the admin route: exactly `/collections` (a
 * Collection, its section and an open interview are the query). Payload's
 * raw collection screens live below it (`/collections/<slug>`) and are never
 * this destination.
 */
export const COLLECTIONS_PATH = "/collections";

/**
 * The Collections view's internal Payload path. Payload refuses a custom view
 * at exactly `/collections`, so `app/(payload)/admin/collections/page.tsx`
 * serves that address by rendering the view registered here.
 */
export const COLLECTIONS_VIEW_PATH = "/byline-collections";

/** Byline Data's address below the admin route: a dataset or project is its query (`?dataset=`, `?project=`). */
export const DATA_PATH = "/data";

/**
 * Byline's newsroom navigation: the only primary navigation anyone sees.
 *
 * A destination appears here only once its Byline screen exists; staff are
 * never sent to a generic Payload collection screen. The order is Home,
 * Stories, Calendar, Media, Collections (reporting projects; public coverage
 * is only an optional presentation of a Collection, never a destination),
 * Data (datasets newsroom staff keep, and the reader-facing projects built on them),
 * then the editor tools (People, Polls, Feedback…), each as its screen is ported
 * (docs/newsroom-os.md). There is no generic Planning
 * destination: WordPress's Planning page was an umbrella over these screens,
 * and here each is first-class. Visibility is a convenience; every
 * destination enforces its own access on the server.
 */
export const NAVIGATION: readonly NavItem[] = [
  { key: "home", label: "Home", path: "", minimumRole: "staff" },
  { key: "stories", label: "Stories", path: STORIES_PATH, minimumRole: "staff" },
  { key: "calendar", label: "Calendar", path: CALENDAR_PATH, minimumRole: "staff" },
  { key: "media", label: "Media", path: MEDIA_PATH, minimumRole: "staff" },
  { key: "collections", label: "Collections", path: COLLECTIONS_PATH, minimumRole: "staff", exact: true },
  { key: "data", label: "Data", path: DATA_PATH, minimumRole: "staff", exact: true },
  { key: "people", label: "People", path: "/people", minimumRole: "editor", exact: true },
  // Publish: global desks that coordinate many Stories. Ordinary Story-level work stays on the Story.
  { key: "front-page", label: "Front Page", path: "/front-page", minimumRole: "editor", exact: true, group: "publish" },
  { key: "distribution", label: "Distribution", path: "/distribution", minimumRole: "editor", exact: true, group: "publish" },
  { key: "content-health", label: "Content Health", path: "/content-health", minimumRole: "editor", exact: true, group: "publish" }
];

export function navigationFor(role: Role): NavItem[] {
  return NAVIGATION.filter(allowed(role));
}

export const REVIEW_WORKFLOWS_PATH = "/review-workflows";

// Media gets a direct tab when the tablet header has room for it.
const PRIMARY_KEYS = ["home", "stories", "calendar", "media"] as const;
const HOME_PARENT = { label: "Home", path: "" };
type PrimaryKey = (typeof PRIMARY_KEYS)[number];

export function primaryNavigationFor(role: Role): NavItem[] {
  const items = navigationFor(role);
  return PRIMARY_KEYS.flatMap((key) => items.filter((item) => item.key === key));
}

type PrimaryLocation = { key: PrimaryKey | null; parent?: { label: string; path: string } };

/** Only canonical Byline views get adaptive navigation. The numeric Story edit
 * route is the one native Payload document surface that hosts a Byline screen. */
export function primaryLocationFor(pathname: string, adminRoute: string): PrimaryLocation | null {
  const admin = adminRoute.replace(/\/$/, "");
  const pathnameOnly = pathname.split(/[?#]/)[0];
  if (!pathnameOnly?.startsWith("/") || (admin && pathnameOnly !== admin && !pathnameOnly.startsWith(`${admin}/`))) return null;
  const path = stripAdmin(pathname, adminRoute);
  const destination = NAVIGATION.find((item) => item.path === path);
  const primary = PRIMARY_KEYS.find((key) => key === destination?.key);
  if (primary) return primary === "media" ? { key: primary, parent: HOME_PARENT } : { key: primary };
  if (storyIdFromPath(pathname, adminRoute) !== null) {
    return { key: "stories", parent: { label: "Stories", path: STORIES_PATH } };
  }
  if (path === REVIEW_WORKFLOWS_PATH) return { key: null, parent: { label: "People", path: "/people" } };
  if (destination || path === "/profile" || path === "/site" || path === SYSTEM_ADMINISTRATION_PATH) {
    return { key: null, parent: HOME_PARENT };
  }
  return null;
}

/**
 * The navigation entry a path belongs to, if any. Home matches only itself;
 * a story's Story screen belongs to Stories.
 */
export function activeNavKey(items: readonly Pick<NavItem, "key" | "path" | "exact">[], pathname: string, adminRoute: string): string | null {
  if (storyIdFromPath(pathname, adminRoute) !== null && items.some((item) => item.key === "stories")) return "stories";
  const path = stripAdmin(pathname, adminRoute);
  // Review workflows are part of the team's operations, beside People and Roles.
  if (path === REVIEW_WORKFLOWS_PATH && items.some((item) => item.key === "people")) return "people";
  const match = items
    .filter((item) => (item.path === "" || item.exact ? path === item.path : path === item.path || path.startsWith(`${item.path}/`)))
    .sort((a, b) => b.path.length - a.path.length)[0];
  return match?.key ?? null;
}

/* ---------------------------------------------------------------- Create */

export type CreateKind = "story" | "task" | "collection" | "media";

export type CreateAction = {
  readonly kind: CreateKind;
  readonly label: string;
  readonly minimumRole: Role;
};

/**
 * What the global Create control offers, in menu order. The first allowed
 * entry is the primary action, and the order follows how often each is
 * made. An entry is added only when its Byline flow exists (Poll joins with
 * its screen); the server enforces each create regardless.
 */
export const CREATE_ACTIONS: readonly CreateAction[] = [
  { kind: "story", label: "Story", minimumRole: "staff" },
  { kind: "task", label: "Task", minimumRole: "staff" },
  { kind: "collection", label: "Collection", minimumRole: "editor" },
  { kind: "media", label: "Upload media", minimumRole: "staff" }
];

export function createActionsFor(role: Role): CreateAction[] {
  return CREATE_ACTIONS.filter(allowed(role));
}

/* ------------------------------------------------- System administration */

/** The administrators' landing for raw Payload maintenance screens (a custom admin view). */
export const SYSTEM_ADMINISTRATION_PATH = "/system";

export function canAdministerSystem(role: Role): boolean {
  return role === "administrator";
}

/**
 * Raw Payload collection screens, for administrators only. They are reached
 * from System administration in the account menu, never from the newsroom's
 * primary navigation.
 */
export const ADMINISTRATION: readonly NavItem[] = [
  { key: "raw-stories", label: "Stories", path: "/collections/stories", minimumRole: "administrator" },
  { key: "raw-plans", label: "Story plans", path: "/collections/story-plans", minimumRole: "administrator" },
  { key: "raw-people", label: "People", path: "/collections/people", minimumRole: "administrator" },
  { key: "raw-media", label: "Media", path: "/collections/media", minimumRole: "administrator" },
  { key: "raw-collections", label: "Collections", path: "/collections/collections", minimumRole: "administrator" },
  { key: "raw-corrections", label: "Corrections", path: "/collections/corrections", minimumRole: "administrator" },
  { key: "raw-redirects", label: "Redirects", path: "/collections/redirects", minimumRole: "administrator" },
  { key: "raw-pages", label: "Pages", path: "/collections/pages", minimumRole: "administrator" },
  { key: "raw-polls", label: "Polls", path: "/collections/polls", minimumRole: "administrator" },
  { key: "raw-sections", label: "Sections", path: "/collections/sections", minimumRole: "administrator" },
  { key: "raw-topics", label: "Topics", path: "/collections/topics", minimumRole: "administrator" },
  { key: "raw-work", label: "Tasks", path: "/collections/tasks", minimumRole: "administrator" },
  { key: "raw-accounts", label: "Accounts", path: "/collections/users", minimumRole: "administrator" },
  { key: "raw-distribution", label: "Distribution items", path: "/collections/distribution-items", minimumRole: "administrator" },
  { key: "raw-distribution-settings", label: "Distribution settings", path: "/globals/distribution-settings", minimumRole: "administrator" },
  { key: "raw-data-datasets", label: "Datasets", path: "/collections/data-datasets", minimumRole: "administrator" },
  { key: "raw-data-records", label: "Data rows", path: "/collections/data-records", minimumRole: "administrator" },
  { key: "raw-data-projects", label: "Data projects", path: "/collections/data-projects", minimumRole: "administrator" },
  { key: "raw-jobs", label: "Jobs", path: "/collections/payload-jobs", minimumRole: "administrator" }
];

export function administrationFor(role: Role): NavItem[] {
  return ADMINISTRATION.filter(allowed(role));
}

/* -------------------------------------------------------------- Location */

export type Crumb = { readonly label: string; readonly path?: string };

/**
 * Where the app header says the user is. Byline screens name themselves;
 * raw Payload screens sit under System administration so an administrator can
 * always get back to it.
 */
export function locationFor(pathname: string, adminRoute: string): Crumb[] {
  const path = stripAdmin(pathname, adminRoute);
  const nav = NAVIGATION.find((item) => item.path === path);
  if (nav) return [{ label: nav.label }];
  if (/^\/collections\/stories\/[^/]+$/.test(path) && !path.endsWith("/create")) return [{ label: "Stories", path: STORIES_PATH }, { label: "Story" }];
  if (path === "/site") return [{ label: "Site" }];
  if (path === REVIEW_WORKFLOWS_PATH) return [{ label: "People", path: "/people" }, { label: "Review workflows" }];
  if (path === "/content-health") return [{ label: "Content Health" }];
  if (/^\/collections\/pages\/\d+$/.test(path)) return [{ label: "Site", path: "/site?tab=pages" }, { label: "Page" }];
  if (path === SYSTEM_ADMINISTRATION_PATH) return [{ label: "System administration" }];
  const raw = ADMINISTRATION.find((item) => path === item.path || path.startsWith(`${item.path}/`));
  if (raw) return [{ label: "System administration", path: SYSTEM_ADMINISTRATION_PATH }, { label: raw.label }];
  if (path === "/account") return [{ label: "Account" }];
  if (path === "/profile") return [{ label: "My profile" }];
  return [];
}

/**
 * The saved story whose Story screen a path is (never `/create` or a list),
 * so a task created there starts linked to it and the sidebar can become its
 * Story workspace.
 */
export function storyIdFromPath(pathname: string, adminRoute: string): number | null {
  const match = /^\/collections\/stories\/(\d+)$/.exec(stripAdmin(pathname, adminRoute));
  return match ? Number(match[1]) : null;
}

/** Whether a path is Stories (any view or filters: those are its query). Never a story's own Story screen. */
export function isStoriesPath(pathname: string, adminRoute: string): boolean {
  return stripAdmin(pathname, adminRoute) === STORIES_PATH;
}

/** Whether a path is the Calendar (with or without a trailing slash or query). */
export function isCalendarPath(pathname: string, adminRoute: string): boolean {
  return stripAdmin(pathname, adminRoute) === CALENDAR_PATH;
}

/** Whether a path is the Collections screen (the list or an open Collection: that is its query). */
export function isCollectionsPath(pathname: string, adminRoute: string): boolean {
  return stripAdmin(pathname, adminRoute) === COLLECTIONS_PATH;
}

/** Whether a path is the Data workspace (a dataset or project is its query). */
export function isDataPath(pathname: string, adminRoute: string): boolean {
  return stripAdmin(pathname, adminRoute) === DATA_PATH;
}

/** Whether a path is the Media screen (any view, folder or asset: those are its query). */
export function isMediaPath(pathname: string, adminRoute: string): boolean {
  return stripAdmin(pathname, adminRoute) === MEDIA_PATH;
}

function stripAdmin(pathname: string, adminRoute: string): string {
  const admin = adminRoute.replace(/\/$/, "");
  let path = pathname.split(/[?#]/)[0] ?? "";
  if (admin && (path === admin || path.startsWith(`${admin}/`))) path = path.slice(admin.length);
  return path.replace(/\/$/, "");
}
