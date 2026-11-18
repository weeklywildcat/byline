/**
 * Field Mode's one outbox (docs/field-mode.md#outbox).
 *
 * Every capture (a note, a live update, a photo, a recording, a file) is
 * written here first, then sent. The reporter only needs one answer: does
 * Byline have this safely? So each item says exactly one of:
 *
 *   Saved · Queued offline · Sending · Uploading 62% · Posted · Sent to live desk
 *   · Failed — Retry
 *
 * Items carry a client-generated idempotency key; the server returns the
 * first record for a retried key, so resending after a lost response never
 * duplicates. Nothing depends on Service Worker Background Sync: sending
 * happens while Field Mode is open, and resumes when connectivity returns.
 * If the browser refuses to store a file (quota), the item is marked as not
 * safely queued; it is never silently dropped.
 *
 * A recording made in Field is an outbox item from its first second: its audio
 * is written beside the item as numbered chunks while it records
 * (`appendChunk`), so closing the recorder, leaving the Story, a reload or a
 * crash keeps everything recorded so far. A recording whose recorder is gone
 * is recovered from its chunks (`recoverRecordings`) and sent like any other.
 * Audio leaves the device only after the server has it, or when the reporter
 * deliberately deletes it.
 *
 * The logic is pure over an `OutboxStore`; `indexedDbOutbox()` persists it.
 */

import { isHeifFile, PHOTO_MIME_TYPES } from "@byline/core";
import { deskNote, type PublishBlock } from "../../domain/live-coverage";

export type OutboxKind = "note" | "live" | "photo" | "recording" | "file";
/** What the reporter tapped for a live update. Frozen into the item; the server decides again when it arrives. */
export type Delivery = "publish" | "desk";
/** `recording`: still being recorded on this device (its chunks are saved as it goes); never sent until it stops or is recovered. */
export type OutboxState = "recording" | "queued" | "sending" | "done" | "failed";

export type OutboxItem = {
  key: string;
  storyId: number;
  kind: OutboxKind;
  createdAt: number;
  text?: string;
  confidential?: boolean;
  blob?: Blob;
  filename?: string;
  durationMs?: number;
  capturedAt?: string;
  context: { appointmentId?: number; sourceId?: number; assignmentId?: number };
  /** A live update's explicit intent. Missing (an item queued before this existed) is the desk: stale material is never silently published. */
  delivery?: Delivery;
  /** A live update's optional headline, and whether a Publish now asked to pin it as the key update. */
  title?: string;
  pinned?: boolean;
  /** A live update waits for this photo item and attaches its Media. */
  photoKey?: string;
  /** Credited to someone else on a shared phone (an editor's "Posting as"). Frozen at tap time; the server re-checks it. */
  as?: { id: number; name: string };
  state: OutboxState;
  attempts: number;
  /** 0..1 while uploading. */
  progress: number;
  error: string | null;
  /** Earliest time to try again (ms epoch), after a server-side failure. */
  retryAt: number;
  result?: OutboxResult;
  /** True when the browser would not store the item: it exists only while this page is open. */
  memoryOnly?: boolean;
  /** A Field recording whose audio is the numbered chunks saved beside the item, not `blob`. */
  chunked?: boolean;
  /** The recording's audio type (a chunked item has no blob to carry one). */
  mimeType?: string;
  /** When a recording last saved a chunk (ms epoch). */
  updatedAt?: number;
  /** A recording that was still running when Field closed or the page was lost, rebuilt from its saved chunks. */
  recovered?: boolean;
};

export interface OutboxStore {
  all(): Promise<OutboxItem[]>;
  put(item: OutboxItem): Promise<void>;
  remove(key: string): Promise<void>;
  /** Saves one chunk of a recording together with its item (one write). Throws QuotaError when it does not fit. */
  appendChunk?(item: OutboxItem, seq: number, chunk: Blob): Promise<void>;
  /** A recording's chunks, in order. */
  chunks?(key: string): Promise<Blob[]>;
  removeChunks?(key: string): Promise<void>;
}

export class QuotaError extends Error {}

/** A failed send: `status` 0 is "no connection". */
export class SendError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export type OutboxResult = { id: number; status: "saved" | "posted" | "sent-to-desk"; /** Why a "Publish now" went to the desk instead. */ reason?: PublishBlock };

export type Sender = (item: OutboxItem, context: { photoId: number | null; onProgress: (fraction: number) => void }) => Promise<OutboxResult>;

