/**
 * Small, transport-independent reliability primitives for Byline admin UIs.
 *
 * The package deliberately has no React, WordPress, or HTTP-client dependency.
 * Callers provide the transport and decide how state snapshots are rendered.
 */

const DEFAULT_ERROR_TITLE = "Something went wrong";
const DEFAULT_ERROR_MESSAGE = "Something went wrong. Please try again.";
const MAX_USER_TEXT_LENGTH = 240;
const MAX_ERROR_CODE_LENGTH = 80;

type ErrorRecord = Record<string, unknown>;

/** A safe optional action attached to a user-facing error. */
export type BylineErrorAction = {
  label: string;
  href?: string;
};

/**
 * The one error shape admin consumers should pass to UI state.
 *
 * Normalization intentionally drops diagnostic causes and arbitrary response
 * data. Keep those details in logs owned by the transport layer instead.
 */
export type BylineError = {
  code?: string;
  title: string;
  message: string;
  retryable: boolean;
  action?: BylineErrorAction;
};

/** Optional overrides for the safe error normalization boundary. */
export type NormalizeBylineErrorOptions = {
  title?: string;
  message?: string;
  retryable?: boolean;
  action?: BylineErrorAction;
};

function isRecord(value: unknown): value is ErrorRecord {
  return typeof value === "object" && value !== null;
}

/** Strip tags and controls without turning an arbitrary object into text. */
function stripMarkupAndControls(value: string): string {
  let output = "";
  let insideTag = false;

  for (const character of value) {
    if (character === "<") {
      insideTag = true;
      continue;
    }

    if (character === ">") {
      insideTag = false;
      continue;
    }

    if (!insideTag) output += character;
  }

  return output
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function containsSensitiveText(value: string): boolean {
  // The fallback is deliberately conservative. A server error that mentions
  // a credential, stack, or database detail should never reach the editor.
  return /\b(?:password|passwd|secret|token|api[-_ ]?key|authorization|bearer|sqlstate|stack trace|traceback|fatal error)\b/i.test(value)
    || /^\s*[\[{][\s\S]*[\]}]\s*$/i.test(value);
}

function safeText(value: unknown, maxLength = MAX_USER_TEXT_LENGTH): string | undefined {
  if (typeof value !== "string") return undefined;

  const text = stripMarkupAndControls(value);
  if (!text || text.length > maxLength || containsSensitiveText(text)) return undefined;
  return text;
}

function nestedMessage(value: unknown, depth = 0): string | undefined {
  if (depth > 3) return undefined;
  if (typeof value === "string") return value;
  if (value instanceof Error) return value.message;
  if (!isRecord(value)) return undefined;

  for (const key of ["message", "detail"]) {
    const candidate = value[key];
    if (typeof candidate === "string") return candidate;
  }

  for (const key of ["error", "data"]) {
    const nested = nestedMessage(value[key], depth + 1);
    if (nested !== undefined) return nested;
  }

  return undefined;
}

function nestedTitle(value: unknown, depth = 0): string | undefined {
  if (depth > 3 || !isRecord(value)) return undefined;
  if (typeof value.title === "string") return value.title;
  return nestedTitle(value.data, depth + 1);
}

function nestedCode(value: unknown, depth = 0): string | undefined {
  if (depth > 3 || !isRecord(value)) return undefined;
  if (typeof value.code === "string") return value.code;
  return nestedCode(value.data, depth + 1);
}

function nestedStatus(value: unknown, depth = 0): number | undefined {
  if (depth > 3 || !isRecord(value)) return undefined;

  for (const key of ["status", "statusCode"]) {
    const candidate = value[key];
    if (typeof candidate === "number" && Number.isFinite(candidate)) return candidate;
  }

  const response = value.response;
  if (isRecord(response) && typeof response.status === "number" && Number.isFinite(response.status)) {
    return response.status;
  }

  return nestedStatus(value.data, depth + 1);
}

function nestedRetryable(value: unknown, depth = 0): boolean | undefined {
  if (depth > 3 || !isRecord(value)) return undefined;
  if (typeof value.retryable === "boolean") return value.retryable;
  return nestedRetryable(value.data, depth + 1);
}

function nestedAction(value: unknown, depth = 0): BylineErrorAction | undefined {
  if (depth > 2 || !isRecord(value)) return undefined;
  if (isRecord(value.action)) {
    const label = value.action.label;
    const href = value.action.href;
    if (typeof label === "string") {
      return {
        label,
        ...(typeof href === "string" ? { href } : {})
      };
    }
  }
  return nestedAction(value.data, depth + 1);
}

function safeCode(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length > MAX_ERROR_CODE_LENGTH) return undefined;
  const code = value.trim();
  return /^[A-Za-z0-9][A-Za-z0-9_.:-]*$/.test(code) ? code : undefined;
}

