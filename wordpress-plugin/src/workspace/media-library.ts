/**
 * A defensive bridge to the WordPress Media Library modal (`wp.media`). It lives
 * outside this React root, so every access is optional: when the library is not
 * loaded the caller simply does not offer the button.
 */
import type { MediaAssignmentType } from "./workspace-types";

export type PickedAttachment = { id: number; title: string; previewUrl: string | null; mimeType: string | null };

type MediaFrame = { on: (event: string, handler: () => void) => void; open: () => void; close: () => void; state: () => { get: (name: string) => { toJSON: () => unknown[] } } };
type MediaFactory = (options: Record<string, unknown>) => MediaFrame;

function factory(): MediaFactory | null {
  try {
    const media = (window as unknown as { wp?: { media?: unknown } }).wp?.media;
    return typeof media === "function" ? (media as MediaFactory) : null;
  } catch {
    return null;
  }
}

export const mediaLibraryAvailable = () => factory() !== null;

const libraryType = (type: MediaAssignmentType) => (type === "photo" || type === "gallery" || type === "graphic" ? "image" : type === "video" ? "video" : type === "audio" ? "audio" : null);

export function normalizePicked(raw: unknown): PickedAttachment | null {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as { id?: unknown; title?: unknown; filename?: unknown; url?: unknown; mime?: unknown; sizes?: Record<string, { url?: unknown } | undefined> };
  const id = Number(item.id);
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  const preview = item.sizes?.thumbnail?.url ?? item.sizes?.medium?.url ?? (typeof item.mime === "string" && item.mime.startsWith("image/") ? item.url : null);
  return {
    id,
    title: String(item.title || item.filename || `File ${id}`),
    previewUrl: typeof preview === "string" ? preview : null,
    mimeType: typeof item.mime === "string" ? item.mime : null
  };
}

/** Open the library. Resolves with the chosen files, or an empty list when it is dismissed. */
export function pickFromMediaLibrary(type: MediaAssignmentType): Promise<PickedAttachment[]> {
  const create = factory();
  if (!create) return Promise.resolve([]);
  return new Promise((resolve) => {
    let settled = false;
    const finish = (items: PickedAttachment[]) => { if (!settled) { settled = true; resolve(items); } };
    try {
      const kind = libraryType(type);
      const frame = create({ title: "Add files to this assignment", button: { text: "Add to assignment" }, multiple: "add", ...(kind ? { library: { type: kind } } : {}) });
      frame.on("select", () => finish(frame.state().get("selection").toJSON().map(normalizePicked).filter((item): item is PickedAttachment => item !== null)));
      // WordPress closes the frame first and triggers `select` right after, in the
      // same call. Settle "dismissed" only once that call has finished.
      frame.on("close", () => window.setTimeout(() => finish([]), 0));
      frame.open();
    } catch {
      finish([]);
    }
  });
}
