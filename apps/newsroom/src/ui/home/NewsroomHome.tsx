"use client";

import { HomeApp, type HomeShell } from "@byline/newsroom-screens/home/HomeApp";
import { useConfig } from "@payloadcms/ui";
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
 * Search (⌘K), toasts and the page chrome. Destinations that are not ported
 * yet (Planning, Calendar, Media Desk, content health, deployment) are simply
 * not linked.
 */
export function NewsroomHome({ currentUserId }: { currentUserId: number | null }) {
  const { config } = useConfig();
  const api = config.routes.api;
  const admin = config.routes.admin;
  const account = useNewsroomAccount();
  const editor = account?.role === "editor" || account?.role === "administrator";
  const fetchers = useMemo(() => ({ ...createPayloadHomeFetchers(api), ...(editor ? {
    getContentHealth: () => createBylineRequest(api)<import("@byline/newsroom-screens/planning/planning-model").ContentHealthResponse>("/content-health")
  } : {}) }), [api, editor]);
  const queryClient = useQueryClient();
  const { openCreate } = useBylineCreate();
  const { setStoryOpener } = useBylineSearch();
  const shell = useMemo<HomeShell>(() => ({ queryClient, openCreate, setStoryOpener }), [queryClient, openCreate, setStoryOpener]);
  return <HomeApp fetchers={fetchers} currentUserId={currentUserId} shell={shell} actionUrls={{ contentHealth: editor ? `${admin}/content-health` : undefined, workspace: (storyId) => `${admin}/collections/stories/${storyId}` }} />;
}