function safeAction(value: unknown): BylineErrorAction | undefined {
  if (!isRecord(value)) return undefined;
  const label = safeText(value.label, 120);
  if (!label) return undefined;

  if (typeof value.href !== "string") return { label };
  const href = value.href.trim();
  if (!href || href.length > 2000 || /[\u0000-\u001f\u007f]/.test(href)) return { label };
  if (/^\s*(?:javascript|data|vbscript):/i.test(href)) return { label };
  if (/^[A-Za-z][A-Za-z0-9+.-]*:\/\/[^/?#]*@/.test(href)) return { label };
  if (/(?:^|[?&])(?:password|passwd|secret|token|api[-_]?key|authorization|bearer)=/i.test(href)) {
    return { label };
  }
  return { label, href };
}

function inferRetryable(error: unknown, status: number | undefined, code: string | undefined, message: string | undefined): boolean {
  if (error instanceof TypeError) return true;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  if (status !== undefined) {
    return status === 408 || status === 425 || status === 429 || status >= 500;
  }

  const text = `${code ?? ""} ${message ?? ""}`;
  return /offline|network|failed to fetch|load failed|connection|timeout|timed out|temporar(?:y|ily)|unavailable|rate[-_ ]?limit|econn|enet|enotfound|gateway/i.test(text);
}

/**
 * Convert WordPress REST errors, Error instances, and unknown transport
 * failures into a bounded, credential-safe BylineError.
 */
export function normalizeBylineError(
  error: unknown,
  options: NormalizeBylineErrorOptions = {}
): BylineError {
  const fallbackTitle = safeText(options.title, 120) ?? DEFAULT_ERROR_TITLE;
  const fallbackMessage = safeText(options.message) ?? DEFAULT_ERROR_MESSAGE;
  const message = safeText(nestedMessage(error)) ?? fallbackMessage;
  const title = safeText(nestedTitle(error), 120) ?? fallbackTitle;
  const code = safeCode(nestedCode(error));
  const status = nestedStatus(error);
  const explicitRetryable = options.retryable ?? nestedRetryable(error);
  const retryable = explicitRetryable ?? inferRetryable(error, status, code, nestedMessage(error));
  const action = safeAction(options.action ?? nestedAction(error));

  return {
    ...(code ? { code } : {}),
    title,
    message,
    retryable,
    ...(action ? { action } : {})
  };
}

/** Extract only safe text for a notice, toast, or aria-live region. */
export function safeUserFacingError(
  error: unknown,
  fallback = DEFAULT_ERROR_MESSAGE
): string {
  return normalizeBylineError(error, { message: fallback }).message;
}

/** Whether a failure looks like a lost connection rather than a server rule. */
export function isOfflineError(error: unknown): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  if (error instanceof TypeError) return true;

  const code = nestedCode(error) ?? "";
  const message = nestedMessage(error) ?? "";
  return /offline|network|failed to fetch|load failed|connection|econn|enet|enotfound|timed out|timeout/i.test(`${code} ${message}`);
}

/** Whether normalization classifies a failure as safe to retry. */
export function isRetryableBylineError(error: unknown): boolean {
  return normalizeBylineError(error).retryable;
}

/** Query lifecycle states shared by admin data loaders. */
export type QueryStatus = "idle" | "loading" | "refreshing" | "success" | "error";

/** A transport-neutral query snapshot. */
export type QueryState<TData = unknown> = {
  status: QueryStatus;
  data: TData | null;
  error: BylineError | null;
  generation: number;
  isStale: boolean;
  updatedAt: number | null;
};

/** Mutation lifecycle states shared by saves and actions. */
export type MutationStatus = "idle" | "queued" | "running" | "success" | "error" | "offline" | "rolled-back";

/** A transport-neutral mutation snapshot. */
export type MutationState<TData = unknown> = {
  status: MutationStatus;
  data: TData | null;
  error: BylineError | null;
  generation: number;
  attempt: number;
  isPending: boolean;
  hasRunOnce: boolean;
  updatedAt: number | null;
};

/** A monotonic counter used to reject stale async completions. */
export type GenerationGuard = {
  current(): number;
  next(): number;
  invalidate(): number;
  isCurrent(generation: number): boolean;
};

/** Create an independent generation guard for reads, writes, or a view. */
export function createGenerationGuard(initialGeneration = 0): GenerationGuard {
  if (!Number.isSafeInteger(initialGeneration) || initialGeneration < 0) {
    throw new RangeError("initialGeneration must be a non-negative safe integer");
  }

  let generation = initialGeneration;
  const advance = () => {
    generation += 1;
    return generation;
  };

  return {
    current: () => generation,
    next: advance,
    invalidate: advance,
    isCurrent: (candidate) => candidate === generation
  };
}

type QueueJob = {
  operation: () => unknown;
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
};

/** FIFO queue contract for mutations that must never overlap. */
export type SerialMutationQueue = {
  enqueue<T>(operation: () => T | PromiseLike<T>): Promise<T>;
  drain(): Promise<void>;
  clear(reason?: unknown): void;
  readonly size: number;
  readonly running: boolean;
};

/**
 * Serialize arbitrary mutation functions. A failed job rejects its own
 * promise, while the queue continues with later jobs.
 */
export function createSerialMutationQueue(): SerialMutationQueue {
  const jobs: QueueJob[] = [];
  const drainWaiters: Array<() => void> = [];
  let running = false;

  const resolveDrains = () => {
    if (running || jobs.length > 0) return;
    while (drainWaiters.length > 0) drainWaiters.shift()?.();
  };

  const pump = async () => {
    if (running) return;
    running = true;

    try {
      while (jobs.length > 0) {
        const job = jobs.shift();
        if (!job) continue;

        try {
          job.resolve(await job.operation());
        } catch (error) {
          job.reject(error);
        }
      }
    } finally {
      running = false;
      resolveDrains();
    }
  };

  return {
    enqueue<T>(operation: () => T | PromiseLike<T>): Promise<T> {
      return new Promise<T>((resolve, reject) => {
        jobs.push({ operation, resolve: resolve as (value: unknown) => void, reject });
        void pump();
      });
    },

    drain(): Promise<void> {
      if (!running && jobs.length === 0) return Promise.resolve();
      return new Promise<void>((resolve) => drainWaiters.push(resolve));
    },

    clear(reason = new Error("Queued mutations were cleared.")) {
      while (jobs.length > 0) jobs.shift()?.reject(reason);
      resolveDrains();
    },

    get size() {
      return jobs.length;
    },

    get running() {
      return running;
    }
  };
}

/** Online/offline values used by the connection helper. */
export type OnlineStatus = "online" | "offline";

/** Minimal browser-like source accepted by {@link detectOnlineState}. */
export type OnlineStateSource = {
  onLine?: boolean;
};

/** Read browser connectivity without requiring a browser during SSR/tests. */
export function detectOnlineState(source?: OnlineStateSource | null): OnlineStatus {
  const browserNavigator = typeof navigator !== "undefined" ? navigator : undefined;
  const effectiveSource = source ?? browserNavigator;
  return effectiveSource?.onLine === false ? "offline" : "online";
}

/** The event subset needed to observe browser connectivity changes. */
export type OnlineEventTarget = Pick<EventTarget, "addEventListener" | "removeEventListener">;

/** A small observable online/offline state store. */
export type OnlineStateController = {
  getState(): OnlineStatus;
  setState(status: OnlineStatus): void;
  setOnline(online: boolean): void;
  subscribe(listener: (status: OnlineStatus) => void): () => void;
  start(target?: OnlineEventTarget): () => void;
};

/**
 * Track connectivity transitions. `start` is explicit so importing this
 * package never attaches browser listeners by itself.
 */
export function createOnlineState(options: {
  initial?: OnlineStatus;
  eventTarget?: OnlineEventTarget;
} = {}): OnlineStateController {
  const listeners = new Set<(status: OnlineStatus) => void>();
  const defaultTarget = typeof window !== "undefined" ? window : undefined;
  let state = options.initial ?? detectOnlineState();
  let stopListening: (() => void) | null = null;

  const setState = (next: OnlineStatus) => {
    if (next === state) return;
    state = next;
    for (const listener of listeners) listener(state);
  };

  const start = (target = options.eventTarget ?? defaultTarget): (() => void) => {
    stopListening?.();
    if (!target) return () => undefined;

    let stopped = false;
    const onOnline = () => setState("online");
    const onOffline = () => setState("offline");
    target.addEventListener("online", onOnline);
    target.addEventListener("offline", onOffline);

    const stop = () => {
      if (stopped) return;
      stopped = true;
      target.removeEventListener("online", onOnline);
      target.removeEventListener("offline", onOffline);
      if (stopListening === stop) stopListening = null;
    };

    stopListening = stop;
    return stop;
  };

  return {
    getState: () => state,
    setState,
    setOnline: (online) => setState(online ? "online" : "offline"),
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    start
  };
}

/** Context passed to an autosave writer. */
export type AutosaveSaveContext = {
  generation: number;
};

/** Context passed to autosave lifecycle callbacks. */
export type AutosaveEventContext<TValue> = {
  value: TValue;
  generation: number;
  isLatest: boolean;
};

/** Autosave lifecycle states. */
export type AutosaveStatus = "idle" | "queued" | "saving" | "saved" | "error" | "offline";

/** A snapshot of a generation-aware autosave queue. */
export type AutosaveState<TValue, TResult = TValue> = {
  status: AutosaveStatus;
  value: TValue | null;
  lastSavedValue: TValue | null;
  lastResult: TResult | null;
  error: BylineError | null;
  generation: number;
  savedGeneration: number | null;
  hasPending: boolean;
  lastSavedAt: number | null;
};

/** Options for a latest-wins autosave queue. */
export type AutosaveQueueOptions<TValue, TResult = TValue> = {
  save: (value: TValue, context: AutosaveSaveContext) => TResult | PromiseLike<TResult>;
  debounceMs?: number;
  initialValue?: TValue;
  now?: () => number;
  onSaved?: (result: TResult, context: AutosaveEventContext<TValue>) => void;
  onError?: (error: BylineError, context: AutosaveEventContext<TValue>) => void;
};

/** Public controls for a generation-aware autosave queue. */
export type AutosaveQueue<TValue, TResult = TValue> = {
  getState(): AutosaveState<TValue, TResult>;
  schedule(value: TValue): number;
  flush(): Promise<TResult | null>;
  retry(): Promise<TResult | null>;
  supersede(): void;
  subscribe(listener: () => void): () => void;
  close(): Promise<void>;
};

type PendingAutosave<TValue> = {
  value: TValue;
  generation: number;
};

/**
 * Serialize saves while retaining only the newest edit waiting behind the
 * current request. Older responses may be observed by `onSaved`, but they
 * never become `lastSavedValue` and cannot overwrite current local state.
 */
export function createAutosaveQueue<TValue, TResult = TValue>(
  options: AutosaveQueueOptions<TValue, TResult>
): AutosaveQueue<TValue, TResult> {
  const listeners = new Set<() => void>();
  const generationGuard = createGenerationGuard();
  const debounceMs = Math.max(0, options.debounceMs ?? 900);
  const now = options.now ?? Date.now;
  let state: AutosaveState<TValue, TResult> = {
    status: "idle",
    value: options.initialValue ?? null,
    lastSavedValue: null,
    lastResult: null,
    error: null,
    generation: generationGuard.current(),
    savedGeneration: null,
    hasPending: false,
    lastSavedAt: null
  };
  let pending: PendingAutosave<TValue> | null = null;
  let inFlight: Promise<TResult> | null = null;
  let flushPromise: Promise<TResult | null> | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let closed = false;
  let closing = false;
  let closePromise: Promise<void> | null = null;

  const notify = () => {
    for (const listener of listeners) listener();
  };

  const update = (patch: Partial<AutosaveState<TValue, TResult>>) => {
    state = { ...state, ...patch };
    notify();
  };

  const clearTimer = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };

  const callSaved = (result: TResult, context: AutosaveEventContext<TValue>) => {
    if (closed) return;
    try {
      options.onSaved?.(result, context);
    } catch {
      // A consumer callback must not turn a successful transport response into
      // a failed autosave or break the queue's serialization guarantee.
    }
  };

  const callError = (error: BylineError, context: AutosaveEventContext<TValue>) => {
    if (closed) return;
    try {
      options.onError?.(error, context);
    } catch {
      // Keep user callbacks observational; queue state remains authoritative.
    }
  };

  const start = (operation: PendingAutosave<TValue>): Promise<TResult> => {
    if (!closed && generationGuard.isCurrent(operation.generation)) {
      update({ status: "saving", error: null, hasPending: true });
    }

    const request = Promise.resolve()
      .then(() => options.save(operation.value, { generation: operation.generation }))
      .then((result) => {
        const current = !closed && generationGuard.isCurrent(operation.generation);
        const isLatest = current && pending === null;

        if (current) {
          if (isLatest) {
            update({
              status: "saved",
              value: operation.value,
              lastSavedValue: operation.value,
              lastResult: result,
              error: null,
              savedGeneration: operation.generation,
              hasPending: false,
              lastSavedAt: now()
            });
          } else {
            update({ status: "queued", error: null, hasPending: true });
          }
        }

        callSaved(result, {
          value: operation.value,
          generation: operation.generation,
          isLatest
        });
        return result;
      })
      .catch((caught: unknown) => {
        const normalized = normalizeBylineError(caught);
        const current = !closed && generationGuard.isCurrent(operation.generation);
        const hasNewerPending = pending !== null && pending.generation !== operation.generation;

        if (current) {
          if (!hasNewerPending && pending === null) pending = operation;
          update({
            status: hasNewerPending ? "queued" : (isOfflineError(caught) ? "offline" : "error"),
            error: hasNewerPending ? null : normalized,
            hasPending: true
          });
          callError(normalized, {
            value: operation.value,
            generation: operation.generation,
            isLatest: !hasNewerPending
          });
        }

        throw normalized;
      })
      .finally(() => {
        if (inFlight === request) inFlight = null;
        if (!closed && pending === null && inFlight === null && state.hasPending) {
          // A superseded request may still finish after its generation was
          // invalidated. Clearing the transport-in-flight indicator is safe;
          // the stale response itself is still ignored above.
          update({ hasPending: false });
        }
        if (!closed && generationGuard.isCurrent(operation.generation) && pending !== null && state.status === "saving") {
          update({ status: "queued", hasPending: true });
        }
      });

    inFlight = request;
    return request;
  };

  const flushPending = async (): Promise<TResult | null> => {
    clearTimer();
    if (closed) return null;

    let result: TResult | null = null;
    const pendingGeneration = () => pending?.generation ?? null;
    if (inFlight) {
      try {
        result = await inFlight;
      } catch (error) {
        if (pending === null) throw error;
      }
    }

    while (!closed && pending !== null) {
      const operation = pending;
      pending = null;

      try {
        result = await start(operation);
      } catch (error) {
        // A newer edit superseded a failed request. Give that newest snapshot
        // one attempt now; a failure of the newest snapshot remains queued for
        // an explicit retry and cannot spin forever.
        const newerGeneration = pendingGeneration();
        if (newerGeneration !== null && newerGeneration !== operation.generation) continue;
        throw error;
      }
    }

    return result;
  };

  const flush = (): Promise<TResult | null> => {
    clearTimer();
    if (closed) return Promise.resolve(null);
    if (flushPromise) return flushPromise;

    const run = flushPending();
    const wrapped = run.finally(() => {
      if (flushPromise === wrapped) flushPromise = null;
    });
    flushPromise = wrapped;
    return wrapped;
  };

  return {
    getState: () => ({ ...state }),

    schedule(value) {
      if (closed || closing) return generationGuard.current();
      const nextGeneration = generationGuard.next();
      pending = { value, generation: nextGeneration };
      clearTimer();
      update({
        status: "queued",
        value,
        error: null,
        generation: nextGeneration,
        hasPending: true
      });

      timer = setTimeout(() => {
        timer = null;
        void flush().catch(() => undefined);
      }, debounceMs);
      return nextGeneration;
    },

    flush,
    retry: flush,

    supersede() {
      if (closed || closing) return;
      clearTimer();
      pending = null;
      const nextGeneration = generationGuard.invalidate();
      update({
        status: "idle",
        error: null,
        generation: nextGeneration,
        hasPending: inFlight !== null
      });
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    close() {
      if (closed) return Promise.resolve();
      if (closePromise) return closePromise;

      closing = true;
      clearTimer();
      const draining = flush();
      closePromise = draining
        .catch(() => undefined)
        .then(() => {
          closed = true;
          closing = false;
          clearTimer();
          pending = null;
          generationGuard.invalidate();
          listeners.clear();
        });
      return closePromise;
    }
  };
}

/** Retry policy; `retries` counts additional attempts after the first call. */
export type RetryOptions = {
  retries?: number;
  baseDelayMs?: number;
  backoffFactor?: number;
  maxDelayMs?: number;
  shouldRetry?: (error: BylineError, failedAttempt: number) => boolean;
  sleep?: (delayMs: number) => Promise<void>;
};

function positiveInteger(value: number | undefined, fallback: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.max(0, Math.floor(value));
}

/**
 * Run an operation and retry only normalized retryable failures by default.
 * Every rejection is a sanitized BylineError, including the final one.
 */
export async function retry<T>(
  operation: (attempt: number) => T | PromiseLike<T>,
  options: RetryOptions = {}
): Promise<T> {
  const retries = positiveInteger(options.retries, 0);
  const baseDelayMs = Math.max(0, options.baseDelayMs ?? 0);
  const backoffFactor = Math.max(1, options.backoffFactor ?? 2);
  const maxDelayMs = Math.max(0, options.maxDelayMs ?? Number.MAX_SAFE_INTEGER);
  const sleep = options.sleep ?? ((delayMs: number) => new Promise<void>((resolve) => setTimeout(resolve, delayMs)));

  for (let attempt = 1; ; attempt += 1) {
    try {
      return await operation(attempt);
    } catch (caught: unknown) {
      const error = normalizeBylineError(caught);
      if (attempt > retries || !(options.shouldRetry?.(error, attempt) ?? error.retryable)) throw error;

      const delay = Math.min(maxDelayMs, baseDelayMs * Math.pow(backoffFactor, attempt - 1));
      if (delay > 0) await sleep(delay);
    }
  }
}

/** Options for an optimistic state update with automatic rollback on failure. */
export type OptimisticMutationOptions<TState, TResult> = {
  read: () => TState;
  write: (state: TState) => void;
  optimistic: (state: TState) => TState;
  mutate: () => TResult | PromiseLike<TResult>;
  rollback?: (previous: TState, error: BylineError) => TState;
  retry?: RetryOptions;
};

/**
 * Apply an optimistic state change, commit through the caller's transport,
 * and restore the previous snapshot (or a caller-provided rollback) on the
 * final failure. The rejection is always a BylineError.
 */
export async function runOptimisticMutation<TState, TResult>(
  options: OptimisticMutationOptions<TState, TResult>
): Promise<TResult> {
  const previous = options.read();
  options.write(options.optimistic(previous));

  try {
    return await retry(() => options.mutate(), options.retry);
  } catch (caught: unknown) {
    const error = normalizeBylineError(caught);
    let rollback = previous;
    if (options.rollback) {
      try {
        rollback = options.rollback(previous, error);
      } catch {
        // A custom rollback policy cannot be allowed to replace the original,
        // safe mutation error or leave the caller without the known snapshot.
        rollback = previous;
      }
    }
    options.write(rollback);
    throw error;
  }
}

/** Lifecycle states for a one-shot reversible mutation. */
export type UndoableMutationStatus = "idle" | "executing" | "completed" | "undoing" | "undone" | "error";

/** Controls for a mutation whose inverse is a real caller-provided operation. */
export type UndoableMutation<TResult, TUndoResult = void> = {
  execute(): Promise<TResult>;
  undo(): Promise<TUndoResult>;
  canUndo(): boolean;
  getStatus(): UndoableMutationStatus;
};

/** Options for {@link createUndoableMutation}. */
export type UndoableMutationOptions<TResult, TUndoResult = void> = {
  perform: () => TResult | PromiseLike<TResult>;
  undo: () => TUndoResult | PromiseLike<TUndoResult>;
  retry?: RetryOptions;
  undoRetry?: RetryOptions;
};

function undoUnavailable(message: string): BylineError {
  return normalizeBylineError({
    code: "undo_unavailable",
    title: "Undo unavailable",
    message,
    retryable: false
  });
}

/**
 * Wrap a successful server mutation with a real inverse operation. Undo is
 * exposed only after success; if the inverse fails, it remains available for
 * another explicit attempt rather than pretending the action was reversed.
 */
export function createUndoableMutation<TResult, TUndoResult = void>(
  options: UndoableMutationOptions<TResult, TUndoResult>
): UndoableMutation<TResult, TUndoResult> {
  let status: UndoableMutationStatus = "idle";
  let executePromise: Promise<TResult> | null = null;
  let undoPromise: Promise<TUndoResult> | null = null;
  let completed = false;
  let undone = false;
  let completedResult: TResult;

  const execute = (): Promise<TResult> => {
    if (undone) return Promise.reject(undoUnavailable("This action has already been undone."));
    if (executePromise) return executePromise;
    if (completed) return Promise.resolve(completedResult);

    status = "executing";
    const request = retry(() => options.perform(), options.retry)
      .then((result) => {
        completed = true;
        completedResult = result;
        status = "completed";
        return result;
      })
      .catch((caught: unknown) => {
        status = "error";
        executePromise = null;
        throw normalizeBylineError(caught);
      });
    executePromise = request;
    return request;
  };

  const undo = (): Promise<TUndoResult> => {
    if (!completed || undone) {
      return Promise.reject(undoUnavailable("There is no completed action to undo."));
    }
    if (undoPromise) return undoPromise;

    status = "undoing";
    const request = retry(() => options.undo(), options.undoRetry)
      .then((result) => {
        undone = true;
        status = "undone";
        return result;
      })
      .catch((caught: unknown) => {
        status = "completed";
        undoPromise = null;
        throw normalizeBylineError(caught);
      });
    undoPromise = request;
    return request;
  };

  return {
    execute,
    undo,
    canUndo: () => completed && !undone && status !== "undoing",
    getStatus: () => status
  };
}
