"use client";

import { mediaCredit, type ArticleMediaAsset, type MediaId } from "@byline/article-body";
import type { BylineEditorHost, PollChoice, StoryChoice } from "@byline/editor/client";
import { articleMediaFromPayload } from "@byline/editor/normalize";
import { useAuth, useConfig, useDocumentInfo } from "@payloadcms/ui";
import { publicPollReference, publicStoryReference } from "../../public/references";
import { DEFAULT_MEDIA_ROUTE, type MediaLibraryAsset } from "@byline/newsroom-screens/media/media-library-model";
import { useQueryClient } from "@tanstack/react-query";
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
type Doc = Record<string, unknown>;

/** A Story as the Related Coverage picker shows it: only a published story with a public address, never the one being edited. */
function storyChoice(doc: unknown, timeZone: string, excludeId: unknown): StoryChoice | null {
  const projected = publicStoryReference(doc, { timeZone, excludeId: excludeId as number | string | null });
  if (!projected) return null;
  const thumbnail = projected.thumbnail ? articleMediaFromPayload(projected.thumbnail, (media) => (media.sizes as { library?: { url?: string } } | undefined)?.library?.url ?? (typeof media.url === "string" ? media.url : null)) : null;
  return { ...projected.reference, ...(thumbnail ? { thumbnailAsset: thumbnail } : {}) };
}

function pollChoice(doc: Doc): PollChoice | null {
  const status = doc.status;
  if (status !== "draft" && status !== "open" && status !== "closed") return null;
  // A draft poll is shown (so a writer sees why it will not publish) but never offered by search.
  const reference = publicPollReference({ ...doc, status: status === "draft" ? "closed" : status });
  return reference ? { ...reference, status } : null;
}

export function useNewsroomEditorHost(): BylineEditorHost {
  const { fetchers, pick, href, editArtDirection, editDetails } = useMediaWorkspace();
  const { config } = useConfig();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { id: currentStoryId } = useDocumentInfo();
  const api = config.routes.api;
  const custom = (config.admin?.custom ?? {}) as { newsroomTimeZone?: string; repositoryInteractives?: BylineEditorHost["interactives"] };
  const timeZone = custom.newsroomTimeZone ?? "America/New_York";
  const role = typeof user?.role === "string" ? user.role : "staff";
  const get = async (path: string, params: Record<string, string | number> = {}): Promise<Doc | null> => {
    const query = new URLSearchParams(Object.entries(params).map(([key, value]) => [key, String(value)]));
    const response = await fetch(`${api}${path}${query.size ? `?${query}` : ""}`, { credentials: "include", headers: { Accept: "application/json" } });
    return response.ok ? ((await response.json()) as Doc) : null;
  };
  return useMemo<BylineEditorHost>(() => ({
    // The server restores what a staff writer may not change; this only avoids offering it.
    canUsePrivilegedBlocks: role === "editor" || role === "administrator",
    interactives: custom.repositoryInteractives ?? [],
    searchStories: async (query) => {
      const found = await get("/stories", {
        depth: 1,
        limit: 10,
        sort: "-publishedAt",
        draft: "false",
        "where[and][0][_status][equals]": "published",
        ...(currentStoryId ? { "where[and][1][id][not_equals]": String(currentStoryId) } : {}),
        ...(query.trim() ? { "where[and][2][headline][like]": query.trim() } : {})
      });
      return ((found?.docs as unknown[]) ?? []).flatMap((doc) => storyChoice(doc, timeZone, currentStoryId) ?? []);
    },
    loadStory: async (id: MediaId) => {
      const doc = await get(`/stories/${String(id)}`, { depth: 1, draft: "false" });
      return doc ? storyChoice(doc, timeZone, currentStoryId) : null;
    },
    searchPolls: async (query) => {
      const found = await get("/polls", { depth: 0, limit: 10, "where[and][0][status][in]": "open,closed", ...(query.trim() ? { "where[and][1][question][like]": query.trim() } : {}) });
      return ((found?.docs as Doc[]) ?? []).flatMap((doc) => pollChoice(doc) ?? []);
    },
    loadPoll: async (id: MediaId) => {
      const doc = await get(`/polls/${String(id)}`, { depth: 0 });
      return doc ? pollChoice(doc) : null;
    },
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
    editMediaDetails: async (id) => {
      const asset = await editDetails(Number(id));
      // Alt, credit or rights edits can change whether this Story is publishable.
      // The Media inspector is global, so refresh any open Story preflight after it closes.
      await queryClient.invalidateQueries({ queryKey: ["byline", "story-media-readiness"] });
      return asset ? articleMediaFromLibrary(asset) : null;
    },
    // The Media shell owns the one art-direction editor; blocks and the lead image only name a Media ID.
    editArtDirection: async (id) => (await editArtDirection(Number(id))) !== null
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `get` closes over `api` only
  }), [api, currentStoryId, custom.repositoryInteractives, editArtDirection, editDetails, fetchers, href, pick, queryClient, role, timeZone]);
}
