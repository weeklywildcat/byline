import { describe, expect, it } from "vitest";

import { createEditorialRestClient } from "../src/editorial/editorial-rest";
import {
  WORKFLOW_FALLBACK_ERROR,
  createWorkflowMutationQueue,
  createWorkflowRequestTracker,
  describeWorkflowError,
  isWorkflowRevisionConflict,
  workflowDiscordState,
  workflowStages,
  workflowStatusLabel,
  workflowStoryPath,
  type WorkflowPayload,
  type WorkflowStatusDefinition
} from "../src/editorial-workflow-model";

const STATUSES: WorkflowStatusDefinition[] = [
  { id: "pitch", label: "Pitch", group: "main", selectable: true },
  { id: "assigned", label: "Assigned", group: "main", selectable: true },
  { id: "reporting", label: "Reporting", group: "main", selectable: true },
  { id: "writing", label: "Writing", group: "main", selectable: true },
  { id: "editing", label: "Editing", group: "main", selectable: true },
  { id: "ready", label: "Ready for Review", group: "main", selectable: true },
  { id: "on-hold", label: "On Hold", group: "sidelined", selectable: true },
  { id: "dropped", label: "Dropped", group: "sidelined", selectable: true },
  { id: "published", label: "Published", group: "derived", selectable: false }
];

function payload(status: string): WorkflowPayload {
  return {
    story: {
      postId: 1,
      status,
      storedStatus: status === "published" ? "writing" : status,
      isPublished: status === "published",
      postStatus: status === "published" ? "publish" : "draft",
      editorId: 0,
      deadline: "",
      visuals: ""
    },
    statuses: STATUSES,
    capabilities: { changeStatus: true, assign: true },
    writer: null,
    editors: [],
    discord: { threadId: "" }
  };
}

// A workflow API failure is not a reason to make the article unwritable, so the
// only requirement on an error is that a human can read it.
describe("workflow error reporting", () => {
  it("reads a WordPress REST error", () => {
    expect(describeWorkflowError({ message: "You are not allowed to change this story." })).toBe(
      "You are not allowed to change this story."
    );
  });

  it("reads a network failure", () => {
    expect(describeWorkflowError(new Error("Failed to fetch"))).toBe("Failed to fetch");
  });

  it("never surfaces a raw object, an empty message, or a null", () => {
    for (const value of [{}, { message: "" }, { message: "   " }, { code: "byline_editorial_forbidden" }, null, undefined, 42, []]) {
      const described = describeWorkflowError(value);

      expect(described).toBe(WORKFLOW_FALLBACK_ERROR);
      expect(described).not.toContain("object Object");
    }
  });

  it("uses the caller's translated fallback when there is nothing to show", () => {
    expect(describeWorkflowError({}, "Traduit")).toBe("Traduit");
  });
});

describe("workflow stages", () => {
  it("splits the main line from the sidelined states and never offers the derived one", () => {
    const { main, sidelined } = workflowStages(STATUSES, "writing");

    expect(main.map((stage) => stage.id)).toEqual(["pitch", "assigned", "reporting", "writing", "editing", "ready"]);
    expect(sidelined.map((stage) => stage.id)).toEqual(["on-hold", "dropped"]);
    expect([...main, ...sidelined].some((stage) => stage.id === "published")).toBe(false);
  });

  it("marks the current stage and everything already passed", () => {
    const { main } = workflowStages(STATUSES, "writing");

    expect(main.filter((stage) => stage.isDone).map((stage) => stage.id)).toEqual(["pitch", "assigned", "reporting"]);
    expect(main.filter((stage) => stage.isCurrent).map((stage) => stage.id)).toEqual(["writing"]);
    // Nothing ahead of the current stage is marked as progress.
    expect(main.slice(4).every((stage) => !stage.isDone && !stage.isCurrent)).toBe(true);
  });

  it("marks nothing as passed when the story is sidelined", () => {
    const { main, sidelined } = workflowStages(STATUSES, "on-hold");

    expect(main.every((stage) => !stage.isDone && !stage.isCurrent)).toBe(true);
    expect(sidelined.find((stage) => stage.id === "on-hold")?.isCurrent).toBe(true);
  });

  it("keeps every stage selectable when the stored status is unrecognised", () => {
    const { main } = workflowStages(STATUSES, "not-a-stage");

    expect(main).toHaveLength(6);
    expect(main.every((stage) => !stage.isCurrent)).toBe(true);
  });
});

