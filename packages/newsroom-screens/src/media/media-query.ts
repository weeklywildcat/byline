import { keepPreviousData, useInfiniteQuery, useQuery, type QueryClient } from "@tanstack/react-query";
import { mediaAssetKey, mediaFoldersKey, mediaLibraryKey, mediaLibraryRootKey, type MediaLibraryFetchers } from "./media-library-api";
import type { MediaAssetDetail, MediaLibraryAsset, MediaLibraryQuery } from "./media-library-model";

/** The navigator's one read (folders, counts, capabilities). Shared by the sidebar pane, the sheet and the screen. */
export function useMediaNavigator(fetchers: Pick<MediaLibraryFetchers, "getNavigator">) {
  return useQuery({ queryKey: mediaFoldersKey, queryFn: () => fetchers.getNavigator(), staleTime: 30_000 });
}

/**
 * The Library, page by page: never the whole collection at once. The
 * previous results stay on screen while a new filter loads, so the grid does
 * not flash empty or jump to the top.
 */
export function useMediaLibrary(fetchers: Pick<MediaLibraryFetchers, "getLibrary">, query: Omit<MediaLibraryQuery, "page">, enabled = true) {
  return useInfiniteQuery({
    queryKey: mediaLibraryKey(query),
    queryFn: ({ pageParam }) => fetchers.getLibrary({ ...query, page: pageParam }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.hasNextPage ? last.page + 1 : undefined),
    placeholderData: keepPreviousData,
    enabled
  });
}

/** How often an asset still preparing its publication files is re-read (modest; stops when terminal). */
export const PREPARING_REFRESH_MS = 4000;

/**
 * One asset's inspector detail. Selecting an asset already opened comes from
 * the cache. While its publication files are preparing it is re-read every
 * few seconds, so the inspector moves to Ready or Failed without a reload.
 */
export function useMediaAsset(fetchers: Pick<MediaLibraryFetchers, "getAsset">, id: number | null) {
  return useQuery({
    queryKey: mediaAssetKey(id ?? 0),
    queryFn: () => fetchers.getAsset(id!),
    enabled: id !== null,
    staleTime: 30_000,
    refetchInterval: (query) => (query.state.data?.publication?.state === "preparing" ? PREPARING_REFRESH_MS : false)
  });
}

/** After files change: Library pages and the navigator's counts, never Stories or Home. */
export function invalidateMediaLibrary(client: QueryClient) {
  return Promise.all([client.invalidateQueries({ queryKey: mediaLibraryRootKey }), client.invalidateQueries({ queryKey: mediaFoldersKey })]);
}

/** After one asset changes: its detail, and the row inside any cached Library page (no refetch storm). */
export function replaceCachedAsset(client: QueryClient, asset: MediaAssetDetail | MediaLibraryAsset) {
  if ("usages" in asset) client.setQueryData(mediaAssetKey(asset.id), asset);
  client.setQueriesData<{ pages: Array<{ assets: MediaLibraryAsset[] }>; pageParams: unknown[] }>({ queryKey: mediaLibraryRootKey }, (data) =>
    data ? { ...data, pages: data.pages.map((page) => ({ ...page, assets: page.assets.map((row) => (row.id === asset.id ? { ...row, ...stripDetail(asset) } : row)) })) } : data
  );
}

function stripDetail(asset: MediaAssetDetail | MediaLibraryAsset): MediaLibraryAsset {
  if (!("usages" in asset)) return asset;
  const { folderPath: _path, usages: _usages, usagesComplete: _complete, hiddenUsageCount: _hidden, publication: _publication, ...row } = asset;
  return row;
}
