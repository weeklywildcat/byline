import type { Role } from "./vocabulary";

export type NavItem = {
  readonly key: string;
  readonly label: string;
  /** Path below the admin route. */
  readonly path: string;
  readonly minimumRole: Role;
};

const RANK: Record<Role, number> = { staff: 1, editor: 2, administrator: 3 };
const allowed = (role: Role) => (item: { minimumRole: Role }) => RANK[role] >= RANK[item.minimumRole];

/** The Calendar's address below the admin route (a custom root view). */
export const CALENDAR_PATH = "/calendar";

/** Media's address below the admin route: the Library (files, folders) and Work (production assignments). */
export const MEDIA_PATH = "/media";

/**
 * Byline's newsroom navigation: the only primary navigation anyone sees.
 *
 * A destination appears here only once its Byline screen exists; staff are
 * never sent to a generic Payload collection screen. The planned order is
 * Home, Stories, Calendar, Media, Coverage, then the editor tools (People,
 * Polls, Feedback…); each joins as its screen is ported
 * (docs/payload-migration.md §7.2). There is no generic Planning
 * destination: WordPress's Planning page was an umbrella over these screens,
 * and here each is first-class. Visibility is a convenience; every
 * destination enforces its own access on the server.
 */
export const NAVIGATION: readonly NavItem[] = [
  { key: "home", label: "Home", path: "", minimumRole: "staff" },
  { key: "stories", label: "Stories", path: "/stories", minimumRole: "staff" },
  { key: "calendar", label: "Calendar", path: CALENDAR_PATH, minimumRole: "staff" },
  { key: "media", label: "Media", path: MEDIA_PATH, minimumRole: "staff" }
];

export function navigationFor(role: Role): NavItem[] {
  return NAVIGATION.filter(allowed(role));
}

/**
 * The navigation entry a path belongs to, if any. Home matches only itself;
 * a story's Story screen belongs to Stories.
 */
export function activeNavKey(items: readonly Pick<NavItem, "key" | "path">[], pathname: string, adminRoute: string): string | null {
  if (storyIdFromPath(pathname, adminRoute) !== null && items.some((item) => item.key === "stories")) return "stories";
  const path = stripAdmin(pathname, adminRoute);
  const match = items
    .filter((item) => (item.path === "" ? path === "" : path === item.path || path.startsWith(`${item.path}/`)))
    .sort((a, b) => b.path.length - a.path.length)[0];
  return match?.key ?? null;
}

/* ---------------------------------------------------------------- Create */

export type CreateKind = "story" | "task" | "media";

export type CreateAction = {
  readonly kind: CreateKind;
  readonly label: string;
  readonly minimumRole: Role;
};

/**
 * What the global Create control offers, in menu order. The first allowed
 * entry is the primary action. An entry is added only when its Byline flow
 * exists (Coverage and Poll join with their screens); the server enforces
 * each create regardless.
 */
export const CREATE_ACTIONS: readonly CreateAction[] = [
  { kind: "story", label: "Story", minimumRole: "staff" },
  { kind: "task", label: "Task", minimumRole: "staff" },
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
  { key: "raw-coverages", label: "Coverages", path: "/collections/coverages", minimumRole: "administrator" },
  { key: "raw-corrections", label: "Corrections", path: "/collections/corrections", minimumRole: "administrator" },
  { key: "raw-pages", label: "Pages", path: "/collections/pages", minimumRole: "administrator" },
  { key: "raw-polls", label: "Polls", path: "/collections/polls", minimumRole: "administrator" },
  { key: "raw-sections", label: "Sections", path: "/collections/sections", minimumRole: "administrator" },
  { key: "raw-topics", label: "Topics", path: "/collections/topics", minimumRole: "administrator" },
  { key: "raw-work", label: "Tasks", path: "/collections/tasks", minimumRole: "administrator" },
  { key: "raw-accounts", label: "Accounts", path: "/collections/users", minimumRole: "administrator" },
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
  if (/^\/collections\/stories\/[^/]+$/.test(path) && !path.endsWith("/create")) return [{ label: "Story" }];
  if (path === SYSTEM_ADMINISTRATION_PATH) return [{ label: "System administration" }];
  const raw = ADMINISTRATION.find((item) => path === item.path || path.startsWith(`${item.path}/`));
  if (raw) return [{ label: "System administration", path: SYSTEM_ADMINISTRATION_PATH }, { label: raw.label }];
  if (path === "/account") return [{ label: "Account" }];
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

/** Whether a path is the Calendar (with or without a trailing slash or query). */
export function isCalendarPath(pathname: string, adminRoute: string): boolean {
  return stripAdmin(pathname, adminRoute) === CALENDAR_PATH;
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
