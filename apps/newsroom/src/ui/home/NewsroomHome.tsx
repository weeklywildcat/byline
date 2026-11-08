"use client";

import { HomeApp, type HomeShell } from "@byline/newsroom-screens/home/HomeApp";
import { normalizeHomePreferences, type HomePreferenceStorage } from "@byline/newsroom-screens/home/desk-model";
import { useConfig, usePreferences } from "@payloadcms/ui";
import { useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { useNewsroomAccount } from "../shell/account";
import { createBylineRequest } from "./payload-fetchers";
import { useBylineCreate } from "../shell/create";
import { useBylineSearch } from "../shell/search";
import { createPayloadHomeFetchers } from "./payload-fetchers";

/**
 * Byline Home: the same `HomeApp` the WordPress admin mounts, driven by the
 * Payload fetchers and running inside the Byline shell, which owns Create,
 * Search (⌘K), toasts and the page chrome. Destinations Payload does not have
 * (deployment, the WordPress site doctor) are simply not linked.
 */

/** Home's Mine | Newsroom choice, in Payload Preferences like the Calendar's. Versioned by its key. */
export const HOME_PREFERENCES_KEY = "byline:home:preferences:v1";
export function NewsroomHome({ currentUserId }: { currentUserId: number | null }) {
  const { config } = useConfig();
  const api = config.routes.api;
  const admin = config.routes.admin;
  const account = useNewsroomAccount();
  const editor = account?.role === "editor" || account?.role === "administrator";
  const fetchers = useMemo(() => ({ ...createPayloadHomeFetchers(api), ...(editor ? {
    getContentHealth: () => createBylineRequest(api)<import("@byline/newsroom-screens/planning/planning-model").ContentHealthResponse>("/content-health")
  } : {}) }), [api, editor]);
  const { getPreference, setPreference } = usePreferences();
  const preferences = useMemo<HomePreferenceStorage>(() => ({
    load: async () => normalizeHomePreferences(await getPreference<unknown>(HOME_PREFERENCES_KEY)),
    save: (value) => setPreference(HOME_PREFERENCES_KEY, normalizeHomePreferences(value))
  }), [getPreference, setPreference]);
  const queryClient = useQueryClient();
  const { openCreate } = useBylineCreate();
  const { setStoryOpener } = useBylineSearch();
  const shell = useMemo<HomeShell>(() => ({ queryClient, openCreate, setStoryOpener }), [queryClient, openCreate, setStoryOpener]);
  return <HomeApp fetchers={fetchers} currentUserId={currentUserId} shell={shell} preferences={preferences} actionUrls={{ planning: `${admin}/stories`, calendar: `${admin}/calendar`, contentHealth: editor ? `${admin}/content-health` : undefined, workspace: (storyId) => `${admin}/collections/stories/${storyId}` }} />;
}