/** A file chosen with Attach that could be a photograph (so Field asks whether it is one). iPhone pickers often report HEIC with no type. */
export function isPhotoFile(file: { name?: string | null; type?: string | null }): boolean {
  return (PHOTO_MIME_TYPES as readonly string[]).includes((file.type ?? "").toLowerCase()) || isHeifFile(file);
}

/** Connection trouble or a busy server: try again by itself. Anything else needs the reporter. */
export function isRetryable(status: number): boolean {
  return status === 0 || status === 408 || status === 429 || status >= 500;
}

export function newItem(input: Omit<OutboxItem, "state" | "attempts" | "progress" | "error" | "retryAt" | "createdAt"> & { createdAt?: number }): OutboxItem {
  return { createdAt: Date.now(), ...input, state: "queued", attempts: 0, progress: 0, error: null, retryAt: 0 };
}

/** The store's items with this page's memory-only copies in their place (memory is the newer copy). */
export async function outboxItems(store: OutboxStore, memory: Map<string, OutboxItem>): Promise<OutboxItem[]> {
  const items = new Map((await store.all()).map((item) => [item.key, item]));
  for (const item of memory.values()) items.set(item.key, item);
  return [...items.values()];
}

/** A capture's file: its blob, or a recording's saved chunks joined in order. `null` when nothing is left on the device. */
export async function captureBlob(store: OutboxStore, item: OutboxItem): Promise<Blob | null> {
  if (item.blob) return item.blob;
  if (!item.chunked || !store.chunks) return null;
  const parts = await store.chunks(item.key);
  return parts.length ? new Blob(parts, { type: item.mimeType ?? parts[0].type }) : null;
}

/**
 * Recordings left in the `recording` state by a recorder that is gone (Field
 * was closed or reloaded, the page crashed or the phone killed it) become
 * queued recordings of what was saved. `isRunning` says whether a recorder
 * still holds one (this page's, or another tab's). Never deletes audio.
 */
export async function recoverRecordings(store: OutboxStore, isRunning: (item: OutboxItem) => boolean | Promise<boolean>): Promise<OutboxItem[]> {
  const recovered: OutboxItem[] = [];
  for (const item of await store.all()) {
    if (item.state !== "recording" || (await isRunning(item))) continue;
    const next: OutboxItem = { ...item, state: "queued", recovered: true, durationMs: Math.max(item.durationMs ?? 0, (item.updatedAt ?? item.createdAt) - item.createdAt) };
    await store.put(next);
    recovered.push(next);
  }
  return recovered;
}

/** Saves an item, falling back to memory (and saying so) when the browser refuses to store it. */
export async function enqueue(store: OutboxStore, memory: Map<string, OutboxItem>, item: OutboxItem): Promise<{ safe: boolean; item: OutboxItem }> {
  try {
    await store.put(item);
    return { safe: true, item };
  } catch {
    // Full, or the browser lost its database connection (Safari does): either way the capture is kept in memory and says so.
    const kept = { ...item, memoryOnly: true };
    memory.set(kept.key, kept);
    return { safe: false, item: kept };
  }
}

/**
 * Sends what can be sent now, oldest first, one at a time (phones on stadium
 * networks do better with one upload at a time). Returns the items it changed.
 */
