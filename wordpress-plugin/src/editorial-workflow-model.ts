/**
 * The presentation-free parts of the editorial workflow sidebar.
 *
 * Kept out of the React entry so they can be unit-tested without a WordPress
 * editor: how a failure is turned into something an editor can read, how the
 * status vocabulary becomes an ordered, progress-aware list, and how every
 * protected workflow write is serialized behind one revision-aware queue.
 */
import {
  createSerialMutationQueue,
  normalizeBylineError,
  type BylineError,
  type NormalizeBylineErrorOptions
} from "@byline/admin-runtime";

export type WorkflowStatusDefinition = {
  id: string;
  label: string;
  group: "main" | "sidelined" | "derived";
  selectable: boolean;
};

export type WorkflowStory = {
  postId: number;
  /** Private optimistic-concurrency revision from the protected editorial API. */
  revision?: number;
  status: string;
  storedStatus: string;
  isPublished: boolean;
  postStatus: string;
  editorId: number;
  deadline: string;
  visuals: string;
};

export type WorkflowPayload = {
  story: WorkflowStory;
  statuses: WorkflowStatusDefinition[];
  capabilities: { changeStatus: boolean; assign: boolean };
  writer: { id: number; name: string } | null;
  editors: Array<{ id: number; name: string }>;
  discord: WorkflowDiscordContext;
};

/**
 * The safe Discord capability projection. `configured` is what lets the sidebar
 * tell "Discord is not set up" apart from "set up, but this story has no
 * thread yet". No credential, webhook, or guild secret is ever included.
 */
export type WorkflowDiscordContext = {
  configured?: boolean;
  threadId: string;
  threadUrl?: string;
  canCreateThread?: boolean;
};

export type WorkflowDiscordState = "not-configured" | "configured-unlinked" | "linked";

/** Resolve the three states the Discussion panel has to represent. */
export function workflowDiscordState(value: unknown): WorkflowDiscordState {
  const discord = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const threadId = typeof discord.threadId === "string" ? discord.threadId.trim() : "";
  const threadUrl = typeof discord.threadUrl === "string" ? discord.threadUrl.trim() : "";
  if (threadId !== "" || threadUrl !== "") return "linked";
  // `available` is the pre-0.2.14 spelling; treat it as configured so an older
  // server response cannot hide a connected newsroom's Discussion panel.
  return discord.configured === true || discord.available === true ? "configured-unlinked" : "not-configured";
}

export type WorkflowChanges = Partial<Pick<WorkflowStory, "status" | "editorId" | "deadline" | "visuals">> & {
  expectedRevision?: number;
};

export const WORKFLOW_FALLBACK_ERROR = "Something went wrong. Please try again.";

/**
 * WordPress REST errors arrive as `{ message }`, network failures as an `Error`,
 * and a proxy in front of the site can return neither. An editor must never be
 * shown `[object Object]`, a raw JSON body, or a PHP notice, so everything is
 * funnelled through here.
 */
export function describeWorkflowError(error: unknown, fallback: string = WORKFLOW_FALLBACK_ERROR): string {
  if (typeof error === "string" && error.trim()) return error.trim();

  return normalizeBylineError(error, { message: fallback }).message;
}

export type WorkflowStage = WorkflowStatusDefinition & {
  isCurrent: boolean;
  // True for main-line stages the story has already moved past. Used only as a
  // supplemental text style; the label is always the accessible name.
  isDone: boolean;
};

/**
 * Splits the vocabulary into the ordered main line and the sidelined states, and
 * marks progress. The derived publication state is never a stage: it follows
 * WordPress and is reported separately.
 */
export function workflowStages(statuses: WorkflowStatusDefinition[], current: string) {
  const main = statuses.filter((status) => status.group === "main");
  const sidelined = statuses.filter((status) => status.group === "sidelined");
  const currentIndex = main.findIndex((status) => status.id === current);

  return {
    main: main.map((status, index) => ({
      ...status,
      isCurrent: status.id === current,
      isDone: currentIndex >= 0 && index < currentIndex
    })),
    sidelined: sidelined.map((status) => ({
      ...status,
      isCurrent: status.id === current,
      isDone: false
    }))
  };
}

