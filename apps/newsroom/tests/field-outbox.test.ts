import { describe, expect, it } from "vitest";
import { enqueue, memoryOutbox, newItem, outboxLabel, processOutbox, QuotaError, retry, SendError, type OutboxItem, type OutboxStore, type Sender } from "../src/ui/field/outbox";

const blob = () => new Blob(["x"], { type: "image/jpeg" });

function recorder(behaviour: (item: OutboxItem, call: number) => { id: number; status: "saved" | "posted" | "sent-to-desk" } | SendError) {
  const calls: Array<{ key: string; photoId: number | null }> = [];
  const send: Sender = async (item, { photoId }) => {
    calls.push({ key: item.key, photoId });
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
});
