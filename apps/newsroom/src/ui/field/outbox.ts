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
 * The logic is pure over an `OutboxStore`; `indexedDbOutbox()` persists it.
 */

export type OutboxKind = "note" | "live" | "photo" | "recording" | "file";
export type OutboxState = "queued" | "sending" | "done" | "failed";

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
  /** A live update waits for this photo item and attaches its Media. */
  photoKey?: string;
  state: OutboxState;
  attempts: number;
  /** 0..1 while uploading. */
  progress: number;
  error: string | null;
  /** Earliest time to try again (ms epoch), after a server-side failure. */
  retryAt: number;
  result?: { id: number; status: "saved" | "posted" | "sent-to-desk" };
  /** True when the browser would not store the item: it exists only while this page is open. */
  memoryOnly?: boolean;
};

export interface OutboxStore {
  all(): Promise<OutboxItem[]>;
  put(item: OutboxItem): Promise<void>;
  remove(key: string): Promise<void>;
}

export class QuotaError extends Error {}

/** A failed send: `status` 0 is "no connection". */
export class SendError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export type Sender = (item: OutboxItem, context: { photoId: number | null; onProgress: (fraction: number) => void }) => Promise<{ id: number; status: "saved" | "posted" | "sent-to-desk" }>;

/** Connection trouble or a busy server: try again by itself. Anything else needs the reporter. */
export function isRetryable(status: number): boolean {
  return status === 0 || status === 408 || status === 429 || status >= 500;
}

export function newItem(input: Omit<OutboxItem, "state" | "attempts" | "progress" | "error" | "retryAt" | "createdAt"> & { createdAt?: number }): OutboxItem {
  return { createdAt: Date.now(), ...input, state: "queued", attempts: 0, progress: 0, error: null, retryAt: 0 };
}

/** Saves an item, falling back to memory (and saying so) when the browser refuses to store it. */
export async function enqueue(store: OutboxStore, memory: Map<string, OutboxItem>, item: OutboxItem): Promise<{ safe: boolean; item: OutboxItem }> {
  try {
    await store.put(item);
    return { safe: true, item };
  } catch (error) {
    if (!(error instanceof QuotaError)) throw error;
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
  const items = [...(await store.all()), ...memory.values()].sort((a, b) => a.createdAt - b.createdAt);
  const byKey = new Map(items.map((item) => [item.key, item]));
  for (const original of items) {
    if (original.state === "done" || original.state === "failed" || original.retryAt > now) continue;
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
      const result = await send(item, { photoId, onProgress: (fraction) => { item = { ...item, progress: fraction }; options.onChange?.(item); } });
      // Sent: the blob is no longer needed on the device.
      const { blob: _blob, ...rest } = item;
      item = { ...rest, state: "done", progress: 1, result, error: null };
      await save(item);
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
      if (item.kind === "live") return item.result?.status === "posted" ? "Posted" : "Sent to live desk";
      return "Saved";
    case "sending":
      return item.blob ? `Uploading ${Math.round(item.progress * 100)}%` : "Sending";
    case "failed":
      return "Failed — Retry";
    case "queued":
      if (!online) return "Queued offline";
      if (item.photoKey) return "Waiting for its photo";
      return item.error ? "Waiting to retry" : "Queued";
  }
}

/** Done items are kept a day for the Recent list, then forgotten. */
export async function pruneOutbox(store: OutboxStore, now = Date.now()) {
  for (const item of await store.all()) if (item.state === "done" && now - item.createdAt > 86_400_000) await store.remove(item.key);
}

export function memoryOutbox(): OutboxStore & { items: Map<string, OutboxItem> } {
  const items = new Map<string, OutboxItem>();
  return {
    items,
    async all() { return [...items.values()]; },
    async put(item) { items.set(item.key, item); },
    async remove(key) { items.delete(key); }
  };
}

const DB = "byline-field";
const STORE = "outbox";

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

/** The outbox in this browser's IndexedDB, per signed-in account. Throws QuotaError when a file does not fit. */
export function indexedDbOutbox(account: string): OutboxStore {
  let opening: Promise<IDBDatabase> | null = null;
  const open = () => (opening ??= new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(`${DB}:${account}`, 1);
    req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: "key" }); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }));
  const tx = async (mode: IDBTransactionMode) => (await open()).transaction(STORE, mode);
  return {
    async all() {
      const store = (await tx("readonly")).objectStore(STORE);
      return (await request(store.getAll())) as OutboxItem[];
    },
    async put(item) {
      try {
        const transaction = await tx("readwrite");
        transaction.objectStore(STORE).put(item);
        await new Promise<void>((resolve, reject) => {
          transaction.oncomplete = () => resolve();
          transaction.onerror = () => reject(transaction.error);
          transaction.onabort = () => reject(transaction.error);
        });
      } catch (error) {
        if (quota(error)) throw new QuotaError("This phone has no room to keep the file.");
        throw error;
      }
    },
    async remove(key) {
      const transaction = await tx("readwrite");
      transaction.objectStore(STORE).delete(key);
      await new Promise<void>((resolve) => { transaction.oncomplete = () => resolve(); transaction.onerror = () => resolve(); });
    }
  };
}
