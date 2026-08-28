import { useCallback, useEffect, useRef, useState } from "@wordpress/element";

export type StudioAutosaveStatus = "clean" | "pending" | "saving" | "saved" | "error" | "offline";

export type StudioAutosaveRecord<T> = {
  document: T;
  baseRevisionId: number;
  modifiedAt: string;
};

export type StudioAutosaveState = {
  status: StudioAutosaveStatus;
  hasDraft: boolean;
  error: unknown | null;
  lastSavedAt: number | null;
};

type SaveOperation<T> = {
  document: T;
  baseRevisionId: number;
  save: (document: T, baseRevisionId: number) => Promise<StudioAutosaveRecord<T>>;
  editVersion: number;
};

type StudioAutosaveListener = () => void;

export type StudioAutosaveController<T> = {
  getState: () => StudioAutosaveState;
  getBaseRevisionId: () => number;
  hasPending: () => boolean;
  schedule: (document: T) => void;
  flush: () => Promise<StudioAutosaveRecord<T> | null>;
  discard: () => Promise<void>;
  supersede: () => void;
  hydrate: (options: { hasDraft: boolean; baseRevisionId: number }) => void;
  rebase: (baseRevisionId: number) => void;
  markPublished: (revision: number) => void;
  subscribe: (listener: StudioAutosaveListener) => () => void;
  close: () => void;
};

type StudioAutosaveControllerOptions<T> = {
  debounceMs?: number;
  baseRevisionId: number;
  save: (document: T, baseRevisionId: number) => Promise<StudioAutosaveRecord<T>>;
  onSaved?: (record: StudioAutosaveRecord<T>, isLatestLocalEdit: boolean) => void;
  onError?: (error: unknown) => void;
};

function isOfflineError(error: unknown): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  if (error instanceof TypeError) return true;
  const message = error && typeof error === "object" && "message" in error
    ? String((error as { message?: unknown }).message ?? "")
    : String(error ?? "");
  return /offline|network|failed to fetch|load failed/i.test(message);
}

/**
 * A small, transport-agnostic queue for Studio draft writes.
 *
 * There is at most one request in flight. Newer edits remain queued while an
 * older request finishes, and an older response can never be reported as the
 * current local document. `discard` waits for an already-started request before
 * it invalidates the queue; this is what makes reset safe even if the request
 * reached WordPress just before the user confirmed the discard.
 */
