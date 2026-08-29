import { describe, expect, it, vi } from "vitest";

import {
  createAutosaveQueue,
  createOnlineState,
  createSerialMutationQueue,
  createUndoableMutation,
  isOfflineError,
  normalizeBylineError,
  retry,
  runOptimisticMutation,
  safeUserFacingError
} from "../src/index";

function nextTurn(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("Byline error normalization", () => {
  it("keeps useful REST fields while sanitizing markup", () => {
    expect(normalizeBylineError({
      code: "rest_forbidden",
      message: "<strong>You cannot edit this story.</strong>",
      data: { status: 403 }
    })).toEqual({
      code: "rest_forbidden",
      title: "Something went wrong",
      message: "You cannot edit this story.",
      retryable: false
    });
  });

  it("falls back instead of exposing raw objects or secrets", () => {
    expect(safeUserFacingError({ data: { debug: { sql: "SELECT *" }, token: "abc" } }, "Try again later.")).toBe("Try again later.");
    expect(safeUserFacingError({ message: "password=super-secret" })).toBe("Something went wrong. Please try again.");
    expect(safeUserFacingError({})).not.toContain("object Object");
  });

  it("classifies network and server failures as retryable", () => {
    expect(normalizeBylineError(new TypeError("Failed to fetch")).retryable).toBe(true);
    expect(normalizeBylineError({ message: "Service unavailable", data: { status: 503 } }).retryable).toBe(true);
    expect(normalizeBylineError({ message: "No permission", data: { status: 403 } }).retryable).toBe(false);
    expect(isOfflineError(new TypeError("network failed"))).toBe(true);
  });
});

describe("serial mutation queue", () => {
  it("runs one mutation at a time and continues after a rejection", async () => {
    const requests: string[] = [];
    const queue = createSerialMutationQueue();
    let releaseFirst: (() => void) | undefined;

    const first = queue.enqueue(() => new Promise<string>((resolve, reject) => {
      requests.push("first");
      releaseFirst = () => reject(new Error("first failed"));
      void resolve;
    }));
    const second = queue.enqueue(async () => {
      requests.push("second");
      return "second result";
    });

    await nextTurn();
    expect(requests).toEqual(["first"]);
    releaseFirst?.();
    await expect(first).rejects.toThrow("first failed");
    await expect(second).resolves.toBe("second result");
    await expect(queue.drain()).resolves.toBeUndefined();
    expect(requests).toEqual(["first", "second"]);
  });
});

describe("autosave queue", () => {
  it("serializes writes and only marks the latest generation as saved", async () => {
    const pending: Array<{ value: string; resolve: (result: string) => void }> = [];
    const saved: Array<{ value: string; isLatest: boolean }> = [];
    const save = vi.fn((value: string) => new Promise<string>((resolve) => pending.push({ value, resolve })));
    const queue = createAutosaveQueue({ save, debounceMs: 0, onSaved: (result, context) => {
      saved.push({ value: result, isLatest: context.isLatest });
    }});

    queue.schedule("old");
    const firstFlush = queue.flush();
    queue.schedule("latest");
    const secondFlush = queue.flush();

    await nextTurn();
    expect(save).toHaveBeenCalledTimes(1);
    expect(pending.map((entry) => entry.value)).toEqual(["old"]);

    pending[0]?.resolve("old");
    await nextTurn();
    expect(pending.map((entry) => entry.value)).toEqual(["old", "latest"]);
    pending[1]?.resolve("latest");

    await expect(firstFlush).resolves.toBe("latest");
    await expect(secondFlush).resolves.toBe("latest");
    expect(saved).toEqual([
      { value: "old", isLatest: false },
      { value: "latest", isLatest: true }
    ]);
    expect(queue.getState()).toMatchObject({
      status: "saved",
      value: "latest",
      lastSavedValue: "latest",
      savedGeneration: 2,
      hasPending: false
    });
  });

  it("ignores a response after supersede and retains a failed latest value for retry", async () => {
    let resolveRequest: ((value: string) => void) | undefined;
    const save = vi.fn(() => new Promise<string>((resolve) => { resolveRequest = resolve; }));
    const queue = createAutosaveQueue({ save, debounceMs: 0 });

    queue.schedule("discarded");
    const request = queue.flush();
    queue.supersede();
    await nextTurn();
    resolveRequest?.("stale response");
    await expect(request).resolves.toBe("stale response");
    expect(queue.getState()).toMatchObject({ status: "idle", hasPending: false, lastSavedValue: null });

    let attempts = 0;
    const retryableSave = vi.fn(async (value: string) => {
      attempts += 1;
      if (attempts === 1) throw new TypeError("Failed to fetch");
      return value;
    });
    const retryQueue = createAutosaveQueue({ save: retryableSave, debounceMs: 0 });
    retryQueue.schedule("keep me");
    await expect(retryQueue.flush()).rejects.toMatchObject({ retryable: true });
    expect(retryQueue.getState()).toMatchObject({ status: "offline", value: "keep me", hasPending: true });
    await expect(retryQueue.retry()).resolves.toBe("keep me");
    expect(retryableSave).toHaveBeenCalledTimes(2);
  });

  it("drains a queued edit before closing", async () => {
    const save = vi.fn(async (value: string) => value);
    const queue = createAutosaveQueue({ save, debounceMs: 900 });

    queue.schedule("before close");
    await queue.close();

    expect(save).toHaveBeenCalledWith("before close", { generation: 1 });
    expect(queue.getState()).toMatchObject({ status: "saved", value: "before close", hasPending: false });
  });
});

describe("online state and retry", () => {
  it("publishes offline and online transitions", () => {
    const target = new EventTarget();
    const controller = createOnlineState({ initial: "online", eventTarget: target });
    const changes: string[] = [];
    controller.subscribe((status) => changes.push(status));
    const stop = controller.start();

    target.dispatchEvent(new Event("offline"));
    target.dispatchEvent(new Event("online"));
    stop();
    target.dispatchEvent(new Event("offline"));

    expect(changes).toEqual(["offline", "online"]);
    expect(controller.getState()).toBe("online");
  });

  it("retries retryable failures and gives up on non-retryable failures", async () => {
    let attempts = 0;
    const value = await retry(async (attempt) => {
      attempts = attempt;
      if (attempt < 3) throw new TypeError("network down");
      return "ok";
    }, { retries: 2 });
    expect(value).toBe("ok");
    expect(attempts).toBe(3);

    const forbidden = vi.fn(async () => {
      throw { message: "No access", data: { status: 403 } };
    });
    await expect(retry(forbidden, { retries: 3 })).rejects.toMatchObject({ retryable: false, message: "No access" });
    expect(forbidden).toHaveBeenCalledTimes(1);
  });
});

describe("optimistic rollback and undo", () => {
  it("restores the previous state after the final mutation failure", async () => {
    let state = { completed: false };
    await expect(runOptimisticMutation({
      read: () => state,
      write: (next) => { state = next; },
      optimistic: (previous) => ({ ...previous, completed: true }),
      mutate: async () => { throw { message: "Save failed", data: { status: 500 } }; }
    })).rejects.toMatchObject({ message: "Save failed", retryable: true });
    expect(state).toEqual({ completed: false });
  });

  it("exposes undo only after a successful, reversible mutation", async () => {
    const perform = vi.fn(async () => "created");
    const inverse = vi.fn(async () => undefined);
    const mutation = createUndoableMutation({ perform, undo: inverse });

    expect(mutation.canUndo()).toBe(false);
    await expect(mutation.undo()).rejects.toMatchObject({ code: "undo_unavailable" });
    await expect(mutation.execute()).resolves.toBe("created");
    expect(mutation.canUndo()).toBe(true);
    await expect(mutation.undo()).resolves.toBeUndefined();
    expect(inverse).toHaveBeenCalledTimes(1);
    expect(mutation.getStatus()).toBe("undone");
    expect(mutation.canUndo()).toBe(false);
    await expect(mutation.undo()).rejects.toMatchObject({ code: "undo_unavailable" });
  });
});