describe("workflow status label", () => {
  it("reports the effective status, including the derived publication state", () => {
    expect(workflowStatusLabel(payload("writing"))).toBe("Writing");
    expect(workflowStatusLabel(payload("ready"))).toBe("Ready for Review");
    expect(workflowStatusLabel(payload("published"))).toBe("Published");
  });

  it("falls back to the identifier rather than rendering a blank control", () => {
    expect(workflowStatusLabel(payload("not-a-stage"))).toBe("not-a-stage");
    expect(workflowStatusLabel(null)).toBe("");
  });
});

describe("workflow transport", () => {
  // Workflow values are private newsroom information, so they travel over the
  // capability-protected Byline namespace rather than through public post meta.
  it("addresses the capability-protected Byline editorial endpoint", () => {
    expect(workflowStoryPath(42)).toBe("/byline/v1/editorial/stories/42");
    expect(workflowStoryPath(42)).not.toContain("/wp/v2/");
  });

  it("keeps the lightweight bootstrap route separate from lazy panel routes", async () => {
    const requests: Array<{ path: string; method?: string }> = [];
    const client = createEditorialRestClient(async (request) => {
      requests.push({ path: request.path, method: request.method });
      return {} as never;
    });

    await client.getWorkflowBootstrap(42);
    await client.listTasks(42);

    expect(requests).toEqual([
      { path: "/byline/v1/editorial/stories/42/bootstrap", method: undefined },
      { path: "/byline/v1/editorial/stories/42/tasks", method: undefined }
    ]);
  });
});

describe("workflow request ordering", () => {
  it("does not let a reload invalidate a save generation", () => {
    const tracker = createWorkflowRequestTracker();
    const read = tracker.beginRead();
    const write = tracker.beginWrite();
    const reload = tracker.beginRead();

    expect(tracker.isCurrentRead(reload)).toBe(true);
    expect(tracker.isCurrentWrite(write)).toBe(true);
    expect(tracker.isCurrentRead(read)).toBe(false);
  });

  it("lets a newer save supersede an older save response", () => {
    const tracker = createWorkflowRequestTracker();
    const first = tracker.beginWrite();
    const second = tracker.beginWrite();

    expect(tracker.isCurrentWrite(first)).toBe(false);
    expect(tracker.isCurrentWrite(second)).toBe(true);
  });
});


type QueuedRequest = {
  changes: Record<string, unknown>;
  resolve: (payload: WorkflowPayload) => void;
  reject: (error: unknown) => void;
};

