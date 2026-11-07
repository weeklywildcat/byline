"use client";

import type { ArticleMediaAsset, MediaId } from "@byline/article-body";
import { mediaKey } from "@byline/article-body";
import { createContext, use, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";

/**
 * What the newsroom gives the editor: Byline's Media picker, Media lookups
 * and uploads. The editor never talks to a CMS API itself, and never shows
 * Payload's raw Media picker.
 */
export type BylineEditorHost = {
  /** Byline's Media picker. Resolves with the chosen assets, or [] when dismissed. */
  pickMedia: (options: { kind: "image" | "document"; multiple: boolean; title: string; confirmLabel: string }) => Promise<ArticleMediaAsset[]>;
  /** One asset by ID, or null when it is gone or not readable. Credit comes resolved from Media. */
  loadMedia: (id: MediaId) => Promise<ArticleMediaAsset | null>;
  /** Uploads a file into Media (when the host supports it here). */
  uploadMedia?: (file: File, onProgress?: (fraction: number) => void) => Promise<ArticleMediaAsset>;
  /** Opens the asset in the Media workspace, where its credit and alt text are edited for every story. */
  mediaHref?: (id: MediaId) => string;
};

type Entry = { status: "loading" | "ready" | "missing"; asset: ArticleMediaAsset | null };

type MediaStore = {
  get: (id: MediaId) => Entry;
  prime: (assets: ArticleMediaAsset[]) => void;
  subscribe: (listener: () => void) => () => void;
};

type EditorHostContext = BylineEditorHost & { store: MediaStore; announce: (message: string) => void };

const HostContext = createContext<EditorHostContext | null>(null);

const LOADING: Entry = { status: "loading", asset: null };

/** Provides the host and a small Media cache (one request per asset, primed by the picker). */
export function BylineEditorHostProvider({ host, children }: { host: BylineEditorHost; children: ReactNode }) {
  const hostRef = useRef(host);
  hostRef.current = host;
  const store = useMemo<MediaStore>(() => {
    const entries = new Map<string, Entry>();
    const listeners = new Set<() => void>();
    const emit = () => listeners.forEach((listener) => listener());
    const set = (key: string, entry: Entry) => {
      entries.set(key, entry);
      emit();
    };
    return {
      get: (id) => {
        const key = mediaKey(id);
        const entry = entries.get(key);
        if (entry) return entry;
        entries.set(key, LOADING);
        void hostRef.current.loadMedia(id).then(
          (asset) => set(key, asset ? { status: "ready", asset } : { status: "missing", asset: null }),
          () => set(key, { status: "missing", asset: null })
        );
        return LOADING;
      },
      prime: (assets) => {
        for (const asset of assets) entries.set(mediaKey(asset.id), { status: "ready", asset });
        emit();
      },
      subscribe: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      }
    };
  }, []);
  // One polite live region for block edits (added, moved, removed): decorators render
  // through portals, so the announcer lives here, above the editor.
  const [message, setMessage] = useState("");
  const announce = useCallback((next: string) => {
    setMessage("");
    window.requestAnimationFrame(() => setMessage(next));
  }, []);
  const value = useMemo<EditorHostContext>(() => ({ ...host, store, announce }), [announce, host, store]);
  return (
    <HostContext value={value}>
      {children}
      <div className="sr-only" role="status" aria-live="polite" data-byline-editor-announcer="">{message}</div>
    </HostContext>
  );
}

export function useBylineEditorHost(): EditorHostContext {
  const host = use(HostContext);
  if (!host) throw new Error("The Byline editor needs BylineEditorHostProvider.");
  return host;
}

export function useOptionalEditorHost(): EditorHostContext | null {
  return use(HostContext);
}

/** One Media asset for display, loaded once and shared by every block that shows it. */
export function useMediaAsset(id: MediaId | null): Entry {
  const { store } = useBylineEditorHost();
  const read = useCallback(() => (id === null ? MISSING_NONE : store.get(id)), [id, store]);
  return useSyncExternalStore(store.subscribe, read, read);
}

const MISSING_NONE: Entry = { status: "missing", asset: null };

/** Picks media through Byline's picker and primes the cache with what was chosen. */
export function usePickMedia() {
  const { pickMedia, store } = useBylineEditorHost();
  return useCallback(async (options: Parameters<BylineEditorHost["pickMedia"]>[0]) => {
    const assets = await pickMedia(options);
    store.prime(assets);
    return assets;
  }, [pickMedia, store]);
}

/** Uploads through the host and primes the cache, or null when the host cannot upload here. */
export function useUploadMedia() {
  const { uploadMedia, store } = useBylineEditorHost();
  return useMemo(() => (uploadMedia ? async (file: File, onProgress?: (fraction: number) => void) => {
    const asset = await uploadMedia(file, onProgress);
    store.prime([asset]);
    return asset;
  } : null), [store, uploadMedia]);
}

/** Polite announcements for block edits (add, move, remove), read by screen readers. */
export function useAnnounce() {
  return use(HostContext)?.announce ?? noop;
}
const noop = () => {};

/** Keeps a value's latest version for callbacks without re-subscribing. */
export function useLatest<T>(value: T) {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  });
  return ref;
}