export async function processOutbox(store: OutboxStore, memory: Map<string, OutboxItem>, send: Sender, options: { online: boolean; now?: number; onChange?: (item: OutboxItem) => void }): Promise<OutboxItem[]> {
  const now = options.now ?? Date.now();
  const changed: OutboxItem[] = [];
  const save = async (item: OutboxItem) => {
    if (item.memoryOnly) memory.set(item.key, item);
    else {
      try {
        await store.put(item);
      } catch (error) {
        if (!(error instanceof QuotaError)) throw error;
        memory.set(item.key, { ...item, memoryOnly: true });
      }
    }
    changed.push(item);
    options.onChange?.(item);
  };
  if (!options.online) return changed;
  const items = (await outboxItems(store, memory)).sort((a, b) => a.createdAt - b.createdAt);
  const byKey = new Map(items.map((item) => [item.key, item]));
  for (const original of items) {
    if (original.state === "recording" || original.state === "done" || original.state === "failed" || original.retryAt > now) continue;
    let photoId: number | null = null;
    if (original.photoKey) {
      const photo = byKey.get(original.photoKey);
      if (photo?.state === "failed") {
        await save({ ...original, state: "failed", error: "Its photo didn't upload. Retry the photo first." });
        continue;
      }
      if (!photo || photo.state !== "done" || !photo.result) continue;
      photoId = photo.result.id;
    }
    let item: OutboxItem = { ...original, state: "sending", progress: 0, error: null };
    await save(item);
    try {
      // A recording's chunks are joined only for the send; the stored item never holds a second copy of the audio.
      const audio = item.chunked && !item.blob ? await captureBlob(store, item) : null;
      if (item.chunked && !item.blob && !audio) {
        // Field closed before the first few seconds were saved: there is nothing to send, and the reporter is told so.
        item = { ...item, state: "failed", progress: 0, error: "Nothing of this recording was saved on the phone before Field closed." };
        await save(item);
        byKey.set(item.key, item);
        continue;
      }
      const payload = audio ? { ...item, blob: audio } : item;
      const result = await send(payload, { photoId, onProgress: (fraction) => { item = { ...item, progress: fraction }; options.onChange?.(item); } });
      // Sent: the audio or file is no longer needed on the device, and only now is it removed.
      const { blob: _blob, ...rest } = item;
      item = { ...rest, state: "done", progress: 1, result, error: null };
      if (item.memoryOnly) {
        // Without its file the record is small: keep it in the store so a reload knows it was sent.
        try {
          const { memoryOnly: _memoryOnly, ...stored } = item;
          await store.put(stored);
          memory.delete(item.key);
          item = stored;
          changed.push(item);
          options.onChange?.(item);
        } catch {
          await save(item);
        }
      } else await save(item);
      if (item.chunked) await store.removeChunks?.(item.key);
      byKey.set(item.key, item);
    } catch (error) {
      const status = error instanceof SendError ? error.status : 0;
      const attempts = item.attempts + 1;
      item = isRetryable(status)
        ? { ...item, state: "queued", attempts, progress: 0, error: status === 0 ? null : (error as Error).message, retryAt: status === 0 ? 0 : now + Math.min(60_000, 2000 * 2 ** Math.min(attempts, 5)) }
        : { ...item, state: "failed", attempts, progress: 0, error: (error as Error).message || "Byline couldn't send this." };
      await save(item);
      byKey.set(item.key, item);
      // No connection: stop this round; the rest would fail the same way.
      if (status === 0) break;
    }
  }
  return changed;
}

/** The reporter's retry: back to the queue, now. */
export function retry(item: OutboxItem): OutboxItem {
  return { ...item, state: "queued", error: null, retryAt: 0 };
}

/** One honest line for an item. Never "Posted" until the server said it is published. */
export function outboxLabel(item: OutboxItem, online: boolean): string {
  if (item.memoryOnly && item.state !== "done") return "Not safely queued — keep this page open";
  switch (item.state) {
    case "done":
      if (item.kind === "live") {
        if (item.result?.status === "posted") return "Posted";
        // The truth: a Publish now that could not publish says why it went to the desk instead.
        const why = deskNote(item.result?.reason);
        return why ? `Sent to live desk — ${why}.` : "Sent to live desk";
      }
      return "Saved";
    case "recording":
      return "Recording — saved on this phone as it goes";
    case "sending":
      return item.blob || item.chunked ? `Uploading ${Math.round(item.progress * 100)}%` : "Sending";
    case "failed":
      return "Failed — Retry";
    case "queued":
      if (!online) return item.kind === "live" && item.delivery === "publish" ? "Queued offline — publishes if coverage is still live" : "Queued offline";
      if (item.photoKey) return "Waiting for its photo";
      return item.error ? "Waiting to retry" : "Queued";
  }
}

/** Done items are kept a day for the Recent list, then forgotten. */
export async function pruneOutbox(store: OutboxStore, now = Date.now()) {
  for (const item of await store.all()) {
    if (item.state !== "done") continue;
    // A sent recording's chunks are already gone; this catches a page lost between the two writes.
    if (item.chunked) await store.removeChunks?.(item.key);
    if (now - item.createdAt > 86_400_000) await store.remove(item.key);
  }
}

/** The reporter's deliberate delete of a capture that never reached Byline, audio included. */
export async function discardCapture(store: OutboxStore, memory: Map<string, OutboxItem>, item: OutboxItem) {
  memory.delete(item.key);
  await store.removeChunks?.(item.key);
  await store.remove(item.key);
}

