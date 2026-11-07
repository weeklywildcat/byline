import type {
  NewPerson,
  PeopleList,
  PeopleQuery,
  PersonDetail,
  PersonPatch,
} from "./people-model";

export type PeopleApi = {
  list: (query: PeopleQuery) => Promise<PeopleList>;
  detail: (id: number) => Promise<PersonDetail>;
  profile: () => Promise<PersonDetail | null>;
  create: (input: NewPerson) => Promise<PersonDetail>;
  update: (id: number, input: PersonPatch) => Promise<PersonDetail>;
};