export function workflowStatusLabel(payload: WorkflowPayload | null): string {
  if (!payload) return "";

  return payload.statuses.find((status) => status.id === payload.story.status)?.label ?? payload.story.status;
}

export function workflowStoryPath(postId: number): string {
  return `/byline/v1/editorial/stories/${postId}`;
}

/**
 * Read and write requests share a resource but not a generation. This tiny
 * tracker makes that distinction explicit and keeps it unit-testable without
 * mounting the WordPress editor.
 */
export function createWorkflowRequestTracker() {
  let readGeneration = 0;
  let writeGeneration = 0;

  return {
    beginRead: () => ++readGeneration,
    isCurrentRead: (generation: number) => generation === readGeneration,
    beginWrite: () => ++writeGeneration,
    isCurrentWrite: (generation: number) => generation === writeGeneration,
    writeVersion: () => writeGeneration
  };
}

export const WORKFLOW_CONFLICT_MESSAGE =
  "This story changed somewhere else. Reload the workflow before saving again.";

/**
 * One serialized, revision-aware mutation queue per story editor instance.
 *
 * Every protected workflow write — stage, editor, deadline, planned
 * publication, visual notes — goes through here, so a story's own controls can
 * never race each other into a self-conflict. While a request is in flight,
 * later edits are coalesced into a single follow-up request that is sent with
 * the revision returned by the previous response.
 *
 * The queue deliberately does not own field state. A failed request leaves the
 * editor's typed value where it is; the caller decides how to retry.
 */
export type WorkflowMutationChanges = Record<string, unknown>;

export type WorkflowMutationSuccess<TPayload> = {
  ok: true;
  payload: TPayload;
  /** True when a newer local edit was already queued behind this response. */
  superseded: boolean;
};

export type WorkflowMutationFailure = {
  ok: false;
  error: BylineError;
  /** True for a real cross-user revision conflict that needs a reload. */
  conflict: boolean;
};

export type WorkflowMutationOutcome<TPayload> = WorkflowMutationSuccess<TPayload> | WorkflowMutationFailure;

export type WorkflowMutationQueueOptions<TPayload> = {
  /** Sends one merged mutation. Never invoked concurrently. */
  send: (changes: WorkflowMutationChanges) => Promise<TPayload>;
  /** Reads the authoritative revision out of a successful response. */
  readRevision?: (payload: TPayload) => number | null;
  initialRevision?: number | null;
  onSuccess?: (payload: TPayload, context: { superseded: boolean }) => void;
  onError?: (error: BylineError, context: { conflict: boolean }) => void;
  /** Called whenever the number of unfinished mutations changes. */
  onPendingChange?: (pendingCount: number) => void;
  /** Translated fallbacks for the safe error boundary. */
  errorOptions?: NormalizeBylineErrorOptions;
  /** Translated copy for a real cross-user revision conflict. */
  conflictMessage?: string;
};

export type WorkflowMutationQueue<TPayload> = {
  enqueue(changes: WorkflowMutationChanges): Promise<WorkflowMutationOutcome<TPayload>>;
  /** Adopt a revision observed outside the queue, e.g. from a fresh read. */
  observeRevision(revision: number | null): void;
  getRevision(): number | null;
  /** Clear a conflict after the client reloaded the story. */
  reconcile(revision: number | null): void;
  hasConflict(): boolean;
  pendingCount(): number;
  /**
   * How many mutation batches have finished. A read that started before a
   * write finished is stale by definition, and must not be allowed to reset
   * the revision the next mutation builds on.
   */
  settledCount(): number;
  /** Stop reporting to the owner without abandoning in-flight work. */
  detach(): void;
  drain(): Promise<void>;
};

