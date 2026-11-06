"use client";

import { HomeApp } from "@byline/newsroom-screens/home/HomeApp";
import { useConfig } from "@payloadcms/ui";
import { useMemo } from "react";
import { createPayloadHomeFetchers } from "./payload-fetchers";

/**
 * Byline Home: the same `HomeApp` the WordPress admin mounts, driven by the
 * Payload fetchers. Destinations that are not ported yet (Planning, Calendar,
 * Media Desk, content health, deployment) are simply not linked.
 */
export function NewsroomHome({ currentUserId }: { currentUserId: number | null }) {
  const { config } = useConfig();
  const api = config.routes.api;
  const admin = config.routes.admin;
  const fetchers = useMemo(() => createPayloadHomeFetchers(api), [api]);
  return <HomeApp fetchers={fetchers} currentUserId={currentUserId} actionUrls={{ workspace: (storyId) => `${admin}/collections/stories/${storyId}` }} />;
}
