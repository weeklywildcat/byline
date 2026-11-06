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
 * Byline's newsroom navigation. Destinations that are not built yet (Planning,
 * Calendar, Search, Feedback, Publication; see docs/payload-migration.md) are
 * absent rather than linked to an empty screen; each joins this list when its
 * view lands. Visibility here is convenience only: every destination enforces
 * its own access on the server.
 */
export const NAVIGATION: readonly NavItem[] = [
  { key: "home", label: "Home", path: "", minimumRole: "staff" },
  { key: "stories", label: "Stories", path: "/collections/stories", minimumRole: "staff" },
  { key: "media", label: "Media", path: "/collections/media", minimumRole: "staff" },
  { key: "coverage", label: "Coverage", path: "/collections/coverages", minimumRole: "staff" },
  { key: "polls", label: "Polls", path: "/collections/polls", minimumRole: "editor" },
  { key: "corrections", label: "Corrections", path: "/collections/corrections", minimumRole: "editor" },
  { key: "people", label: "People", path: "/collections/people", minimumRole: "editor" },
  { key: "pages", label: "Pages", path: "/collections/pages", minimumRole: "administrator" },
  { key: "sections", label: "Sections", path: "/collections/sections", minimumRole: "administrator" },
  { key: "system", label: "Accounts", path: "/collections/users", minimumRole: "administrator" }
];

export function navigationFor(role: Role): NavItem[] {
  return NAVIGATION.filter((item) => RANK[role] >= RANK[item.minimumRole]);
}
