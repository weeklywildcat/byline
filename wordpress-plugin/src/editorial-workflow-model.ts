/**
 * The presentation-free parts of the editorial workflow sidebar.
 *
 * Kept out of the React entry so they can be unit-tested without a WordPress
 * editor: how a failure is turned into something an editor can read, and how the
 * status vocabulary becomes an ordered, progress-aware list.
 */

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
  discord: { threadId: string; threadUrl?: string };
};

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

  if (error && typeof error === "object") {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message.trim();
  }

  return fallback;
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

/**
 * Serializes debounced workflow-field writes. The caller owns the debounce;
 * this queue makes a second value wait for the first request so an older
 * network response cannot win at the server either. Failures are swallowed in
 * the queue tail so a later edit can still be attempted.
 */
export function createSerializedWorkflowSaveQueue<T>(save: (value: T) => Promise<boolean>) {
  let tail: Promise<boolean> = Promise.resolve(true);

  return {
    enqueue(value: T): Promise<boolean> {
      tail = tail.then(() => save(value)).catch(() => false);
      return tail;
    },
    drain(): Promise<boolean> {
      return tail;
    }
  };
}
