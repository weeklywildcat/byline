/**
 * The kiosk's upload queue (docs/wildcat-polls.md#offline).
 *
 * A finished survey is queued before it is sent and leaves the queue only when
 * the server says it is saved (or refuses it for good). The respondent is
 * never told "saved" for answers that only exist on the iPad: they see
 * "saved on this iPad, will upload".
 *
 * Unlike Field Mode's outbox, queued answers are students' and anonymous, so
 * they are never stored in the clear. Each item is encrypted with AES-GCM
 * under a key the server derives for this polling session and hands only to
 * this session's kiosk credential; the key is held in memory, never written
 * down. After a reload the queue is unreadable until the kiosk is online and
 * fetches the key again; after the session ends nobody can read leftovers,
 * and they are deleted the next time the kiosk starts. If the browser has no
 * IndexedDB or Web Crypto, the queue is memory only and the interviewer screen
 * says so (online only).
 */

export type PollUpload = {
  submissionId: string;
  sessionId: string;
  ticket: string;
  answers: unknown;
  startedAt: string;
  durationMs: number;
  createdAt: number;
  attempts: number;
  retryAt: number;
  error: string | null;
};

export interface UploadStore {
  readonly durable: boolean;
  all(): Promise<PollUpload[]>;
  put(item: PollUpload): Promise<void>;
  remove(submissionId: string): Promise<void>;
}

export function memoryStore(): UploadStore {
  const items = new Map<string, PollUpload>();
  return {
    durable: false,
    all: async () => [...items.values()].sort((a, b) => a.createdAt - b.createdAt),
    put: async (item) => { items.set(item.submissionId, item); },
    remove: async (id) => { items.delete(id); }
  };
}

const DB = "byline-polls";
const STORE = "uploads";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function tx<T>(db: IDBDatabase, mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const request = run(db.transaction(STORE, mode).objectStore(STORE));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

const fromBase64Url = (text: string) => Uint8Array.from(atob(text.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(text.length / 4) * 4, "=")), (c) => c.charCodeAt(0));

export const secureQueueAvailable = () => typeof indexedDB !== "undefined" && typeof crypto !== "undefined" && Boolean(crypto.subtle) && typeof window !== "undefined" && window.isSecureContext;

type Sealed = { id: string; sessionId: string; createdAt: number; iv: Uint8Array; data: ArrayBuffer };

/** The encrypted, durable queue for one session. Rows from any other session are deleted on open. */
export async function encryptedStore(sessionId: string, keyText: string): Promise<UploadStore> {
  if (!secureQueueAvailable()) return memoryStore();
  try {
    const key = await crypto.subtle.importKey("raw", fromBase64Url(keyText), "AES-GCM", false, ["encrypt", "decrypt"]);
    const db = await openDb();
    const rows = await tx<Sealed[]>(db, "readonly", (store) => store.getAll() as IDBRequest<Sealed[]>);
    for (const row of rows) if (row.sessionId !== sessionId) await tx(db, "readwrite", (store) => store.delete(row.id));
    const encoder = new TextEncoder();
    return {
      durable: true,
      async all() {
        const sealed = await tx<Sealed[]>(db, "readonly", (store) => store.getAll() as IDBRequest<Sealed[]>);
        const items: PollUpload[] = [];
        for (const row of sealed.filter((entry) => entry.sessionId === sessionId)) {
          try {
            const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: row.iv as BufferSource }, key, row.data);
            items.push(JSON.parse(new TextDecoder().decode(plain)) as PollUpload);
          } catch {
            // Not readable with this session's key: never shown, never sent, deleted.
            await tx(db, "readwrite", (store) => store.delete(row.id));
          }
        }
        return items.sort((a, b) => a.createdAt - b.createdAt);
      },
      async put(item) {
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const data = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoder.encode(JSON.stringify(item)));
        await tx(db, "readwrite", (store) => store.put({ id: item.submissionId, sessionId, createdAt: item.createdAt, iv, data } satisfies Sealed));
      },
      async remove(id) {
        await tx(db, "readwrite", (store) => store.delete(id));
      }
    };
  } catch {
    return memoryStore();
  }
}

/** Deletes every queued item on this device (the session ended, or another one started). */
export async function clearStoredUploads(): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  try {
    const db = await openDb();
    await tx(db, "readwrite", (store) => store.clear());
  } catch {
    // Nothing stored, or storage is unavailable: nothing to clear.
  }
}

export type SendResult = { status: "saved" } | { status: "retry"; error: string } | { status: "rejected"; error: string };

/** Backoff after a failed attempt: 2 s, 4 s, 8 s … at most a minute. */
export const retryDelay = (attempts: number) => Math.min(60_000, 1000 * 2 ** Math.min(attempts, 6));

/** One pass over the queue: everything due is sent once, in order. */
export async function flushUploads(store: UploadStore, send: (item: PollUpload) => Promise<SendResult>, now = Date.now()): Promise<{ saved: string[]; rejected: Array<{ id: string; error: string }> }> {
  const saved: string[] = [];
  const rejected: Array<{ id: string; error: string }> = [];
  for (const item of await store.all()) {
    if (item.retryAt > now) continue;
    const result = await send(item);
    if (result.status === "saved") { await store.remove(item.submissionId); saved.push(item.submissionId); continue; }
    if (result.status === "rejected") { await store.remove(item.submissionId); rejected.push({ id: item.submissionId, error: result.error }); continue; }
    await store.put({ ...item, attempts: item.attempts + 1, retryAt: now + retryDelay(item.attempts + 1), error: result.error });
    // A connection problem affects everything after it too: stop and wait.
    break;
  }
  return { saved, rejected };
}

export const newKey = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
