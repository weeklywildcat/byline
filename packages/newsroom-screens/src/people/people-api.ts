import type {
  NewPerson,
  PeopleList,
  PeopleQuery,
  PersonAccessInput,
  PersonDetail,
  PersonPatch,
} from "./people-model";

export type PeopleApi = {
  list: (query: PeopleQuery) => Promise<PeopleList>;
  detail: (id: number) => Promise<PersonDetail>;
  profile: () => Promise<PersonDetail | null>;
  create: (input: NewPerson) => Promise<PersonDetail>;
  update: (id: number, input: PersonPatch) => Promise<PersonDetail>;
  saveAccess: (id: number, input: PersonAccessInput) => Promise<PersonDetail>;
  /** Administrators: show the Person's welcome introduction again the next time they open Byline. Changes nothing else. */
  restartOnboarding: (id: number) => Promise<PersonDetail>;
};