export function memoryOutbox(): OutboxStore & { items: Map<string, OutboxItem>; chunkMap: Map<string, Blob[]> } {
  const items = new Map<string, OutboxItem>();
  const chunkMap = new Map<string, Blob[]>();
  return {
    items,
    chunkMap,
    async all() { return [...items.values()]; },
    async put(item) { items.set(item.key, item); },
    async remove(key) { items.delete(key); },
    async appendChunk(item, seq, chunk) {
      const list = chunkMap.get(item.key) ?? [];
      list[seq] = chunk;
      chunkMap.set(item.key, list);
      items.set(item.key, item);
    },
    async chunks(key) { return (chunkMap.get(key) ?? []).filter(Boolean); },
    async removeChunks(key) { chunkMap.delete(key); }
  };
}

const DB = "byline-field";
const STORE = "outbox";
/** Recording audio, keyed `[item key, sequence]`. Version 2 of the database added it. */
const CHUNKS = "chunks";

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function quota(error: unknown): boolean {
  const name = (error as { name?: string } | null)?.name ?? "";
  return name === "QuotaExceededError" || name === "NS_ERROR_DOM_QUOTA_REACHED";
}

/**
 * The outbox in this browser's IndexedDB, per signed-in account. Throws
 * QuotaError when a file does not fit. A connection the browser dropped
 * (Safari can lose its database server) is reopened once before an error is
 * reported, and an upgrade blocked by an old tab fails fast instead of
 * hanging, so a capture falls back to memory rather than waiting forever.
 */
export function indexedDbOutbox(account: string): OutboxStore {
  let opening: Promise<IDBDatabase> | null = null;
  const open = () => (opening ??= new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(`${DB}:${account}`, 2);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: "key" });
      if (!req.result.objectStoreNames.contains(CHUNKS)) req.result.createObjectStore(CHUNKS, { keyPath: ["key", "seq"] });
    };
    req.onsuccess = () => {
      const db = req.result;
      // A newer Field in another tab needs to upgrade: step aside, and reopen on the next call.
      db.onversionchange = () => { db.close(); opening = null; };
      db.onclose = () => { opening = null; };
      resolve(db);
    };
    req.onerror = () => { opening = null; reject(req.error); };
    req.onblocked = () => { opening = null; reject(new DOMException("Another Field tab is using an older outbox.", "InvalidStateError")); };
  }));
  /** Runs against the database, reopening it once if the connection was lost. */
  const use = async <T>(work: (db: IDBDatabase) => Promise<T>): Promise<T> => {
    try {
      return await work(await open());
    } catch (error) {
      if (quota(error)) throw new QuotaError("This phone has no room to keep the file.");
      opening = null;
      try {
        return await work(await open());
      } catch (again) {
        if (quota(again)) throw new QuotaError("This phone has no room to keep the file.");
        throw again;
      }
    }
  };
  const done = (transaction: IDBTransaction) => new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
  const range = (key: string) => IDBKeyRange.bound([key, 0], [key, Number.MAX_SAFE_INTEGER]);
  return {
    all: () => use(async (db) => (await request(db.transaction(STORE, "readonly").objectStore(STORE).getAll())) as OutboxItem[]),
    put: (item) => use(async (db) => {
      const transaction = db.transaction(STORE, "readwrite");
      transaction.objectStore(STORE).put(item);
      await done(transaction);
    }),
    remove: (key) => use(async (db) => {
      const transaction = db.transaction(STORE, "readwrite");
      transaction.objectStore(STORE).delete(key);
      await done(transaction);
    }),
    appendChunk: (item, seq, chunk) => use(async (db) => {
      const transaction = db.transaction([STORE, CHUNKS], "readwrite");
      transaction.objectStore(CHUNKS).put({ key: item.key, seq, chunk });
      transaction.objectStore(STORE).put(item);
      await done(transaction);
    }),
    chunks: (key) => use(async (db) => {
      const rows = (await request(db.transaction(CHUNKS, "readonly").objectStore(CHUNKS).getAll(range(key)))) as Array<{ seq: number; chunk: Blob }>;
      return rows.sort((a, b) => a.seq - b.seq).map((row) => row.chunk);
    }),
    removeChunks: (key) => use(async (db) => {
      const transaction = db.transaction(CHUNKS, "readwrite");
      transaction.objectStore(CHUNKS).delete(range(key));
      await done(transaction);
    })
  };
}
