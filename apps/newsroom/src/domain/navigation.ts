import type { Role } from "./vocabulary";

export type NavItem = {
  readonly key: string;
  readonly label: string;
  /** Path below the admin route. */
  readonly path: string;
  readonly minimumRole: Role;
};

const RANK: Record<Role, number> = { staff: 1, editor: 2, administrator: 3 };

/**
 * Byline's newsroom navigation: the only primary navigation anyone sees.
 *
 * A destination appears here only once its Byline screen exists; staff are
 * never sent to a generic Payload collection screen. Stories, Planning,
 * Calendar, Media Desk, Coverage, Search, People, Polls and Feedback join as
 * their screens are ported (docs/payload-migration.md §7). Visibility is a
 * convenience; every destination enforces its own access on the server.
 */
export const NAVIGATION: readonly NavItem[] = [{ key: "home", label: "Home", path: "", minimumRole: "staff" }];

/**
 * Raw Payload collection screens, for administrators only, as a clearly
 * secondary maintenance and debugging section.
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
  { key: "raw-accounts", label: "Accounts", path: "/collections/users", minimumRole: "administrator" }
];

const allowed = (role: Role) => (item: NavItem) => RANK[role] >= RANK[item.minimumRole];

export function navigationFor(role: Role): NavItem[] {
  return NAVIGATION.filter(allowed(role));
}

export function administrationFor(role: Role): NavItem[] {
  return ADMINISTRATION.filter(allowed(role));
}
