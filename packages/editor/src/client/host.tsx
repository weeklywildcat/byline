"use client";

import type { ArticleMediaAsset, MediaId, PublicEventReference, PublicPollReference, PublicStoryReference } from "@byline/article-body";
import { mediaKey } from "@byline/article-body";
import type { DataProjectChoice } from "../data-project";
import { createContext, use, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";

/**
 * What the newsroom gives the editor: Byline's Media picker, Media lookups
 * and uploads. The editor never talks to a CMS API itself, and never shows
 * Payload's raw Media picker.
 */
export type BylineEditorHost = {
  /** Byline's Media picker. Resolves with the chosen assets, or [] when dismissed. */
  pickMedia: (options: { kind: "image" | "document" | "audio"; multiple: boolean; title: string; confirmLabel: string }) => Promise<ArticleMediaAsset[]>;
  /** One asset by ID, or null when it is gone or not readable. Credit comes resolved from Media. */
  loadMedia: (id: MediaId) => Promise<ArticleMediaAsset | null>;
  /** Uploads a file into Media (when the host supports it here). */
  uploadMedia?: (file: File, onProgress?: (fraction: number) => void) => Promise<ArticleMediaAsset>;
  /** Opens the asset in the Media workspace, where its credit and alt text are edited for every story. */
  mediaHref?: (id: MediaId) => string;
  /**
   * Opens the host's full Media details inspector without leaving the article.
   * Returns the latest saved asset when it closes so the canvas can refresh.
   */
  editMediaDetails?: (id: MediaId) => Promise<ArticleMediaAsset | null>;
  /**
   * Opens the host's art-direction editor (focal point, crops) for an image.
   * Resolves true when the reader saved changes. The editor never knows the
   * CMS endpoint behind it.
   */
  editArtDirection?: (id: MediaId) => Promise<boolean>;
  /**
   * May this writer insert, change and remove the privileged blocks (Editor's
   * Note, Repository Interactive)? The server enforces it; this only shapes the
   * interface so nobody is offered a tool the server would put back.
   */
  canUsePrivilegedBlocks?: boolean;
  /** Published Stories to link from Related Coverage: searchable, never the story being edited. */
  searchStories?: (query: string) => Promise<StoryChoice[]>;
  /**
   * Published Stories Byline's own related-story rules rank for this story
   * (shared section and topics, newest first). Offered, never inserted: a
   * writer still chooses each one.
   */
  suggestStories?: () => Promise<StoryChoice[]>;
  /** One Story's public facts, or null when it is not published or is gone. */
  loadStory?: (id: MediaId) => Promise<StoryChoice | null>;
  /** The Polls a writer may place in a story (open or closed). */
  searchPolls?: (query: string) => Promise<PollChoice[]>;
  loadPoll?: (id: MediaId) => Promise<PollChoice | null>;
  /** The repository's registered interactives, as plain data (never their code). */
  interactives?: ReadonlyArray<{ key: string; name: string; description: string }>;
  /** The repository's registered trackers, as plain data (never their components, styles or client code). */
  trackers?: ReadonlyArray<{ key: string; name: string; description: string }>;
  /** Published Events, searchable by title. */
  searchEvents?: (query: string) => Promise<EventChoice[]>;
  /** One Event's public facts, or null when it is not published or is gone. */
  loadEvent?: (id: MediaId) => Promise<EventChoice | null>;
  /**
   * Data Projects a writer may place in a story: searchable, ordered by
   * publication (published, then unpublished changes, then drafts). Small
   * choices only, never a project's rows, bindings or presentation code.
   */
  searchDataProjects?: (query: string) => Promise<DataProjectChoice[]>;
  /** One Data Project's choice facts, or null when it is gone or this account cannot read it. */
  loadDataProject?: (id: MediaId) => Promise<DataProjectChoice | null>;
  /** Opens the Data Project in the Data workspace. */
  dataProjectHref?: (id: MediaId) => string;
  /** The Data workspace itself (a quiet link in the picker; projects are never created from a story). */
  dataWorkspaceHref?: string;
  /**
   * The real presentation of a Data Project, drawn by the host (the editor
   * never imports Data, Next or Payload). Published data when the project has
   * a published version, working data when it is only a draft.
   */
  renderDataProject?: (project: DataProjectChoice) => ReactNode;
  /** The publication's timezone and locale, for event times on the canvas. */
  timeZone?: string;
  locale?: string;
  /**
   * Receives the canvas's block inserter when the editor mounts (null when it
   * unmounts), so newsroom surfaces outside the canvas (the Reporting sheet's
   * "Insert quote") insert through the same Lexical command as the slash menu.
   */
  registerInserter?: (insert: StoryBlockInserter | null) => void;
};

/** Inserts one Byline block with initial fields where the writer is; false when the editor is read-only. */
export type StoryBlockInserter = (type: "reportedQuote", fields: Record<string, unknown>) => boolean;

export type { DataProjectChoice, DataProjectPublication } from "../data-project";

/** A published Story as the picker and the canvas show it. Facts come from the Story, never from the block. */
export type StoryChoice = PublicStoryReference & { thumbnailAsset?: ArticleMediaAsset | null };
export type PollChoice = PublicPollReference & { status: "draft" | "open" | "closed" };
/** A published Event as the picker and the canvas show it. Facts come from the Event, never from the block. */
export type EventChoice = PublicEventReference;

type Entry<T = ArticleMediaAsset> = { status: "loading" | "ready" | "missing"; asset: T | null };

/** One small cache per kind of record (Media, Stories, Polls): one request per record, primed by pickers. */
type RecordStore<T> = {
  get: (id: MediaId) => Entry<T>;
  prime: (items: Array<{ id: MediaId; value: T }>) => void;
  subscribe: (listener: () => void) => () => void;
};

type MediaStore = RecordStore<ArticleMediaAsset> & { primeAssets: (assets: ArticleMediaAsset[]) => void };

type EditorHostContext = BylineEditorHost & { store: MediaStore; stories: RecordStore<StoryChoice>; polls: RecordStore<PollChoice>; events: RecordStore<EventChoice>; dataProjects: RecordStore<DataProjectChoice>; announce: (message: string) => void };

const HostContext = createContext<EditorHostContext | null>(null);

const LOADING: Entry<never> = { status: "loading", asset: null };

function createRecordStore<T>(load: (id: MediaId) => Promise<T | null>): RecordStore<T> {
  const entries = new Map<string, Entry<T>>();
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((listener) => listener());
  const set = (key: string, entry: Entry<T>) => {
    entries.set(key, entry);
    emit();
  };
  return {
    get: (id) => {
      const key = mediaKey(id);
      const entry = entries.get(key);
      if (entry) return entry;
      entries.set(key, LOADING);
      void load(id).then(
        (value) => set(key, value ? { status: "ready", asset: value } : { status: "missing", asset: null }),
        () => set(key, { status: "missing", asset: null })
      );
      return LOADING;
    },
    prime: (items) => {
      for (const item of items) entries.set(mediaKey(item.id), { status: "ready", asset: item.value });
      emit();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  };
}

/** Provides the host and a small Media cache (one request per asset, primed by the picker). */
export function BylineEditorHostProvider({ host, children }: { host: BylineEditorHost; children: ReactNode }) {
  const hostRef = useRef(host);
  hostRef.current = host;
  const store = useMemo<MediaStore>(() => {
    const base = createRecordStore<ArticleMediaAsset>((id) => hostRef.current.loadMedia(id));
    return { ...base, primeAssets: (assets) => base.prime(assets.map((asset) => ({ id: asset.id, value: asset }))) };
  }, []);
  const stories = useMemo(() => createRecordStore<StoryChoice>(async (id) => (await hostRef.current.loadStory?.(id)) ?? null), []);
  const polls = useMemo(() => createRecordStore<PollChoice>(async (id) => (await hostRef.current.loadPoll?.(id)) ?? null), []);
  const events = useMemo(() => createRecordStore<EventChoice>(async (id) => (await hostRef.current.loadEvent?.(id)) ?? null), []);
  const dataProjects = useMemo(() => createRecordStore<DataProjectChoice>(async (id) => (await hostRef.current.loadDataProject?.(id)) ?? null), []);
  // One polite live region for block edits (added, moved, removed): decorators render
  // through portals, so the announcer lives here, above the editor.
  const [message, setMessage] = useState("");
  const announce = useCallback((next: string) => {
    setMessage("");
    window.requestAnimationFrame(() => setMessage(next));
  }, []);
  const value = useMemo<EditorHostContext>(() => ({ ...host, store, stories, polls, events, dataProjects, announce }), [announce, dataProjects, events, host, polls, stories, store]);
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

const MISSING_NONE: Entry<never> = { status: "missing", asset: null };

/** One Story's public facts for display, loaded once. */
export function useStoryChoice(id: MediaId | null): Entry<StoryChoice> {
  const { stories } = useBylineEditorHost();
  const read = useCallback(() => (id === null ? MISSING_NONE : stories.get(id)), [id, stories]);
  return useSyncExternalStore(stories.subscribe, read, read);
}

/** One Poll's public definition for display, loaded once. */
export function usePollChoice(id: MediaId | null): Entry<PollChoice> {
  const { polls } = useBylineEditorHost();
  const read = useCallback(() => (id === null ? MISSING_NONE : polls.get(id)), [id, polls]);
  return useSyncExternalStore(polls.subscribe, read, read);
}

/** One Event's public facts for display, loaded once. */
export function useEventChoice(id: MediaId | null): Entry<EventChoice> {
  const { events } = useBylineEditorHost();
  const read = useCallback(() => (id === null ? MISSING_NONE : events.get(id)), [id, events]);
  return useSyncExternalStore(events.subscribe, read, read);
}

/** One Data Project's choice facts for display, loaded once. */
export function useDataProjectChoice(id: MediaId | null): Entry<DataProjectChoice> {
  const { dataProjects } = useBylineEditorHost();
  const read = useCallback(() => (id === null ? MISSING_NONE : dataProjects.get(id)), [id, dataProjects]);
  return useSyncExternalStore(dataProjects.subscribe, read, read);
}

/** Picks media through Byline's picker and primes the cache with what was chosen. */
export function usePickMedia() {
  const { pickMedia, store } = useBylineEditorHost();
  return useCallback(async (options: Parameters<BylineEditorHost["pickMedia"]>[0]) => {
    const assets = await pickMedia(options);
    store.primeAssets(assets);
    return assets;
  }, [pickMedia, store]);
}

/** Uploads through the host and primes the cache, or null when the host cannot upload here. */
export function useUploadMedia() {
  const { uploadMedia, store } = useBylineEditorHost();
  return useMemo(() => (uploadMedia ? async (file: File, onProgress?: (fraction: number) => void) => {
    const asset = await uploadMedia(file, onProgress);
    store.primeAssets([asset]);
    return asset;
  } : null), [store, uploadMedia]);
}

/** Opens the host's Media details inspector and refreshes the editor's asset cache after a save. */
export function useEditMediaDetails() {
  const { editMediaDetails, store } = useBylineEditorHost();
  return useMemo(() => (editMediaDetails ? async (id: MediaId) => {
    const asset = await editMediaDetails(id);
    if (asset) store.primeAssets([asset]);
    return asset;
  } : null), [editMediaDetails, store]);
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
