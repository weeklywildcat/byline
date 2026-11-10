import { describe, expect, it } from "vitest";
import {
  peopleQuery,
  personInitials,
  personSummary,
  validPersonSocialUrl,
  type PersonCapabilities,
  type PersonProfile,
} from "../src/people/people-model";
import {
  clonePerson,
  personErrors,
  personPatch,
} from "../src/people/person-form";
const person: PersonProfile = {
  id: 1,
  name: "Alex Writer",
  slug: "alex",
  newsroomRole: "Photographer",
  pronouns: "",
  shortBio: "",
  bio: "",
  publicEmail: "",
  socials: [],
  portrait: null,
  status: "guest",
  directoryVisible: false,
  hasProfilePage: false,
  updatedAt: "2026-11-01T00:00:00Z",
};
const staff: PersonCapabilities = {
  editProfile: true,
  editEditorialIdentity: false,
  changeVisibility: false,
  manageAccess: false,
  delete: false,
};

describe("People screen contracts", () => {
  it("defaults to Current staff and normalizes query input", () => {
    expect(peopleQuery(new URLSearchParams())).toEqual({
      view: "active",
      search: "",
      page: 1,
    });
    expect(
      peopleQuery(new URLSearchParams("view=unknown&page=-2&search=+Alex+")),
    ).toEqual({ view: "active", search: " Alex ", page: 1 });
    expect(peopleQuery(new URLSearchParams("view=guest&page=2"))).toMatchObject(
      { view: "guest", page: 2 },
    );
  });
  it("preserves the space while typing a full name into URL-backed search", () => {
    expect(peopleQuery(new URLSearchParams({ search: "Gibson " })).search).toBe(
      "Gibson ",
    );
  });
  it("keeps sparse identities visible through initials and concise byline-only context", () => {
    expect(personInitials(" Alex Writer ")).toBe("AW");
    expect(personInitials("Cher")).toBe("C");
    expect(personSummary(person)).toBe(
      "Photographer · Guest contributor · No public profile",
    );
    // A list already filtered by status does not repeat it, and the usual case is left unsaid.
    expect(personSummary({ ...person, status: "active", directoryVisible: true, hasProfilePage: true }, { showStatus: false })).toBe("Photographer");
    expect(personSummary({ ...person, status: "active", directoryVisible: false, hasProfilePage: true }, { showStatus: false })).toBe("Photographer · Not in staff directory");
  });
  it("sends only changed public fields in self-service", () => {
    const draft = clonePerson(person);
    draft.shortBio = "Unsaved copy";
    draft.status = "alumni";
    draft.newsroomRole = "Editor";
    expect(personPatch(draft, person, staff)).toEqual({
      expectedUpdatedAt: person.updatedAt,
      shortBio: "Unsaved copy",
    });
    expect(
      personPatch(draft, person, { ...staff, editEditorialIdentity: true }),
    ).toMatchObject({ status: "alumni", newsroomRole: "Editor" });
    expect(person.status).toBe("guest");
  });
  it("keeps portrait IDs canonical and excludes preview URLs from mutations", () => {
    const draft = {
      ...person,
      portrait: { id: 42, url: "/private-preview", unavailable: false },
    };
    expect(personPatch(draft, person, staff)).toEqual({
      expectedUpdatedAt: person.updatedAt,
      portrait: 42,
    });
    expect(
      personPatch({ ...draft, portrait: null }, draft, staff).portrait,
    ).toBeNull();
    expect(personPatch(person, person, staff)).toEqual({
      expectedUpdatedAt: person.updatedAt,
    });
  });
  it("validates public email and repeatable custom HTTPS links", () => {
    expect(
      personErrors({
        ...person,
        publicEmail: "bad",
        socials: [{ label: "", url: "javascript:alert(1)" }],
      }),
    ).toHaveProperty("publicEmail");
    expect(
      personErrors({
        ...person,
        socials: [{ label: "Custom", url: "https://example.test/me" }],
      }),
    ).toEqual({});
    expect(validPersonSocialUrl("https://www.youtube.com/@weeklywildcat")).toBe(true);
    expect(validPersonSocialUrl("https://example.test/watch?creator=@weeklywildcat")).toBe(true);
    expect(validPersonSocialUrl("https://user@example.test/")).toBe(false);
    expect(validPersonSocialUrl("https://user%40name@example.test/")).toBe(false);
    expect(validPersonSocialUrl("https://")).toBe(false);
  });
});
