"use client";

import type { MediaArtDirection } from "@byline/newsroom-screens/media/art-direction-model";
import type { MediaLibraryFetchers } from "@byline/newsroom-screens/media/media-library-api";
import { mediaLibraryParams, type MediaAssetDetail, type MediaBulkResult, type MediaTagCount, type MediaFolder, type MediaLibraryAsset, type MediaLibraryPage, type MediaNavigatorData } from "@byline/newsroom-screens/media/media-library-model";
import { createMediaPreferencesStore, type MediaPreferencesStore } from "@byline/newsroom-screens/media/media-preferences";
import { normalizeMediaPreferences } from "@byline/newsroom-screens/media/media-preferences";
import { queryPath, type PlanningFetchers } from "@byline/newsroom-screens/planning/planning-api";
import type { MediaDeskResponse } from "@byline/newsroom-screens/planning/planning-model";
import { createBylineRequest, type ScreenError } from "../home/payload-fetchers";
import type { PreferenceStore } from "../stories/saved-views";

/**
 * The Payload newsroom's Media fetchers, over `/api/byline/media/*`
 * (src/newsroom/media-library.ts, media-work.ts). The shared Media screens
 * never see Payload's REST shapes; every write still passes the Media and
 * folder collections' own access control on the server.
 */
export function createPayloadMediaFetchers(api: string): MediaLibraryFetchers {
  const request = createBylineRequest(api);
  return {
    getNavigator: () => request<MediaNavigatorData>("/media/navigator"),
    getLibrary: (query) => request<MediaLibraryPage>(queryPath("/media", mediaLibraryParams(query))),
    getAsset: (id) => request<MediaAssetDetail>(`/media/${id}`),
    updateMedia: (id, patch) => request<MediaAssetDetail>(`/media/${id}`, "PATCH", patch),
    moveMedia: (ids, folderId) => request("/media/move", "POST", { ids, folderId }),
    deleteMedia: (id) => request<void>(`/media/${id}`, "DELETE"),
    renameMedia: (id, input) => request<MediaAssetDetail>(`/media/${id}/rename`, "POST", input),
    updateMediaMany: (ids, patch) => request<MediaBulkResult>("/media/bulk-update", "POST", { ids, patch }),
    deleteMediaMany: (ids) => request<MediaBulkResult>("/media/bulk-delete", "POST", { ids }),
    uploadMedia: (file, options) => uploadWithProgress(`${api}/byline/media/upload`, file, { folderId: options.folderId }, options),
    replaceMedia: (id, file, options) => uploadWithProgress(`${api}/byline/media/${id}/replace`, file, { expectedUpdatedAt: options.expectedUpdatedAt }, options),
    getTags: () => request<MediaTagCount[]>("/media/tags"),
    createFolder: (input) => request<MediaFolder>("/media/folders", "POST", input),
    updateFolder: (id, input) => request<MediaFolder>(`/media/folders/${id}`, "PATCH", input),
    deleteFolder: (id) => request<void>(`/media/folders/${id}`, "DELETE"),
    getArtDirection: (id) => request<MediaArtDirection>(`/media/${id}/art-direction`),
    saveArtDirection: (id, save) => request<MediaArtDirection>(`/media/${id}/art-direction`, "PUT", save),
    retryPublication: (id) => request<MediaAssetDetail>(`/media/${id}/publication/retry`, "POST", {})
  };
}

/** Media Work for the shared production desk: the Payload `getMediaDesk` and the per-assignment write. */
export function createPayloadMediaWorkFetchers(api: string): Pick<PlanningFetchers, "getMediaDesk" | "updateMediaAssignment"> {
  const request = createBylineRequest(api);
  return {
    getMediaDesk: () => request<MediaDeskResponse>("/media/work"),
    updateMediaAssignment: (storyId, assignmentId, changes) => request(`/stories/${storyId}/media-assignments/${encodeURIComponent(assignmentId)}`, "POST", changes)
  };
}

/**
 * One multipart upload with progress (fetch can't report upload progress).
 * Payload's convention: the file, and the other fields as `_payload` JSON.
 */
function uploadWithProgress<T = MediaLibraryAsset>(url: string, file: File, fields: Record<string, unknown>, options: { onProgress?: (fraction: number) => void; signal?: AbortSignal }): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const form = new FormData();
    form.append("file", file, file.name);
    form.append("_payload", JSON.stringify(fields));
    xhr.open("POST", url);
    xhr.withCredentials = true;
    xhr.responseType = "json";
    xhr.upload.onprogress = (event) => { if (event.lengthComputable) options.onProgress?.(event.loaded / event.total); };
    const fail = (status: number, message?: string) => reject({ message: message || (status === 413 ? "That file is too large to upload." : status === 0 ? "The connection dropped. Retry when you're back online." : "The upload didn't finish."), code: `byline_${status}`, data: { status } } satisfies ScreenError);
    xhr.onload = () => {
      const body = xhr.response as (T & { message?: string }) | null;
      if (xhr.status >= 200 && xhr.status < 300 && body) resolve(body);
      else fail(xhr.status, body?.message);
    };
    xhr.onerror = () => fail(0);
    xhr.onabort = () => fail(0, "Upload cancelled.");
    options.signal?.addEventListener("abort", () => xhr.abort(), { once: true });
    xhr.send(form);
  });
}

/** The reader's Grid/List, sort and inspector width (Payload Preferences; see media-preferences.ts). */
export const MEDIA_PREFERENCES_KEY = "byline:media:preferences:v1";

export function payloadMediaPreferences(store: PreferenceStore): MediaPreferencesStore {
  return createMediaPreferencesStore({
    load: async () => normalizeMediaPreferences(await store.getPreference<unknown>(MEDIA_PREFERENCES_KEY)),
    save: (preferences) => store.setPreference(MEDIA_PREFERENCES_KEY, normalizeMediaPreferences(preferences))
  });
}
