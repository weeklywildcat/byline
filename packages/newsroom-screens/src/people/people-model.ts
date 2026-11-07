/** Public/editorial identities. Account administration is deliberately absent. */
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
>;
export type PersonCapabilities = {
  editProfile: boolean;
  editEditorialIdentity: boolean;
  changeVisibility: boolean;
  manageAccount: boolean;
  delete: false;
};
export type PersonDetail = {
  person: PersonProfile;
  capabilities: PersonCapabilities;
  account: { linked: boolean; names: string[]; systemHref: string | null };
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
  newsroomRole: string;
};
export type PersonChanges = Pick<
  PersonProfile,
  "name" | "pronouns" | "shortBio" | "bio" | "publicEmail" | "socials"
> & { portrait: number | null };
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
    search: (params.get("search") ?? "").trim().slice(0, 120),
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

export function personSummary(person: PersonRow): string {
  return [
    person.newsroomRole,
    PERSON_STATUSES[person.status],
    person.directoryVisible ? "In staff directory" : "Outside staff directory",
    person.hasProfilePage ? "Public profile" : "Byline only",
  ]
    .filter(Boolean)
    .join(" · ");
}

/** Canonical links are HTTPS URLs, never handles, credentials or script protocols. */
export function validPersonSocialUrl(value: unknown): boolean {
  if (typeof value !== "string" || !/^https:\/\/[^\s@]+$/.test(value))
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
