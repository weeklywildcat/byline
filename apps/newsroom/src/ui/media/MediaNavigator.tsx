"use client";

import { siteDay } from "@byline/newsroom-screens/home/newsroom-model";
import { mediaWorkKey } from "@byline/newsroom-screens/media/media-library-api";
import { folderPath, type MediaRoute } from "@byline/newsroom-screens/media/media-library-model";
import { mediaDeskRows, mediaWorkCounts } from "@byline/newsroom-screens/media/media-desk-model";
import { MediaNavigatorContent } from "@byline/newsroom-screens/media/MediaNavigatorContent";
import { useMediaNavigator } from "@byline/newsroom-screens/media/media-query";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { atLeast } from "../../access/user";
import { useNewsroomAccount, useNewsroomRoutes } from "../shell/account";
import { useNewsroomTimeZone } from "../shell/timezone";
import { useMediaNavigate, useMediaRoute } from "./media-route";
import { useMediaWorkspace } from "./MediaWorkspaceShell";
import { createPayloadMediaWorkFetchers } from "./payload-media-fetchers";

/** The Work views' counts, from the same production rows the Work screen shows (one cached read). */
export function useMediaWorkCounts() {
  const routes = useNewsroomRoutes();
  const account = useNewsroomAccount();
  const timezone = useNewsroomTimeZone();
  const work = useMemo(() => createPayloadMediaWorkFetchers(routes.api), [routes.api]);
  const desk = useQuery({ queryKey: mediaWorkKey, queryFn: () => work.getMediaDesk!(), staleTime: 30_000, enabled: Boolean(account) });
  return useMemo(() => (desk.data ? mediaWorkCounts(mediaDeskRows(desk.data), { currentUserId: account ? Number(account.id) : null, today: siteDay(new Date(), timezone), timezone: desk.data.timezone }) : undefined), [account, desk.data, timezone]);
}

/**
 * The Media navigator wired to the newsroom: the address (via the browser's
 * history), the navigator read, the Work counts and the open folders. The
 * wide workspace's pane and the narrow screens' sheet render this same
 * component; `onNavigated` lets the sheet close after a choice.
 */
export function MediaNavigator({ onNavigated }: { onNavigated?: () => void }) {
  const workspace = useMediaWorkspace();
  const account = useNewsroomAccount();
  const route = useMediaRoute();
  const navigate = useMediaNavigate(workspace.href);
  const navigator = useMediaNavigator(workspace.fetchers);
  const counts = useMediaWorkCounts();
  const editor = atLeast(account, "editor");

  // The open folder is always in view: its ancestors open with it, however it was reached (a link, Back).
  const folders = navigator.data?.folders;
  useEffect(() => {
    if (route.folderId === null || !folders) return;
    const ancestors = folderPath(folders, route.folderId).slice(0, -1).map((folder) => folder.id);
    if (ancestors.length) workspace.expandAll(ancestors);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folders, route.folderId]);

  const go = (next: MediaRoute) => workspace.guardNavigation(() => {
    navigate(next);
    onNavigated?.();
  });

  return (
    <MediaNavigatorContent
      data={navigator.data}
      loading={navigator.isPending}
      route={route}
      hrefFor={workspace.href}
      onNavigate={go}
      workCounts={counts}
      showUnassigned={editor}
      expanded={workspace.expanded}
      onExpandedChange={workspace.setExpanded}
      onNewFolder={navigator.data?.capabilities.canManageFolders ? () => { onNavigated?.(); workspace.requestFolderAction({ kind: "create", parentId: null }); } : undefined}
    />
  );
}