/** A transport that lets a test hold each request open, one at a time. */
function controllableTransport() {
  const requests: QueuedRequest[] = [];
  let revision = 5;

  const send = (changes: Record<string, unknown>) =>
    new Promise<WorkflowPayload>((resolve, reject) => {
      requests.push({ changes, resolve, reject });
    });

  const respond = (index: number, nextRevision?: number) => {
    revision = nextRevision ?? revision + 1;
    const next = payload("writing");
    next.story.revision = revision;
    requests[index].resolve(next);
  };

  return { requests, send, respond };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

// The race this suite exists for: a Stage change and a Visual Notes autosave
// are the same editor's writes. They must never be sent with the same expected
// revision, because the second would then conflict with the first.
describe("workflow mutation queue", () => {
  it("never lets a Visual Notes autosave conflict with the editor's own Stage change", async () => {
    const transport = controllableTransport();
    const queue = createWorkflowMutationQueue<WorkflowPayload>({
      send: transport.send,
      readRevision: (next) => next.story.revision ?? null,
      initialRevision: 5
    });

    const stage = queue.enqueue({ status: "editing" });
    await settle();
    expect(transport.requests).toHaveLength(1);
    expect(transport.requests[0].changes).toEqual({ status: "editing", expectedRevision: 5 });

    // The autosave fires while the Stage request is still in flight.
    const notes = queue.enqueue({ visuals: "Need a crowd photo" });
    await settle();
    expect(transport.requests).toHaveLength(1);

    transport.respond(0, 6);
    await expect(stage).resolves.toMatchObject({ ok: true });
    await settle();

    expect(transport.requests).toHaveLength(2);
    // The queued edit is sent with the revision the previous response returned,
    // never with the stale revision the editor's own write already consumed.
    expect(transport.requests[1].changes).toEqual({ visuals: "Need a crowd photo", expectedRevision: 6 });

    transport.respond(1, 7);
    await expect(notes).resolves.toMatchObject({ ok: true });
    expect(queue.getRevision()).toBe(7);
  });

  it("sends one request at a time and coalesces the edits queued behind it", async () => {
    const transport = controllableTransport();
    const queue = createWorkflowMutationQueue<WorkflowPayload>({
      send: transport.send,
      readRevision: (next) => next.story.revision ?? null,
      initialRevision: 5
    });

    void queue.enqueue({ status: "editing" });
    await settle();
    void queue.enqueue({ visuals: "first" });
    void queue.enqueue({ deadline: "2026-09-01" });
    void queue.enqueue({ visuals: "second" });
    await settle();
    expect(transport.requests).toHaveLength(1);

    transport.respond(0, 6);
    await settle();

    expect(transport.requests).toHaveLength(2);
    // Coalesced into one follow-up request; the newest value of a repeated
    // field wins, so no newer local edit is discarded by an older one.
    expect(transport.requests[1].changes).toEqual({
      visuals: "second",
      deadline: "2026-09-01",
      expectedRevision: 6
    });
  });

  it("marks the response superseded when a newer edit is already queued", async () => {
    const transport = controllableTransport();
    const queue = createWorkflowMutationQueue<WorkflowPayload>({
      send: transport.send,
      readRevision: (next) => next.story.revision ?? null,
      initialRevision: 5
    });

    const first = queue.enqueue({ status: "editing" });
    await settle();
    void queue.enqueue({ status: "ready" });
    transport.respond(0, 6);

    // The caller can refuse to apply a payload that a newer local edit already
    // replaced, instead of flashing back to the superseded value.
    await expect(first).resolves.toMatchObject({ ok: true, superseded: true });
  });

  it("keeps a retryable failure retryable and leaves the queue usable", async () => {
    const transport = controllableTransport();
    const errors: string[] = [];
    const queue = createWorkflowMutationQueue<WorkflowPayload>({
      send: transport.send,
      readRevision: (next) => next.story.revision ?? null,
      initialRevision: 5,
      onError: (error) => errors.push(error.message)
    });

    const failing = queue.enqueue({ visuals: "a note" });
    await settle();
    transport.requests[0].reject(new TypeError("Failed to fetch"));
    const outcome = await failing;

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.conflict).toBe(false);
      expect(outcome.error.retryable).toBe(true);
    }
    expect(errors).toHaveLength(1);
    // A failed request never advances the revision, so a retry of the same
    // value is still sent against the revision the client knows about.
    expect(queue.getRevision()).toBe(5);

    const retried = queue.enqueue({ visuals: "a note" });
    await settle();
    expect(transport.requests[1].changes).toEqual({ visuals: "a note", expectedRevision: 5 });
    transport.respond(1, 6);
    await expect(retried).resolves.toMatchObject({ ok: true });
  });

  it("reports a real cross-user conflict and stops sending until the client reloads", async () => {
    const transport = controllableTransport();
    const queue = createWorkflowMutationQueue<WorkflowPayload>({
      send: transport.send,
      readRevision: (next) => next.story.revision ?? null,
      initialRevision: 5
    });

    const conflicting = queue.enqueue({ status: "ready" });
    await settle();
    transport.requests[0].reject({
      code: "byline_editorial_conflict",
      message: "This story changed while you were editing it.",
      data: { status: 409, currentRevision: 9 }
    });

    const outcome = await conflicting;
    expect(outcome).toMatchObject({ ok: false, conflict: true });
    expect(queue.hasConflict()).toBe(true);

    // A further edit is refused locally rather than sent with a revision the
    // server has already rejected.
    const blocked = queue.enqueue({ visuals: "still typing" });
    await settle();
    expect(transport.requests).toHaveLength(1);
    expect(await blocked).toMatchObject({ ok: false, conflict: true });

    // Reloading the story reconciles the queue at the server's revision.
    queue.reconcile(9);
    expect(queue.hasConflict()).toBe(false);
    const afterReload = queue.enqueue({ visuals: "still typing" });
    await settle();
    expect(transport.requests[1].changes).toEqual({ visuals: "still typing", expectedRevision: 9 });
    transport.respond(1, 10);
    await expect(afterReload).resolves.toMatchObject({ ok: true });
  });

  it("stops reporting to a detached owner without abandoning in-flight work", async () => {
    const transport = controllableTransport();
    const applied: number[] = [];
    const queue = createWorkflowMutationQueue<WorkflowPayload>({
      send: transport.send,
      readRevision: (next) => next.story.revision ?? null,
      initialRevision: 5,
      onSuccess: (next) => applied.push(next.story.revision ?? 0)
    });

    const pending = queue.enqueue({ visuals: "saved on the way out" });
    await settle();
    // Switching posts or closing the sidebar must not let this response land on
    // another story's state — but it must still reach the server.
    queue.detach();
    transport.respond(0, 6);

    await expect(pending).resolves.toMatchObject({ ok: true });
    expect(applied).toEqual([]);
  });

  it("omits expectedRevision until a revision is known, for legacy callers", async () => {
    const transport = controllableTransport();
    const queue = createWorkflowMutationQueue<WorkflowPayload>({
      send: transport.send,
      readRevision: (next) => next.story.revision ?? null
    });

    void queue.enqueue({ status: "editing" });
    await settle();
    expect(transport.requests[0].changes).toEqual({ status: "editing" });
  });

  it("lets a reload tell that a write landed while it was open", async () => {
    const transport = controllableTransport();
    const queue = createWorkflowMutationQueue<WorkflowPayload>({
      send: transport.send,
      readRevision: (next) => next.story.revision ?? null,
      initialRevision: 5
    });

    // A bootstrap read starts here, so the sidebar records what it knew then.
    const settledWritesAtReadStart = queue.settledCount();
    void queue.enqueue({ status: "editing" });
    await settle();
    transport.respond(0, 6);
    await settle();

    // The read's response now describes revision 5, which is already stale. The
    // caller must be able to see that and refuse to reset the queue's revision,
    // because doing so would turn the editor's own next edit into a conflict.
    expect(queue.settledCount()).not.toBe(settledWritesAtReadStart);
    expect(queue.getRevision()).toBe(6);
  });

  it("recognises a revision conflict from either the code or the HTTP status", () => {
    expect(isWorkflowRevisionConflict({ code: "byline_editorial_conflict" })).toBe(true);
    expect(isWorkflowRevisionConflict({ data: { status: 409 } })).toBe(true);
    expect(isWorkflowRevisionConflict({ code: "byline_editorial_forbidden", data: { status: 403 } })).toBe(false);
    expect(isWorkflowRevisionConflict(new TypeError("Failed to fetch"))).toBe(false);
  });
});

// The Discussion panel has to tell three different situations apart, and the
// bootstrap response is the only thing that can distinguish them.
describe("workflow Discord context", () => {
  it("reports an unconfigured integration", () => {
    expect(workflowDiscordState({ configured: false, threadId: "", threadUrl: "" })).toBe("not-configured");
    expect(workflowDiscordState(undefined)).toBe("not-configured");
  });

  it("reports a configured integration with no thread for this story", () => {
    expect(workflowDiscordState({ configured: true, threadId: "", threadUrl: "" })).toBe("configured-unlinked");
  });

  it("reports a linked thread", () => {
    expect(workflowDiscordState({ configured: true, threadId: "123", threadUrl: "https://discord.com/channels/1/123" })).toBe("linked");
    // A pre-capability server response still resolves to the linked state.
    expect(workflowDiscordState({ threadId: "123" })).toBe("linked");
  });
});
