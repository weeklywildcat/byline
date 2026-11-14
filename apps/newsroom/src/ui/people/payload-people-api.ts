"use client";
import type { PeopleApi } from "@byline/newsroom-screens/people/people-api";
import { createBylineRequest } from "../home/payload-fetchers";

export function createPayloadPeopleApi(api: string): PeopleApi {
  const request = createBylineRequest(api);
  return {
    list: (query) =>
      request(
        `/people?${new URLSearchParams({
          view: query.view,
          search: query.search,
          page: String(query.page),
        })}`,
      ),
    detail: (id) => request(`/people/${id}`),
    profile: () => request("/profile"),
    create: (input) => request("/people", "POST", input),
    update: (id, input) => request(`/people/${id}`, "PATCH", input),
    saveAccess: (id, input) => request(`/people/${id}/access`, "PUT", input),
    restartOnboarding: (id) => request(`/people/${id}/onboarding/restart`, "POST"),
  };
}
