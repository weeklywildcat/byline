"use client";

import { mediaCredit, type ArticleMediaAsset } from "@byline/article-body";
import type { BylineEditorHost } from "@byline/editor/client";
import { DEFAULT_MEDIA_ROUTE, type MediaLibraryAsset } from "@byline/newsroom-screens/media/media-library-model";
import { useMemo } from "react";
import { useMediaWorkspace } from "../media/MediaWorkspaceShell";

/**
 * A Media Library asset as the editor's media record. `src` is the protected
 * original (served through the newsroom's access control), so the canvas shows
 * the real photograph; credit is resolved from the asset (creator, then credit
 * line), never stored in the story.
 */
export function articleMediaFromLibrary(asset: MediaLibraryAsset): ArticleMediaAsset {
  return {
    id: asset.id,
    kind: asset.kind === "image" || asset.kind === "document" || asset.kind === "audio" ? asset.kind : "other",
    src: asset.url ?? asset.previewUrl ?? "",
    ...(asset.previewUrl ? { previewSrc: asset.previewUrl } : {}),
    width: asset.width,
    height: asset.height,
    mimeType: asset.mimeType,
    filename: asset.filename,
    filesize: asset.filesize,
    alt: asset.alt,
    credit: mediaCredit(asset)
  };
}

/**
 * The newsroom's side of the editor: Byline's Media picker (never Payload's
 * Media list), asset lookups and uploads through /api/byline/media, and the
 * Media workspace address for fixing an asset's credit or alt text.
 */
export function useNewsroomEditorHost(): BylineEditorHost {
  const { fetchers, pick, href, editArtDirection } = useMediaWorkspace();
  return useMemo<BylineEditorHost>(() => ({
    pickMedia: async ({ kind, multiple, title, confirmLabel }) => (await pick({ kind, multiple, title, confirmLabel })).map(articleMediaFromLibrary),
    loadMedia: async (id) => {
      try {
        return articleMediaFromLibrary(await fetchers.getAsset(Number(id)));
      } catch {
        return null;
      }
    },
    uploadMedia: async (file, onProgress) => articleMediaFromLibrary(await fetchers.uploadMedia(file, { folderId: null, onProgress })),
    mediaHref: (id) => href({ ...DEFAULT_MEDIA_ROUTE, assetId: Number(id) }),
    // The Media shell owns the one art-direction editor; blocks and the lead image only name a Media ID.
    editArtDirection: async (id) => (await editArtDirection(Number(id))) !== null
  }), [editArtDirection, fetchers, href, pick]);
}
