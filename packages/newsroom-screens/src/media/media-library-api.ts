import { mediaDeskKey } from "../story/story-query";
import type { MediaAssetDetail, MediaFolder, MediaLibraryAsset, MediaLibraryPage, MediaLibraryQuery, MediaMetadataPatch, MediaNavigatorData } from "./media-library-model";

/**
 * What a host supplies for the Media Library. The screens never know the
 * CMS's REST shapes; the Payload newsroom implements these over
 * `/api/byline/media/*`, and every write still passes the Media collection's
 * own access control there.
 */
export type MediaLibraryFetchers = {
  getNavigator: () => Promise<MediaNavigatorData>;
  getLibrary: (query: MediaLibraryQuery) => Promise<MediaLibraryPage>;
  getAsset: (id: number) => Promise<MediaAssetDetail>;
  updateMedia: (id: number, patch: MediaMetadataPatch) => Promise<MediaAssetDetail>;
  /** File several assets into one folder (null: Unfiled). Each is checked on its own. */
  moveMedia: (ids: number[], folderId: number | null) => Promise<MediaMoveResult>;
  deleteMedia: (id: number) => Promise<void>;
  uploadMedia: (file: File, options: MediaUploadOptions) => Promise<MediaLibraryAsset>;
  createFolder: (input: { name: string; parentId: number | null }) => Promise<MediaFolder>;
  updateFolder: (id: number, input: { name?: string; parentId?: number | null }) => Promise<MediaFolder>;
  deleteFolder: (id: number) => Promise<void>;
};

export type MediaMoveResult = { moved: number[]; failed: Array<{ id: number; message: string }> };

export type MediaUploadOptions = {
  folderId: number | null;
  /** 0..1 as the bytes go up. */
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
};

/* ------------------------------------------------------------- query keys */

/**
 * Media's server-state keys, all under one root so a Library mutation can be
 * narrow: moving an asset refreshes Library pages and the navigator's counts,
 * never Stories or Home. Work is the shared production desk key.
 */
export const mediaRootKey = ["byline", "media"] as const;
export const mediaLibraryRootKey = ["byline", "media", "library"] as const;
export const mediaLibraryKey = (query: Omit<MediaLibraryQuery, "page">) => ["byline", "media", "library", query] as const;
export const mediaAssetKey = (id: number) => ["byline", "media", "asset", id] as const;
export const mediaFoldersKey = ["byline", "media", "navigator"] as const;
/** Production work (WordPress's Media Desk key, so story changes invalidate it everywhere). */
export const mediaWorkKey = mediaDeskKey;
