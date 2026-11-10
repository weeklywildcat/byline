/** Public/editorial identities. Authentication stays separate underneath, but People is the newsroom surface for access. */
export const PERSON_STATUSES = {
  active: "Current staff",
  guest: "Guest contributor",
  alumni: "Alumni",
} as const;
export type PersonStatus = keyof typeof PERSON_STATUSES;
export type PersonPortrait = {
  id: number;
  url: string | null;
  unavailable: boolean;
};
export type PersonSocial = { label: string; url: string };
export type PersonProfile = {
  id: number;
  name: string;
  slug: string;
  pronouns: string;
  newsroomRole: string;
  shortBio: string;
  bio: string;
  portrait: PersonPortrait | null;
  status: PersonStatus;
  directoryVisible: boolean;
  hasProfilePage: boolean;
  publicEmail: string;
  socials: PersonSocial[];
  updatedAt: string;
};
export type PersonAccessRole = "staff" | "editor" | "administrator";
export const PERSON_ACCESS_ROLES: Record<PersonAccessRole, string> = {
  staff: "Staff",
  editor: "Editor",
  administrator: "Administrator",
};
export type PersonAccess = {
  id: number;
  email: string;
  role: PersonAccessRole;
  enabled: boolean;
  googleConnected: boolean;
  revision: string;
};
export type PersonRow = Pick<
  PersonProfile,
  | "id"
  | "name"
  | "slug"
  | "newsroomRole"
  | "portrait"
  | "status"
  | "directoryVisible"
  | "hasProfilePage"
> & {
  /** Omitted when the caller may not administer access; null means this Person has no account. */
  access?: Pick<PersonAccess, "enabled" | "role"> | null;
};
export type PersonCapabilities = {
  editProfile: boolean;
  editEditorialIdentity: boolean;
  changeVisibility: boolean;
  manageAccess: boolean;
  delete: false;
};
export type PersonDetail = {
  person: PersonProfile;
  capabilities: PersonCapabilities;
  /** Present only for administrators. Editors and self-profile never receive private sign-in data. */
  access: PersonAccess | null;
  usage: {
    total: number;
    stories: { id: number; title: string; state: string; href: string }[];
  };
};
export const PEOPLE_VIEWS = {
  active: "Current staff",
  guest: "Guests",
  alumni: "Alumni",
  all: "All",
} as const;
export type PeopleQuery = {
  view: keyof typeof PEOPLE_VIEWS;
  search: string;
  page: number;
};
export type PeopleList = {
  people: PersonRow[];
  total: number;
  page: number;
  pages: number;
  canCreate: boolean;
};
export type NewPerson = {
  name: string;
  type: "active" | "guest";
  newsroomRole?: string;
};
export type PersonChanges = Pick<
  PersonProfile,
  "name" | "pronouns" | "shortBio" | "bio" | "publicEmail" | "socials"
> & { portrait: number | null };
export type PersonAccessInput = {
  email: string;
  role: PersonAccessRole;
  enabled: boolean;
  password?: string;
  /** Null when creating access; the current account revision when editing. */
  expectedRevision: string | null;
};

export type PersonPatch = Partial<
  PersonChanges &
    Pick<
      PersonProfile,
      "slug" | "newsroomRole" | "status" | "directoryVisible" | "hasProfilePage"
    >
> & { expectedUpdatedAt: string };

export function peopleQuery(params: URLSearchParams): PeopleQuery {
  const view = params.get("view") ?? "active";
  const page = Number(params.get("page"));
  return {
    view: Object.hasOwn(PEOPLE_VIEWS, view)
      ? (view as PeopleQuery["view"])
      : "active",
    // Preserve in-progress input, including the space between first/last names.
    search: (params.get("search") ?? "").slice(0, 120),
    page: Number.isSafeInteger(page) && page > 0 ? page : 1,
  };
}

export function personInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return words.length
    ? `${words[0]![0]}${
        words.length > 1 ? words.at(-1)![0] : ""
      }`.toLocaleUpperCase()
    : "?";
}

/**
 * One quiet line for a People row: the role, the status when the list mixes
 * statuses, and only what is unusual (a staff member left out of the directory,
 * someone with no public profile). A row that says "Current staff · In staff
 * directory · Public profile" about everyone says nothing about anyone.
 */
export function personSummary(person: PersonRow, { showStatus = true }: { showStatus?: boolean } = {}): string {
  return [
    person.newsroomRole,
    showStatus ? PERSON_STATUSES[person.status] : "",
    person.status === "active" && !person.directoryVisible ? "Not in staff directory" : "",
    person.hasProfilePage ? "" : "No public profile",
  ]
    .filter(Boolean)
    .join(" · ");
}

/** Canonical links are HTTPS URLs, never bare handles, credentials or script protocols. */
export function validPersonSocialUrl(value: unknown): boolean {
  // '@' is valid in a URL path/query (for example youtube.com/@weeklywildcat).
  // Let URL parsing distinguish that from credential syntax in the authority.
  if (typeof value !== "string" || !/^https:\/\/\S+$/.test(value))
    return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      Boolean(url.hostname) &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}
