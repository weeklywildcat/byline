"use client";

import { mediaHrefSearch } from "./media-route";
import { MediaPickerDialog } from "@byline/newsroom-screens/media/MediaPickerDialog";
import type { MediaFolderRequest } from "@byline/newsroom-screens/media/MediaFolderDialogs";
import type { MediaLibraryFetchers } from "@byline/newsroom-screens/media/media-library-api";
import type { MediaKind, MediaLibraryAsset, MediaRoute } from "@byline/newsroom-screens/media/media-library-model";
import type { MediaPreferences, MediaPreferencesStore } from "@byline/newsroom-screens/media/media-preferences";
import type { MediaPicker, PickedAttachment } from "@byline/newsroom-screens/workspace/media-picker";
import type { MediaAssignmentType } from "@byline/newsroom-screens/workspace/workspace-types";
import { usePreferences } from "@payloadcms/ui";
import { createContext, use, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { useNewsroomAccount, useNewsroomRoutes } from "../shell/account";
import { ShellLayer } from "../shell/layer";
import { useNewsroomTimeZone } from "../shell/timezone";
import { createPayloadMediaFetchers, payloadMediaPreferences } from "./payload-media-fetchers";

type PickRequest = { kind: MediaKind | ""; restrictedKind?: MediaKind; title?: string; confirmLabel?: string; multiple: boolean; resolve: (assets: MediaLibraryAsset[]) => void };

type MediaWorkspace = {
  fetchers: MediaLibraryFetchers;
  preferences: MediaPreferencesStore;
  /** Which folders the navigator shows open; outlives each visit to Media (Payload remounts the Nav on every navigation). */
  expanded: ReadonlySet<number>;
  setExpanded: (folderId: number, open: boolean) => void;
  expandAll: (folderIds: number[]) => void;
  /** The narrow screens' Media navigator sheet. */
  sheetOpen: boolean;
  setSheetOpen: (open: boolean) => void;
  /** A folder or filing dialog, requested from the navigator or the screen; the Media screen renders it. */
  folderRequest: MediaFolderRequest | null;
  requestFolderAction: (request: MediaFolderRequest | null) => void;
  /** Byline's file picker (production assignments, and later any asset selector). */
  pick: (options?: { kind?: MediaKind | ""; restrictedKind?: MediaKind; title?: string; confirmLabel?: string; multiple?: boolean }) => Promise<MediaLibraryAsset[]>;
  /** The Media screen's address for a route. */
  href: (route: MediaRoute) => string;
  /**
   * Moves within Media (the navigator, a tile, closing the inspector) pass
   * through the screen's guard, which asks before unsaved file details are
   * left behind. Without a guard, `proceed` runs at once.
   */
  guardNavigation: (proceed: () => void) => void;
  setNavigationGuard: (guard: ((proceed: () => void) => void) | null) => void;
};

const MediaWorkspaceContext = createContext<MediaWorkspace | null>(null);

export function useMediaWorkspace(): MediaWorkspace {
  const workspace = use(MediaWorkspaceContext);
  if (!workspace) throw new Error("useMediaWorkspace needs MediaWorkspaceShell (BylineShell).");
  return workspace;
}

/** The reader's Media preferences (read once from Payload Preferences, the first time anything asks). */
export function useMediaPreferences(): [MediaPreferences, (patch: Partial<MediaPreferences>) => void, boolean] {
  const { preferences } = useMediaWorkspace();
  const state = useSyncExternalStore(preferences.subscribe, preferences.getState, preferences.getState);
  const loaded = useSyncExternalStore(preferences.subscribe, preferences.loaded, () => false);
  useEffect(() => { void preferences.load(); }, [preferences]);
  return [state, preferences.update, loaded];
}

const KIND_FOR_ASSIGNMENT: Partial<Record<MediaAssignmentType, MediaKind>> = { photo: "image", gallery: "image", graphic: "image", audio: "audio" };

/** The production desk's and the Story workspace's MediaPicker, over Byline's picker dialog. */
export function useBylineMediaPicker(): MediaPicker {
  const { pick } = useMediaWorkspace();
  return useMemo<MediaPicker>(() => ({
    available: () => true,
    label: "Link from Media",
    pick: async (type, options) => {
      const assets = await pick({ kind: KIND_FOR_ASSIGNMENT[type] ?? "", title: options?.title, confirmLabel: options?.buttonLabel, multiple: options?.multiple !== false });
      return assets.map((asset): PickedAttachment => ({ id: asset.id, title: asset.filename, previewUrl: asset.previewUrl, mimeType: asset.mimeType }));
    }
  }), [pick]);
}

/**
 * Media's shell state, beside the Calendar workspace's: the fetchers, the
 * reader's Media preferences, which folders are open, the narrow-screen
 * navigator sheet, folder dialogs and the file picker. The Media route
 * itself (view, source, folder, selected asset) is the address, never state
 * here.
 */
export function MediaWorkspaceShell({ children }: { children: ReactNode }) {
  const routes = useNewsroomRoutes();
  const account = useNewsroomAccount();
  const timezone = useNewsroomTimeZone();
  const { getPreference, setPreference } = usePreferences();
  const store = useRef({ getPreference, setPreference });
  store.current = { getPreference, setPreference };
  const fetchers = useMemo(() => createPayloadMediaFetchers(routes.api), [routes.api]);
  const [preferences] = useState(() => payloadMediaPreferences({ getPreference: (key) => store.current.getPreference(key), setPreference: (key, value) => store.current.setPreference(key, value) }));
  const [expanded, setExpandedSet] = useState<Set<number>>(() => new Set());
  const [sheetOpen, setSheetOpen] = useState(false);
  const [folderRequest, requestFolderAction] = useState<MediaFolderRequest | null>(null);
  const [picking, setPicking] = useState<PickRequest | null>(null);

  const setExpanded = useCallback((folderId: number, open: boolean) => setExpandedSet((current) => {
    if (current.has(folderId) === open) return current;
    const next = new Set(current);
    if (open) next.add(folderId);
    else next.delete(folderId);
    return next;
  }), []);
  const expandAll = useCallback((folderIds: number[]) => setExpandedSet((current) => (folderIds.every((id) => current.has(id)) ? current : new Set([...current, ...folderIds]))), []);
  const pick = useCallback<MediaWorkspace["pick"]>((options = {}) => new Promise((resolve) => {
    setPicking({ kind: options.kind ?? "", restrictedKind: options.restrictedKind, title: options.title, confirmLabel: options.confirmLabel, multiple: options.multiple !== false, resolve });
  }), []);
  const href = useCallback((route: MediaRoute) => `${routes.admin}/media${mediaHrefSearch(route)}`, [routes.admin]);
  const navigationGuard = useRef<((proceed: () => void) => void) | null>(null);
  const guardNavigation = useCallback((proceed: () => void) => (navigationGuard.current ? navigationGuard.current(proceed) : proceed()), []);
  const setNavigationGuard = useCallback((guard: ((proceed: () => void) => void) | null) => { navigationGuard.current = guard; }, []);

  const value = useMemo<MediaWorkspace>(() => ({ fetchers, preferences, expanded, setExpanded, expandAll, sheetOpen, setSheetOpen, folderRequest, requestFolderAction, pick, href, guardNavigation, setNavigationGuard }), [expandAll, expanded, fetchers, folderRequest, guardNavigation, href, pick, preferences, setExpanded, setNavigationGuard, sheetOpen]);
  const settle = (assets: MediaLibraryAsset[]) => {
    picking?.resolve(assets);
    setPicking(null);
  };

  return (
    <MediaWorkspaceContext value={value}>
      {children}
      {account ? (
        // Its own Byline root beside the page, so it opens over Story Peek or a Story screen and its form never reaches Payload's.
        <ShellLayer active={picking !== null}>
          <MediaPickerDialog
            open={picking !== null}
            onOpenChange={(open) => { if (!open) settle([]); }}
            fetchers={fetchers}
            timezone={timezone}
            kind={picking?.kind ?? ""}
            restrictedKind={picking?.restrictedKind}
            title={picking?.title}
            confirmLabel={picking?.confirmLabel}
            multiple={picking?.multiple ?? true}
            onConfirm={(assets) => settle(assets)}
          />
        </ShellLayer>
      ) : null}
    </MediaWorkspaceContext>
  );
}
