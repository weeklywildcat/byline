import { describe, expect, it } from "vitest";
import { enqueue, memoryOutbox, newItem, outboxLabel, processOutbox, QuotaError, retry, SendError, type OutboxItem, type OutboxResult, type OutboxStore, type Sender } from "../src/ui/field/outbox";

const blob = () => new Blob(["x"], { type: "image/jpeg" });

function recorder(behaviour: (item: OutboxItem, call: number) => OutboxResult | SendError) {
  const calls: Array<{ key: string; photoId: number | null; delivery?: string }> = [];
  const send: Sender = async (item, { photoId }) => {
    calls.push({ key: item.key, photoId, delivery: item.delivery });
    const result = behaviour(item, calls.length);
    if (result instanceof SendError) throw result;
    return result;
  };
  return { calls, send };
}

describe("Field outbox", () => {
  it("sends nothing while offline and says so", async () => {
    const store = memoryOutbox();
    const memory = new Map<string, OutboxItem>();
    const note = newItem({ key: "note-0001", storyId: 1, kind: "note", text: "hi", context: {} });
    await enqueue(store, memory, note);
    const { calls, send } = recorder(() => ({ id: 1, status: "saved" }));
    await processOutbox(store, memory, send, { online: false });
    expect(calls).toHaveLength(0);
    expect(outboxLabel((await store.all())[0], false)).toBe("Queued offline");
  });

  it("retries a lost connection with the same idempotency key, and reports what the server actually did", async () => {
    const store = memoryOutbox();
    const memory = new Map<string, OutboxItem>();
    await enqueue(store, memory, newItem({ key: "live-0001", storyId: 1, kind: "live", text: "Touchdown", context: {} }));
    const { calls, send } = recorder((_item, call) => (call === 1 ? new SendError("Failed to fetch", 0) : { id: 9, status: "sent-to-desk" }));
    await processOutbox(store, memory, send, { online: true });
    expect((await store.all())[0]).toMatchObject({ state: "queued", attempts: 1 });
    await processOutbox(store, memory, send, { online: true });
    expect(calls.map((call) => call.key)).toEqual(["live-0001", "live-0001"]);
    const done = (await store.all())[0];
    // A draft for the desk is never called "Posted".
    expect(outboxLabel(done, true)).toBe("Sent to live desk");
  });

  it("fails a refused capture for the reporter to retry, and backs off a busy server", async () => {
    const store = memoryOutbox();
    const memory = new Map<string, OutboxItem>();
    await enqueue(store, memory, newItem({ key: "note-0002", storyId: 1, kind: "note", text: "x", context: {}, createdAt: 1 }));
    await enqueue(store, memory, newItem({ key: "note-0003", storyId: 1, kind: "note", text: "y", context: {}, createdAt: 2 }));
    const { send } = recorder((item) => (item.key === "note-0002" ? new SendError("You are not part of this story.", 403) : new SendError("Busy", 503)));
    await processOutbox(store, memory, send, { online: true, now: 1000 });
    const [refused, busy] = (await store.all()).sort((a, b) => a.createdAt - b.createdAt);
    expect(refused).toMatchObject({ state: "failed", error: "You are not part of this story." });
    expect(outboxLabel(refused, true)).toBe("Failed — Retry");
    expect(busy.state).toBe("queued");
    expect(busy.retryAt).toBeGreaterThan(1000);
    expect(retry(refused)).toMatchObject({ state: "queued", error: null, retryAt: 0 });
  });

  it("sends a live update only after its photo, attaching the photo's Media", async () => {
    const store = memoryOutbox();
    const memory = new Map<string, OutboxItem>();
    await enqueue(store, memory, newItem({ key: "photo-0001", storyId: 1, kind: "photo", blob: blob(), filename: "a.jpg", context: {}, createdAt: 1 }));
    await enqueue(store, memory, newItem({ key: "live-0002", storyId: 1, kind: "live", text: "Look", photoKey: "photo-0001", context: {}, createdAt: 2 }));
    const { calls, send } = recorder((item) => (item.kind === "photo" ? { id: 77, status: "saved" } : { id: 5, status: "posted" }));
    await processOutbox(store, memory, send, { online: true });
    expect(calls).toEqual([{ key: "photo-0001", photoId: null }, { key: "live-0002", photoId: 77 }]);
    const photo = (await store.all()).find((item) => item.key === "photo-0001")!;
    // Sent files are not kept on the device.
    expect(photo.blob).toBeUndefined();
  });

  it("never silently discards a file the browser won't store", async () => {
    const full: OutboxStore = { async all() { return []; }, async put() { throw new QuotaError("full"); }, async remove() {} };
    const memory = new Map<string, OutboxItem>();
    const result = await enqueue(full, memory, newItem({ key: "rec-0001", storyId: 1, kind: "recording", blob: blob(), filename: "interview.webm", context: {} }));
    expect(result.safe).toBe(false);
    expect(memory.get("rec-0001")?.memoryOnly).toBe(true);
    expect(outboxLabel(memory.get("rec-0001")!, true)).toBe("Not safely queued — keep this page open");
    const { calls, send } = recorder(() => ({ id: 3, status: "saved" }));
    await processOutbox(full, memory, send, { online: true });
    expect(calls).toHaveLength(1);
  });

  describe("live update delivery intent", () => {
    it("freezes Publish now through offline, a reload and retries, and sends it with every attempt", async () => {
      const store = memoryOutbox();
      const memory = new Map<string, OutboxItem>();
      const item = newItem({ key: "live-key-1", storyId: 5, kind: "live", delivery: "publish", text: "Touchdown", context: {} });
      await enqueue(store, memory, item);
      // Offline: nothing sent, and the label tells the reporter it is waiting to publish.
      expect(await processOutbox(store, memory, async () => { throw new Error("must not send"); }, { online: false })).toEqual([]);
      expect(outboxLabel((await store.all())[0], false)).toBe("Queued offline — publishes if coverage is still live");
      // A "reload": the item is read back from the store with its intent intact. The first try drops the connection.
      const { calls, send } = recorder((_item, call) => (call === 1 ? new SendError("offline", 0) : { id: 9, status: "posted" }));
      await processOutbox(store, memory, send, { online: true });
      expect((await store.all())[0]).toMatchObject({ state: "queued", delivery: "publish" });
      await processOutbox(store, memory, send, { online: true });
      expect(calls.map((call) => call.delivery)).toEqual(["publish", "publish"]);
      expect(calls.map((call) => call.key)).toEqual(["live-key-1", "live-key-1"]);
      expect(outboxLabel((await store.all())[0], true)).toBe("Posted");
    });

    it("tells the truth when a queued Publish now went to the desk instead", () => {
      const done = (reason?: OutboxResult["reason"], status: OutboxResult["status"] = "sent-to-desk"): OutboxItem => ({ ...newItem({ key: "k", storyId: 1, kind: "live", delivery: "publish", text: "x", context: {} }), state: "done", result: { id: 1, status, ...(reason ? { reason } : {}) } });
      expect(outboxLabel(done("coverage-ended"), true)).toBe("Sent to live desk — coverage ended before this sent.");
      expect(outboxLabel(done("permission-revoked"), true)).toBe("Sent to live desk — you can no longer publish live updates on this story.");
      expect(outboxLabel(done(undefined), true)).toBe("Sent to live desk");
      expect(outboxLabel(done(undefined, "posted"), true)).toBe("Posted");
    });

    it("keeps Send to desk a desk item, and an item with no recorded intent is never treated as Publish now", async () => {
      const store = memoryOutbox();
      const memory = new Map<string, OutboxItem>();
      await enqueue(store, memory, newItem({ key: "a", storyId: 1, kind: "live", delivery: "desk", text: "x", context: {} }));
      await enqueue(store, memory, newItem({ key: "b", storyId: 1, kind: "live", text: "legacy", context: {}, createdAt: Date.now() + 1 }));
      const { calls, send } = recorder(() => ({ id: 2, status: "sent-to-desk" }));
      await processOutbox(store, memory, send, { online: true });
      expect(calls.map((call) => call.delivery)).toEqual(["desk", undefined]);
    });
  });
});
