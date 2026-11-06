"use client";

import { HomeCreate } from "@byline/newsroom-screens/home/HomeCreate";
import { mediaRouteSearch, DEFAULT_MEDIA_ROUTE } from "@byline/newsroom-screens/media/media-library-model";
import { MediaUploadDialog } from "@byline/newsroom-screens/media/MediaUploadDialog";
import { homeKey } from "@byline/newsroom-screens/home/home-query";
import type { StoryWorkspace } from "@byline/newsroom-screens/workspace/workspace-types";
import { useQuery } from "@tanstack/react-query";
import { usePathname } from "next/navigation";
import { createContext, use, useCallback, useMemo, useState, type ReactNode } from "react";
import { createActionsFor, storyIdFromPath, type CreateAction, type CreateKind } from "../../domain/navigation";
import { createPayloadHomeFetchers } from "../home/payload-fetchers";
import { createPayloadMediaFetchers } from "../media/payload-media-fetchers";
import { useNewsroomAccount, useNewsroomRoutes } from "./account";
import { ShellLayer } from "./layer";
import { useShellNavigation } from "./navigation";

/** `storyId`: a task starts linked to a story. `folderId`: an upload goes to that folder (null: Unfiled). */
export type CreateOptions = { storyId?: number | null; folderId?: number | null };

type BylineCreate = {
  /** What this account may create, in menu order; the first is the primary action. */
  actions: readonly CreateAction[];
  openCreate: (kind: CreateKind, options?: CreateOptions) => void;
  /** A Create dialog is open (⌘K stays out of its way). */
  creating: boolean;
};

const CreateContext = createContext<BylineCreate>({ actions: [], openCreate: () => {}, creating: false });

export const useBylineCreate = () => use(CreateContext);

/**
 * Byline's one creation controller. The sidebar's Create menu, Home's
 * contextual "Task", the command palette, the Media screen's Upload and any
 * future screen call `openCreate(kind)`; the dialogs are the shared
 * `HomeCreate` ones (StoryCreateDialog, TaskCreateDialog), fed by the same
 * Home bootstrap query Home uses, and Media's one upload flow
 * (MediaUploadDialog), all mounted once here for the whole newsroom.
 *
 * A new kind joins `CREATE_ACTIONS` (domain/navigation.ts) and gets its
 * dialog here, only once its Byline flow exists. A created story opens its
 * Byline Story screen; nobody is sent to Payload's generic create form.
 *
 * The dialogs render in their own Byline root beside the page (ShellLayer),
 * outside the Story screen's document <form>, so their submits never reach
 * Payload's form.
 */
export function BylineCreateProvider({ children }: { children: ReactNode }) {
  const account = useNewsroomAccount();
  const routes = useNewsroomRoutes();
  const pathname = usePathname() ?? "";
  const { navigate } = useShellNavigation();
  const fetchers = useMemo(() => createPayloadHomeFetchers(routes.api), [routes.api]);
  const media = useMemo(() => createPayloadMediaFetchers(routes.api), [routes.api]);
  const [request, setRequest] = useState<{ kind: CreateKind; storyId: number | null; folderId: number | null } | null>(null);
  // Uploads keep running after the dialog closes; its root stays mounted until they finish.
  const [uploading, setUploading] = useState(false);
  const actions = useMemo(() => (account ? createActionsFor(account.role) : []), [account?.role]);
  // Task needs the newsroom's stories and people; Home has usually loaded them already.
  const home = useQuery({ queryKey: homeKey, queryFn: () => fetchers.getHome!(), enabled: request !== null && request.kind !== "media" && Boolean(account) });

  const openCreate = useCallback((kind: CreateKind, options?: CreateOptions) => {
    if (!actions.some((action) => action.kind === kind)) return;
    // On a Story screen, a new task starts linked to that story.
    const storyId = options?.storyId !== undefined ? options.storyId : kind === "task" ? storyIdFromPath(pathname, routes.admin) : null;
    // An upload from anywhere but Media lands in Unfiled, where it is easy to find and file.
    setRequest({ kind, storyId, folderId: options?.folderId ?? null });
  }, [actions, pathname, routes.admin]);

  const value = useMemo<BylineCreate>(() => ({ actions, openCreate, creating: request !== null }), [actions, openCreate, request]);
  // A new story opens its Story screen through the shell, which first lets the story being left finish saving.
  const openStory = (created: StoryWorkspace) => navigate(created.workspaceUrl || routes.story(created.story.id));

  return (
    <CreateContext value={value}>
      {children}
      {account ? (
        <>
          <ShellLayer active={request !== null && request.kind !== "media"}>
            <HomeCreate kind={request?.kind === "media" ? null : (request?.kind ?? null)} storyId={request?.storyId} onClose={() => setRequest(null)} onStoryCreated={openStory} fetchers={fetchers} data={home.data} />
          </ShellLayer>
          <ShellLayer active={request?.kind === "media" || uploading}>
            <MediaUploadDialog
              open={request?.kind === "media"}
              onOpenChange={(open) => { if (!open) setRequest(null); }}
              fetchers={media}
              folderId={request?.kind === "media" ? request.folderId : null}
              onBusyChange={setUploading}
              onShow={(folderId) => navigate(`${routes.admin}/media${mediaRouteSearch(folderId === null ? { ...DEFAULT_MEDIA_ROUTE, source: "unfiled" } : { ...DEFAULT_MEDIA_ROUTE, folderId })}`)}
            />
          </ShellLayer>
        </>
      ) : null}
    </CreateContext>
  );
}
