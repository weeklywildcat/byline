import { describe, expect, it, vi } from "vitest";
import {
  createStudioAutosaveController,
  type StudioAutosaveRecord
} from "../src/studio-autosave";

function record(document: string, baseRevisionId = 0): StudioAutosaveRecord<string> {
  return { document, baseRevisionId, modifiedAt: `${document}-saved` };
}

function nextTurn(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("Studio autosave lifecycle", () => {
  it("flushes an edit immediately when navigation happens before the debounce", async () => {
    const save = vi.fn(async (document: string, baseRevisionId: number) => record(document, baseRevisionId));
    const controller = createStudioAutosaveController({ baseRevisionId: 4, save });

    controller.schedule("latest edit");
    await controller.flush();

    expect(save).toHaveBeenCalledWith("latest edit", 4);
    expect(controller.getState()).toMatchObject({ status: "saved", hasDraft: true });
  });

  it("starts a pending write during component cleanup and never leaves a delayed timer", async () => {
    const save = vi.fn(async (document: string, baseRevisionId: number) => record(document, baseRevisionId));
    const controller = createStudioAutosaveController({ baseRevisionId: 1, save, debounceMs: 900 });

    controller.schedule("edit before unmount");
    controller.close();
    await Promise.resolve();

    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith("edit before unmount", 1);
  });

  it("drains a newer edit queued while an older autosave is in flight", async () => {
    const pendingRequests: Array<{ document: string; resolve: (value: StudioAutosaveRecord<string>) => void }> = [];
    const save = vi.fn((document: string) => new Promise<StudioAutosaveRecord<string>>((resolve) => {
      pendingRequests.push({ document, resolve });
    }));
    const controller = createStudioAutosaveController({ baseRevisionId: 1, save });

    controller.schedule("first");
    const firstFlush = controller.flush();
    controller.schedule("latest");
    controller.close();
    expect(pendingRequests.map((request) => request.document)).toEqual(["first"]);

    pendingRequests[0].resolve(record("first", 1));
    await nextTurn();
    expect(pendingRequests.map((request) => request.document)).toEqual(["first", "latest"]);

    pendingRequests[1].resolve(record("latest", 1));
    await firstFlush;
    await Promise.resolve();
    await Promise.resolve();
    expect(save).toHaveBeenCalledTimes(2);
  });

  it("can flush before publish and then clear the draft state", async () => {
    const save = vi.fn(async (document: string, baseRevisionId: number) => record(document, baseRevisionId));
    const controller = createStudioAutosaveController({ baseRevisionId: 7, save });

    controller.schedule("publish me");
    await controller.flush();
    controller.markPublished(8);

    expect(controller.getState()).toMatchObject({ status: "clean", hasDraft: false });
    expect(controller.getBaseRevisionId()).toBe(8);
  });

  it("supersedes a pending reset without sending the discarded document", async () => {
    const save = vi.fn(async (document: string, baseRevisionId: number) => record(document, baseRevisionId));
    const controller = createStudioAutosaveController({ baseRevisionId: 3, save });

    controller.schedule("discard me");
    await controller.discard();

    expect(save).not.toHaveBeenCalled();
    expect(controller.getState()).toMatchObject({ status: "clean", hasDraft: false });
  });

  it("waits for an already-started reset write before clearing the server draft", async () => {
    const resolveRequests: Array<() => void> = [];
    const save = vi.fn((document: string) => new Promise<StudioAutosaveRecord<string>>((resolve) => {
      resolveRequests.push(() => resolve(record(document, 3)));
    }));
    const controller = createStudioAutosaveController({ baseRevisionId: 3, save });

    controller.schedule("draft that reached the server");
    const flush = controller.flush();
    const discard = controller.discard();
    expect(save).toHaveBeenCalledTimes(1);

    resolveRequests[0]?.();
    await flush;
    await discard;

    expect(controller.getState()).toMatchObject({ status: "clean", hasDraft: false });
  });

  it("marks the first successful autosave as a real draft immediately", async () => {
    const save = vi.fn(async (document: string, baseRevisionId: number) => record(document, baseRevisionId));
    const controller = createStudioAutosaveController({ baseRevisionId: 0, save });

    expect(controller.getState().hasDraft).toBe(false);
    controller.schedule("first draft");
    await controller.flush();

    expect(controller.getState().hasDraft).toBe(true);
  });

  it("serializes edits and tells consumers that an older response is stale", async () => {
    const pendingRequests: Array<{ document: string; resolve: (value: StudioAutosaveRecord<string>) => void }> = [];
    const saved: Array<{ document: string; isLatest: boolean }> = [];
    const save = vi.fn((document: string) => new Promise<StudioAutosaveRecord<string>>((resolve) => {
      pendingRequests.push({ document, resolve });
    }));
    const controller = createStudioAutosaveController({
      baseRevisionId: 2,
      save,
      onSaved: (savedRecord, isLatestLocalEdit) => saved.push({ document: savedRecord.document, isLatest: isLatestLocalEdit })
    });

    controller.schedule("old edit");
    const firstFlush = controller.flush();
    controller.schedule("new edit");
    const secondFlush = controller.flush();

    expect(pendingRequests.map((request) => request.document)).toEqual(["old edit"]);
    pendingRequests[0].resolve(record("old edit", 2));
    await nextTurn();

    expect(pendingRequests.map((request) => request.document)).toEqual(["old edit", "new edit"]);
    pendingRequests[1].resolve(record("new edit", 2));
    await firstFlush;
    await secondFlush;

    expect(saved).toEqual([
      { document: "old edit", isLatest: false },
      { document: "new edit", isLatest: true }
    ]);
    expect(controller.getState()).toMatchObject({ status: "saved", hasDraft: true });
  });
});