export function createStudioAutosaveController<T>(options: StudioAutosaveControllerOptions<T>): StudioAutosaveController<T> {
  const debounceMs = options.debounceMs ?? 900;
  const listeners = new Set<StudioAutosaveListener>();
  let state: StudioAutosaveState = {
    status: "clean",
    hasDraft: false,
    error: null,
    lastSavedAt: null
  };
  let baseRevisionId = options.baseRevisionId;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: SaveOperation<T> | null = null;
  let inFlight: Promise<StudioAutosaveRecord<T>> | null = null;
  let generation = 0;
  let editVersion = 0;
  let closed = false;
  let flushPromise: Promise<StudioAutosaveRecord<T> | null> | null = null;

  const notify = () => {
    for (const listener of listeners) listener();
  };

  const update = (next: Partial<StudioAutosaveState>) => {
    state = { ...state, ...next };
    notify();
  };

  const clearTimer = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };

  const start = (operation: SaveOperation<T>): Promise<StudioAutosaveRecord<T>> => {
    const operationGeneration = generation;
    const operationVersion = operation.editVersion;
    update({ status: "saving", error: null });

    const request = operation.save(operation.document, operation.baseRevisionId)
      .then((record) => {
        if (closed || operationGeneration !== generation) return record;

        // A successful older request still proves that a server-side draft
        // exists, but it must not replace a newer local document. The Studio
        // callback receives that distinction and only replaces server metadata
        // when this is the latest local edit.
        const isLatestLocalEdit = operationVersion === editVersion && pending === null;
        update({
          status: isLatestLocalEdit ? "saved" : "pending",
          hasDraft: true,
          error: null,
          lastSavedAt: Date.now()
        });
        options.onSaved?.(record, isLatestLocalEdit);
        return record;
      })
      .catch((error: unknown) => {
        if (!closed && operationGeneration === generation) {
          // Keep the failed document queued so the user can retry without
          // re-entering it. A newer edit, if any, is already the queued value.
          if (pending === null && operationVersion === editVersion) pending = operation;
          update({ status: isOfflineError(error) ? "offline" : "error", error });
          options.onError?.(error);
        }
        throw error;
      })
      .finally(() => {
        if (inFlight === request) inFlight = null;
        if (!closed && operationGeneration === generation && pending !== null) {
          update({ status: "pending", error: null });
        }
      });

    inFlight = request;
    return request;
  };

  const flushPending = async (): Promise<StudioAutosaveRecord<T> | null> => {
    clearTimer();
    if (closed) return null;

    // Serialize writes. If an edit arrives while a request is in flight, the
    // next pass sends the queued latest document after the older request ends.
    let result: StudioAutosaveRecord<T> | null = null;
    if (inFlight) {
      try {
        result = await inFlight;
      } catch (error) {
        // A failed request remains queued for a later explicit retry. If a
        // newer edit was already waiting, try that newer snapshot once so a
        // navigation/publish flush still has a chance to complete; never loop
        // forever while the network is unavailable.
        if (pending !== null) {
          const operation = pending;
          pending = null;
          result = await start(operation);
        } else {
          throw error;
        }
      }
    } else {
      if (pending === null) return null;
      const operation = pending;
      pending = null;
      try {
        result = await start(operation);
      } catch (error) {
        // If a newer edit was queued while this request was running, give the
        // latest snapshot one explicit attempt before navigation gives up.
        if (pending === null) throw error;
        const newerOperation = pending;
        pending = null;
        result = await start(newerOperation);
      }
    }

    // An edit can arrive after the initial snapshot is removed from the queue
    // but before its request resolves. Drain that edit too; otherwise an exit
    // or template switch could supersede it immediately after this flush.
    if (pending !== null) return (await flushPending()) ?? result;
    return result;
  };

  const flush = (): Promise<StudioAutosaveRecord<T> | null> => {
    clearTimer();
    if (flushPromise) return flushPromise;
    const run = flushPending();
    const wrapped = run.finally(() => {
      if (flushPromise === wrapped) flushPromise = null;
    });
    flushPromise = wrapped;
    return wrapped;
  };

  const controller: StudioAutosaveController<T> = {
    getState: () => ({ ...state }),
    getBaseRevisionId: () => baseRevisionId,
    hasPending: () => pending !== null || inFlight !== null,

    schedule: (document: T) => {
      if (closed) return;
      editVersion += 1;
      pending = {
        document,
        baseRevisionId,
        save: options.save,
        editVersion
      };
      clearTimer();
      update({ status: "pending", error: null });
      timer = setTimeout(() => {
        timer = null;
        void flush().catch(() => undefined);
      }, debounceMs);
    },

    flush,

    discard: async () => {
      clearTimer();
      pending = null;
      if (flushPromise) {
        try {
          await flushPromise;
        } catch {
          // The request's error is represented in the controller; the server
          // draft is still deleted below after the request has settled.
        }
      }
      // A request that already reached the server must finish before the caller
      // deletes the server draft, otherwise its late response could recreate it.
      if (inFlight) {
        try {
          await inFlight;
        } catch {
          // The caller may still choose to delete the server draft. The request
          // has settled, so it can no longer race the DELETE.
        }
      }
      // A caller may have caused a render while the previous request was
      // settling. Discard any queue that appeared during that wait as well.
      pending = null;
      generation += 1;
      editVersion += 1;
      update({ status: "clean", hasDraft: false, error: null });
    },

    supersede: () => {
      clearTimer();
      pending = null;
      generation += 1;
      editVersion += 1;
      update({ status: "clean", error: null });
    },

    hydrate: ({ hasDraft, baseRevisionId: nextBaseRevisionId }) => {
      baseRevisionId = nextBaseRevisionId;
      generation += 1;
      editVersion += 1;
      clearTimer();
      pending = null;
      update({ status: hasDraft ? "saved" : "clean", hasDraft, error: null });
    },

    rebase: (nextBaseRevisionId: number) => {
      baseRevisionId = nextBaseRevisionId;
      if (pending) pending = { ...pending, baseRevisionId: nextBaseRevisionId };
      notify();
    },

    markPublished: (revision: number) => {
      baseRevisionId = revision;
      generation += 1;
      editVersion += 1;
      clearTimer();
      pending = null;
      update({ status: "clean", hasDraft: false, error: null, lastSavedAt: Date.now() });
    },

    subscribe: (listener: StudioAutosaveListener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    close: () => {
      if (closed) return;
      clearTimer();
      // Cleanup cannot be awaited by React. Drain an already-running write and
      // then send the newest queued edit before closing the controller; closing
      // immediately would lose an edit made while the older request was in
      // flight.
      void (async () => {
        try {
          await flush();
        } catch {
          // The request's error is already represented in the controller while
          // the component is mounted. There is no safe UI callback after
          // cleanup, so just stop draining.
        } finally {
          closed = true;
          clearTimer();
          listeners.clear();
        }
      })();
    }
  };

  return controller;
}

export type UseStudioAutosaveOptions<T> = StudioAutosaveControllerOptions<T>;

export function useStudioAutosave<T>(options: UseStudioAutosaveOptions<T>) {
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const controllerRef = useRef<StudioAutosaveController<T> | null>(null);
  if (!controllerRef.current) {
    controllerRef.current = createStudioAutosaveController({
      ...options,
      save: (document, baseRevisionId) => optionsRef.current.save(document, baseRevisionId),
      onSaved: (record, isLatestLocalEdit) => optionsRef.current.onSaved?.(record, isLatestLocalEdit),
      onError: (error) => optionsRef.current.onError?.(error)
    });
  }
  const controller = controllerRef.current;
  const [state, setState] = useState(controller.getState());

  useEffect(() => controller.subscribe(() => setState(controller.getState())), [controller]);
  useEffect(() => {
    controller.rebase(options.baseRevisionId);
  }, [controller, options.baseRevisionId]);
  useEffect(() => () => controller.close(), [controller]);

  const schedule = useCallback((document: T) => controller.schedule(document), [controller]);
  const flush = useCallback(() => controller.flush(), [controller]);
  const discard = useCallback(() => controller.discard(), [controller]);
  const supersede = useCallback(() => controller.supersede(), [controller]);
  const hydrate = useCallback((next: { hasDraft: boolean; baseRevisionId: number }) => controller.hydrate(next), [controller]);
  const rebase = useCallback((revision: number) => controller.rebase(revision), [controller]);
  const markPublished = useCallback((revision: number) => controller.markPublished(revision), [controller]);

  return {
    ...state,
    hasPending: controller.hasPending(),
    baseRevisionId: controller.getBaseRevisionId(),
    schedule,
    flush,
    discard,
    supersede,
    hydrate,
    rebase,
    markPublished,
    controller
  };
}
