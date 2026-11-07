import { useQuery } from "@tanstack/react-query";
import type { PeopleApi } from "./people-api";
import type { PeopleQuery } from "./people-model";

export const peopleKeys = {
  all: ["people"] as const,
  list: (query: PeopleQuery) => ["people", "list", query] as const,
  detail: (id: number | null, self: boolean) =>
    ["people", self ? "profile" : "detail", id] as const,
};
export function usePeople(api: PeopleApi, query: PeopleQuery) {
  return useQuery({
    queryKey: peopleKeys.list(query),
    queryFn: () => api.list(query),
  });
}
