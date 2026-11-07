"use client";

import { useAuth, useConfig } from "@payloadcms/ui";
import { newsroomUser, type NewsroomUser } from "../../access/user";

/** The signed-in, enabled Byline account on the client (null on the login screen or for a disabled account). */
export function useNewsroomAccount(): NewsroomUser | null {
  const { user } = useAuth();
  return newsroomUser(user);
}

/** Payload's admin and API route prefixes, and the URL of a story's Byline Story screen. */
export function useNewsroomRoutes() {
  const { config } = useConfig();
  const admin = config.routes.admin;
  const api = config.routes.api;
  return { admin, api, home: admin || "/", story: (id: number) => `${admin}/collections/stories/${id}` };
}
