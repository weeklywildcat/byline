import { mediaDeskKey } from "../story/story-query";
import type { MediaArtDirection, MediaArtDirectionSave } from "./art-direction-model";
import type { MediaAssetDetail, MediaBulkPatch, MediaBulkResult, MediaFolder, MediaLibraryAsset, MediaLibraryPage, MediaLibraryQuery, MediaMetadataPatch, MediaNavigatorData, MediaRenameInput, MediaTagCount } from "./media-library-model";

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
  /** Renames the stored file (its type and links to it stay; its private URL changes). Compare-and-swap (409). */
  renameMedia?: (id: number, input: MediaRenameInput) => Promise<MediaAssetDetail>;
  /** Replaces the file's bytes with a new version of the same kind; ID, metadata and links stay. Compare-and-swap (409). */
  replaceMedia?: (id: number, file: File, options: { expectedUpdatedAt?: string; onProgress?: (fraction: number) => void; signal?: AbortSignal }) => Promise<MediaAssetDetail>;
  /** Tags in use, most used first (suggestions for the tag picker and the filter). */
  getTags?: () => Promise<MediaTagCount[]>;
  /** Applies the same creator, credit or rights, or adds and removes tags, on several files. Each is checked on its own. */
  updateMediaMany?: (ids: number[], patch: MediaBulkPatch) => Promise<MediaBulkResult>;
  /** Deletes several files (editors). A file still linked anywhere is refused, the rest go. */
  deleteMediaMany?: (ids: number[]) => Promise<MediaBulkResult>;
  uploadMedia: (file: File, options: MediaUploadOptions) => Promise<MediaLibraryAsset>;
  createFolder: (input: { name: string; parentId: number | null }) => Promise<MediaFolder>;
  updateFolder: (id: number, input: { name?: string; parentId?: number | null }) => Promise<MediaFolder>;
  deleteFolder: (id: number) => Promise<void>;
  /** Art direction (focal point and custom crops) for one photo. Absent where the host has no editor. */
  getArtDirection?: (id: number) => Promise<MediaArtDirection>;
  /** Saves art direction with compare-and-swap; a stale save is refused (409), never an overwrite. */
  saveArtDirection?: (id: number, save: MediaArtDirectionSave) => Promise<MediaArtDirection>;
  /** Queues publication preparation again (checks the account's Media permission). */
  retryPublication?: (id: number) => Promise<MediaAssetDetail>;
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
export const mediaArtDirectionKey = (id: number) => ["byline", "media", "art-direction", id] as const;
export const mediaFoldersKey = ["byline", "media", "navigator"] as const;
export const mediaTagsKey = ["byline", "media", "tags"] as const;
/** Production work (WordPress's Media Desk key, so story changes invalidate it everywhere). */
export const mediaWorkKey = mediaDeskKey;
