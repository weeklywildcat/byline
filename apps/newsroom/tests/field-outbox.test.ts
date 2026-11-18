import { describe, expect, it } from "vitest";
import { captureBlob, discardCapture, enqueue, isPhotoFile, memoryOutbox, newItem, outboxItems, outboxLabel, processOutbox, pruneOutbox, QuotaError, recoverRecordings, retry, SendError, type OutboxItem, type OutboxResult, type OutboxStore, type Sender } from "../src/ui/field/outbox";

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

describe("attach: which files ask 'is this a photo?'", () => {
  it("asks for photographs, including HEIC with no type, and not for documents, audio or raw", () => {
    expect(isPhotoFile({ name: "IMG_1.jpg", type: "image/jpeg" })).toBe(true);
    expect(isPhotoFile({ name: "IMG_2.HEIC", type: "" })).toBe(true);
    expect(isPhotoFile({ name: "IMG_3.heif", type: "image/heif" })).toBe(true);
    expect(isPhotoFile({ name: "notes.pdf", type: "application/pdf" })).toBe(false);
    expect(isPhotoFile({ name: "interview.m4a", type: "audio/mp4" })).toBe(false);
    expect(isPhotoFile({ name: "IMG_4.dng", type: "image/x-adobe-dng" })).toBe(false);
  });
});

describe("Field recordings are never lost", () => {
  const chunk = (text: string) => new Blob([text], { type: "audio/webm" });
  const recording = (over: Partial<OutboxItem> = {}): OutboxItem => ({ ...newItem({ key: "rec-live", storyId: 1, kind: "recording", chunked: true, mimeType: "audio/webm", filename: "recording.webm", context: { appointmentId: 4 }, createdAt: 1000 }), state: "recording", updatedAt: 1000, ...over });

  it("never sends a recording that is still recording, and says it is saved as it goes", async () => {
    const store = memoryOutbox();
    const item = recording();
    await store.put(item);
    await store.appendChunk!({ ...item, durationMs: 3000, updatedAt: 4000 }, 0, chunk("a"));
    const { calls, send } = recorder(() => ({ id: 1, status: "saved" }));
    await processOutbox(store, new Map(), send, { online: true });
    expect(calls).toHaveLength(0);
    expect(outboxLabel((await store.all())[0], true)).toBe("Recording — saved on this phone as it goes");
  });

  it("recovers a recording whose recorder is gone, from the chunks it saved, and leaves running ones alone", async () => {
    const store = memoryOutbox();
    await store.appendChunk!(recording({ durationMs: 6000, updatedAt: 7000 }), 0, chunk("a"));
    await store.appendChunk!(recording({ durationMs: 6000, updatedAt: 7000 }), 1, chunk("b"));
    await store.appendChunk!(recording({ key: "rec-other-tab" }), 0, chunk("c"));
    const recovered = await recoverRecordings(store, (item) => item.key === "rec-other-tab");
    expect(recovered.map((item) => item.key)).toEqual(["rec-live"]);
    expect(store.items.get("rec-live")).toMatchObject({ state: "queued", recovered: true, durationMs: 6000 });
    expect(store.items.get("rec-other-tab")?.state).toBe("recording");
    expect(await store.chunks!("rec-live")).toHaveLength(2);
  });

  it("uploads the chunks joined in order as one file, then and only then removes them from the phone", async () => {
    const store = memoryOutbox();
    const item = { ...recording(), state: "queued" as const };
    await store.appendChunk!(item, 1, chunk("world"));
    await store.appendChunk!(item, 0, chunk("hello "));
    const sent: string[] = [];
    const send: Sender = async (payload) => { sent.push(await payload.blob!.text()); return { id: 12, status: "saved" }; };
    await processOutbox(store, new Map(), send, { online: true });
    expect(sent).toEqual(["hello world"]);
    expect(store.items.get("rec-live")).toMatchObject({ state: "done", result: { id: 12 } });
    // The stored item never held a copy of the audio.
    expect(store.items.get("rec-live")?.blob).toBeUndefined();
    expect(store.chunkMap.has("rec-live")).toBe(false);
  });

  it("keeps the chunks through failed and offline sends, and the reporter can still get the audio back", async () => {
    const store = memoryOutbox();
    const item = { ...recording(), state: "queued" as const };
    await store.appendChunk!(item, 0, chunk("take"));
    const { send } = recorder((_item, call) => (call === 1 ? new SendError("offline", 0) : new SendError("That recording is larger than 300 MB.", 413)));
    await processOutbox(store, new Map(), send, { online: true });
    await processOutbox(store, new Map(), send, { online: true });
    expect(store.items.get("rec-live")?.state).toBe("failed");
    expect(await (await captureBlob(store, store.items.get("rec-live")!))!.text()).toBe("take");
  });

  it("says so when Field closed before anything was saved, without calling the server", async () => {
    const store = memoryOutbox();
    await store.put({ ...recording(), state: "queued", recovered: true });
    const { calls, send } = recorder(() => ({ id: 1, status: "saved" }));
    await processOutbox(store, new Map(), send, { online: true });
    expect(calls).toHaveLength(0);
    expect(store.items.get("rec-live")).toMatchObject({ state: "failed", error: "Nothing of this recording was saved on the phone before Field closed." });
  });

  it("deletes a recording's audio only on the reporter's discard", async () => {
    const store = memoryOutbox();
    const memory = new Map<string, OutboxItem>();
    const item = { ...recording(), state: "failed" as const };
    await store.appendChunk!(item, 0, chunk("a"));
    await pruneOutbox(store, 10 ** 13);
    expect(store.chunkMap.has("rec-live")).toBe(true);
    await discardCapture(store, memory, item);
    expect(store.items.size).toBe(0);
    expect(store.chunkMap.size).toBe(0);
  });

  it("lists a memory-only copy in place of the stored one, never both", async () => {
    const store = memoryOutbox();
    const memory = new Map<string, OutboxItem>();
    await store.put(recording());
    memory.set("rec-live", { ...recording(), state: "queued", memoryOnly: true, chunked: false, blob: chunk("all") });
    const items = await outboxItems(store, memory);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ state: "queued", memoryOnly: true });
  });

  it("falls back to memory, never dropping the capture, when the browser's database fails for any reason", async () => {
    const broken: OutboxStore = { async all() { return []; }, async put() { throw new DOMException("Connection to Indexed Database server lost.", "UnknownError"); }, async remove() {} };
    const memory = new Map<string, OutboxItem>();
    const result = await enqueue(broken, memory, newItem({ key: "rec-x", storyId: 1, kind: "recording", blob: chunk("a"), filename: "a.webm", context: {} }));
    expect(result.safe).toBe(false);
    expect(memory.get("rec-x")?.memoryOnly).toBe(true);
  });
});