const WORKFLOW_CONFLICT_CODES = ["byline_editorial_conflict", "byline_editorial_invalid_revision"];

/** A revision conflict is the one failure a retry can never fix on its own. */
export function isWorkflowRevisionConflict(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; data?: { status?: unknown; code?: unknown } };
  if (typeof candidate.code === "string" && WORKFLOW_CONFLICT_CODES.includes(candidate.code)) return true;
  const data = candidate.data;
  if (data && typeof data === "object") {
    if (typeof data.code === "string" && WORKFLOW_CONFLICT_CODES.includes(data.code)) return true;
    if (data.status === 409) return true;
  }
  return false;
}

export function createWorkflowMutationQueue<TPayload>(
  options: WorkflowMutationQueueOptions<TPayload>
): WorkflowMutationQueue<TPayload> {
  const transport = createSerialMutationQueue();
  const readRevision = options.readRevision ?? (() => null);
  let revision: number | null = options.initialRevision ?? null;
  let pending: WorkflowMutationChanges | null = null;
  let waiters: Array<(outcome: WorkflowMutationOutcome<TPayload>) => void> = [];
  let scheduled = false;
  let conflicted = false;
  let detached = false;
  let unfinished = 0;
  let settled = 0;

  const reportPending = () => {
    if (detached) return;
    options.onPendingChange?.(unfinished);
  };

  const settle = (
    batch: Array<(outcome: WorkflowMutationOutcome<TPayload>) => void>,
    outcome: WorkflowMutationOutcome<TPayload>
  ) => {
    unfinished = Math.max(0, unfinished - batch.length);
    settled += 1;
    for (const waiter of batch) waiter(outcome);
    reportPending();
  };

  const failure = (error: unknown, conflict: boolean): WorkflowMutationFailure => ({
    ok: false,
    error: normalizeBylineError(error, options.errorOptions),
    conflict
  });

  const run = async () => {
    const changes = pending;
    const batch = waiters;
    pending = null;
    waiters = [];
    scheduled = false;

    if (!changes || batch.length === 0) return;

    if (conflicted) {
      settle(batch, failure({
        code: "byline_editorial_conflict",
        message: options.conflictMessage ?? WORKFLOW_CONFLICT_MESSAGE,
        data: { status: 409 }
      }, true));
      return;
    }

    const request: WorkflowMutationChanges = revision === null
      ? { ...changes }
      : { ...changes, expectedRevision: revision };

    try {
      const payload = await options.send(request);
      const nextRevision = readRevision(payload);
      if (typeof nextRevision === "number" && Number.isFinite(nextRevision)) revision = nextRevision;
      const superseded = pending !== null;
      settle(batch, { ok: true, payload, superseded });
      if (!detached) options.onSuccess?.(payload, { superseded });
    } catch (caught: unknown) {
      const conflict = isWorkflowRevisionConflict(caught);
      if (conflict) conflicted = true;
      const outcome = failure(caught, conflict);
      settle(batch, outcome);
      if (!detached) options.onError?.(outcome.error, { conflict });
    }
  };

  return {
    enqueue(changes) {
      pending = { ...(pending ?? {}), ...changes };
      unfinished += 1;
      reportPending();
      const settled = new Promise<WorkflowMutationOutcome<TPayload>>((resolve) => {
        waiters.push(resolve);
      });
      if (!scheduled) {
        scheduled = true;
        void transport.enqueue(run);
      }
      return settled;
    },

    observeRevision(next) {
      if (typeof next === "number" && Number.isFinite(next)) revision = next;
    },

    getRevision: () => revision,

    reconcile(next) {
      conflicted = false;
      if (typeof next === "number" && Number.isFinite(next)) revision = next;
    },

    hasConflict: () => conflicted,
    pendingCount: () => unfinished,
    settledCount: () => settled,

    detach() {
      detached = true;
    },

    drain: () => transport.drain()
  };
}
