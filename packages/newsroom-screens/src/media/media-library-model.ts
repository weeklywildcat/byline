/**
 * The Media Library's neutral contract: assets, folders, the browse query,
 * the navigator's data and the Media screen's address. CMS-independent and
 * React-free: the Payload newsroom produces these shapes from Payload Media
 * (apps/newsroom/src/newsroom/media-library.ts); the screens never see a CMS
 * record, a storage key or a raw query syntax.
 *
 * Two concepts share one Media destination and never mix:
 * - **Library**: files (Payload Media), browsed by Library scope (All media,
 *   Recent, Uploaded by me, Needs metadata, Unfiled) or by a real folder.
 * - **Work**: production assignments (photo, video, graphic, audio work),
 *   browsed by Work scope (`media-desk-model.ts`).
 */
import { isMediaWorkScope, type MediaWorkScope } from "./media-desk-model";

/* --------------------------------------------------------------- assets */

export type MediaKind = "image" | "audio" | "document" | "other";
export type MediaPublicationAssetState = "not-prepared" | "preparing" | "ready" | "failed";
/** A concrete, fixable metadata gap. Never a vague "not ready". */
export type MediaMetadataGap = "alt" | "credit" | "rights";

export type MediaPersonRef = { id: number; name: string };
export type MediaFolderRef = { id: number; name: string };

/** One Library row: enough to browse, never the inspector's detail. */
export type MediaLibraryAsset = {
  id: number;
  filename: string;
  mimeType: string;
  kind: MediaKind;
  filesize: number | null;
  width: number | null;
  height: number | null;
  /** The private browsing preview (small, protected). Null when there is none: never the full original. */
  previewUrl: string | null;
  /** The protected original (opens/downloads through the newsroom's access control). */
  url: string | null;
  alt: string;
  creator: string;
  credit: string;
  copyright: string;
  license: string;
  sourceUrl: string;
  /** Keywords for finding the file (normalized: lowercase, trimmed, unique; see `normalizeMediaTags`). */
  tags: string[];
  /** When the picture or recording was made (an instant; shown as a newsroom day). */
  capturedAt: string | null;
  createdAt: string;
  updatedAt: string;
  uploadedBy: MediaPersonRef | null;
  folder: MediaFolderRef | null;
  /** Whether Byline has web-ready files prepared for a static build. Upload and metadata edits never change it. */
  publicationAssets: MediaPublicationAssetState;
  gaps: MediaMetadataGap[];
  canUpdate: boolean;
  canDelete: boolean;
};

export type MediaUsageKind = "story-featured" | "story-body" | "production-assignment" | "collection-artwork" | "collection-resource" | "live-update-photo" | "person-portrait";

/** A record that links to the asset through a relationship. */
export type MediaUsage = {
  kind: MediaUsageKind;
  /** What the record is called ("AI jobs in Greenwood"). */
  title: string;
  /** How it uses the asset ("Featured image", "Photo assignment"). */
  role: string;
  /** The story it belongs to, when it belongs to one (opens Story Peek). */
  storyId: number | null;
  /** The Collection it belongs to, when it belongs to one. */
  collectionId?: number | null;
  recordId: number;
};

/**
 * The inspector's view of an asset's prepared publication files: what a
 * person can act on, never storage layout, hashes or the raw manifest.
 */
export type MediaPublicationDetail = {
  state: MediaPublicationAssetState;
  /** Why it is not ready (or "ready"). "stale-*": prepared files exist but are not current. */
  reason: "ready" | "not-prepared" | "preparing" | "failed" | "stale-revision" | "stale-recipe" | "invalid-manifest";
  /** How many times the source, focal point or custom crops have changed. */
  currentRevision: number;
  /** The revision the newest prepared files were made from. */
  preparedRevision: number | null;
  preparedAt: string | null;
  failureMessage: string | null;
  /** Things worth fixing that do not block publication (a soft social image). */
  warnings: string[];
  /** This account may queue preparation again. */
  canRetry: boolean;
};

export type MediaAssetDetail = MediaLibraryAsset & {
  publication: MediaPublicationDetail;
  /** Root first, the asset's own folder last. */
  folderPath: MediaFolderRef[];
  usages: MediaUsage[];
  /**
   * Usages come from relationships (featured images, assignments, coverage
   * artwork, live-update photos, portraits) and the canonical Byline article body.
   * Imported HTML and retained versions are not shown in this list.
   */
  usagesComplete: false;
  /** Records that link to the asset but this account may not read. */
  hiddenUsageCount: number;
};

/** The metadata an inspector edits. Files, sizes, hashes, art direction and publication-asset readiness are never edited here. */
export type MediaMetadataPatch = {
  alt?: string;
  creator?: string;
  credit?: string;
  copyright?: string;
  license?: string;
  sourceUrl?: string;
  /** A newsroom day (`YYYY-MM-DD`) or null. */
  capturedAt?: string | null;
  folderId?: number | null;
  /** The whole tag list (normalized on the server). */
  tags?: string[];
  /** Compare-and-swap: a stale edit is refused, never an overwrite. */
  expectedUpdatedAt?: string;
};

/**
 * The metadata the Library edits on several files at once: who made them and
 * their rights. Alt text describes one picture and is never applied in bulk;
 * the folder moves through `moveMedia`.
 */
export const MEDIA_BULK_FIELDS = ["creator", "credit", "copyright", "license", "sourceUrl"] as const;
export type MediaBulkField = (typeof MEDIA_BULK_FIELDS)[number];
export type MediaBulkPatch = Partial<Record<MediaBulkField, string>> & {
  /** Tags added to every file (each file keeps its other tags). */
  addTags?: string[];
  /** Tags removed from every file that has them. */
  removeTags?: string[];
};

/** The drag data type for Library files moved inside Byline (JSON array of Media IDs). */
export const MEDIA_DRAG_TYPE = "application/x-byline-media-ids";

/** The Media IDs a drag carries, or [] when it isn't a Byline files drag. */
export function draggedMediaIds(data: Pick<DataTransfer, "getData">): number[] {
  try {
    const value = JSON.parse(data.getData(MEDIA_DRAG_TYPE) || "[]") as unknown;
    return Array.isArray(value) ? value.map(Number).filter((id) => Number.isSafeInteger(id) && id > 0) : [];
  } catch {
    return [];
  }
}

/** Tags: short keywords, at most this many per file, each at most this long. */
export const MEDIA_TAGS_MAX = 30;
export const MEDIA_TAG_LENGTH = 40;

/**
 * One way to spell a tag everywhere: trimmed, inner whitespace collapsed,
 * lowercase (so "Football" and "football" are one tag), a leading "#"
 * dropped, no commas (they separate tags when typing), unique, in order.
 */
export function normalizeMediaTags(input: readonly unknown[] | null | undefined): string[] {
  const seen = new Set<string>();
  for (const raw of input ?? []) {
    if (typeof raw !== "string") continue;
    for (const part of raw.split(",")) {
      const tag = part.normalize("NFC").replace(/^#+/, "").replace(/\s+/g, " ").trim().toLowerCase().slice(0, MEDIA_TAG_LENGTH).trim();
      if (tag) seen.add(tag);
      if (seen.size >= MEDIA_TAGS_MAX) return [...seen];
    }
  }
  return [...seen];
}

/** A tag in use, with how many files have it (the tag picker's suggestions). */
export type MediaTagCount = { tag: string; count: number };

/** One result per file of a bulk action: each file is checked on its own, so some may be refused. */
export type MediaBulkResult = { done: number[]; failed: Array<{ id: number; message: string }> };

/** A rename: the new name without its extension (the type never changes), compare-and-swapped. */
export type MediaRenameInput = { name: string; expectedUpdatedAt?: string };

/** The longest file name a rename may ask for (before the extension). */
export const MEDIA_NAME_MAX = 160;

/** "band-at-homecoming.final.jpg" → { stem: "band-at-homecoming.final", extension: ".jpg" }. */
export function splitFilename(filename: string): { stem: string; extension: string } {
  const dot = filename.lastIndexOf(".");
  if (dot <= 0 || dot === filename.length - 1) return { stem: filename, extension: "" };
  return { stem: filename.slice(0, dot), extension: filename.slice(dot) };
}

/**
 * What a typed name becomes on disk (before uniqueness): no path separators,
 * control or reserved characters, no leading dots, whitespace collapsed, and
 * a repeated extension dropped ("photo.jpg" typed for a JPEG stays "photo").
 * Empty when nothing usable is left.
 */
export function cleanMediaName(input: string, extension: string): string {
  let name = input.normalize("NFC").replace(/[\u0000-\u001f\u007f<>:"/\\|?*]+/g, " ").replace(/\s+/g, " ").trim();
  if (extension && name.toLowerCase().endsWith(extension.toLowerCase())) name = name.slice(0, -extension.length).trim();
  name = name.replace(/^[. ]+/, "");
  let end = name.length;
  while (end > 0 && (name[end - 1] === "." || name[end - 1] === " ")) end -= 1;
  name = name.slice(0, end);
  return name.slice(0, MEDIA_NAME_MAX).trim();
}

export const MEDIA_METADATA_FIELDS = ["alt", "creator", "credit", "copyright", "license", "sourceUrl"] as const;
export type MediaMetadataField = (typeof MEDIA_METADATA_FIELDS)[number];

/** Field limits shared by the inspector and the server. */
export const MEDIA_FIELD_LIMITS: Record<MediaMetadataField, number> = { alt: 600, creator: 160, credit: 200, copyright: 200, license: 200, sourceUrl: 2000 };

export function mediaKind(mimeType: string | null | undefined): MediaKind {
  const type = (mimeType ?? "").toLowerCase();
  if (type.startsWith("image/")) return "image";
  if (type.startsWith("audio/")) return "audio";
  if (type === "application/pdf") return "document";
  return "other";
}

type GapInput = Pick<MediaLibraryAsset, "alt" | "credit" | "creator" | "copyright" | "license" | "sourceUrl"> & { mimeType: string | null | undefined };

/**
 * The same checks WordPress's media readiness makes, applied to Payload
 * fields: an image needs alt text and a credit (or creator); every file needs
 * some rights or source information (copyright, licence or source URL). This
 * names what is missing; it does not decide a rights policy.
 */
export function mediaMetadataGaps(asset: GapInput): MediaMetadataGap[] {
  const filled = (value: string | null | undefined) => Boolean(value && value.trim());
  const image = mediaKind(asset.mimeType) === "image";
  const gaps: MediaMetadataGap[] = [];
  if (image && !filled(asset.alt)) gaps.push("alt");
  if (image && !filled(asset.credit) && !filled(asset.creator)) gaps.push("credit");
  if (!filled(asset.copyright) && !filled(asset.license) && !filled(asset.sourceUrl)) gaps.push("rights");
  return gaps;
}

export const GAP_LABELS: Record<MediaMetadataGap, string> = { alt: "Missing alt text", credit: "Missing credit", rights: "Missing rights/source information" };

export const PUBLICATION_ASSET_LABELS: Record<MediaPublicationAssetState, string> = { "not-prepared": "Not prepared", preparing: "Preparing", ready: "Ready", failed: "Preparation failed" };

export const KIND_LABELS: Record<MediaKind, string> = { image: "Image", audio: "Audio", document: "PDF", other: "File" };

export function formatFilesize(bytes: number | null | undefined): string {
  if (!bytes || bytes < 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

/** "JPEG · 6000 × 4000 · 24 MB" */
export function assetFacts(asset: Pick<MediaLibraryAsset, "mimeType" | "width" | "height" | "filesize">): string {
  const raw = (asset.mimeType.split("/")[1] ?? "").toUpperCase();
  const subtype = raw === "MPEG" ? "MP3" : raw === "MP4" && asset.mimeType.startsWith("audio/") ? "M4A" : raw;
  return [subtype, asset.width && asset.height ? `${asset.width} × ${asset.height}` : "", formatFilesize(asset.filesize)].filter(Boolean).join(" · ");
}

/* -------------------------------------------------------------- folders */

/** One folder as the server lists it (flat). */
export type MediaFolder = { id: number; name: string; parentId: number | null; assetCount: number };

export type MediaFolderNode = MediaFolder & { children: MediaFolderNode[]; depth: number };

/** The flat list as a tree, siblings by name. A folder whose parent is missing becomes a root, so nothing is unreachable. */
export function buildFolderTree(folders: readonly MediaFolder[]): MediaFolderNode[] {
  const byId = new Map<number, MediaFolderNode>(folders.map((folder) => [folder.id, { ...folder, children: [], depth: 0 }]));
  const roots: MediaFolderNode[] = [];
  for (const node of byId.values()) {
    const parent = node.parentId !== null ? byId.get(node.parentId) : undefined;
    if (parent && parent !== node) parent.children.push(node);
    else roots.push(node);
  }
  const order = (nodes: MediaFolderNode[], depth: number, seen: Set<number>) => {
    nodes.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true }));
    for (const node of nodes) {
      node.depth = depth;
      if (seen.has(node.id)) {
        node.children = [];
        continue;
      }
      seen.add(node.id);
      order(node.children, depth + 1, seen);
    }
  };
  order(roots, 0, new Set());
  return roots;
}

/** Root first, the folder itself last. Stops at a missing parent or a cycle. */
export function folderPath(folders: readonly MediaFolder[], folderId: number | null): MediaFolder[] {
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const path: MediaFolder[] = [];
  const seen = new Set<number>();
  let current = folderId === null ? undefined : byId.get(folderId);
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    path.unshift(current);
    current = current.parentId === null ? undefined : byId.get(current.parentId);
  }
  return path;
}

/** A folder and everything below it (to rule out moving a folder into its own subtree). */
export function folderSubtreeIds(folders: readonly MediaFolder[], folderId: number): Set<number> {
  const ids = new Set<number>([folderId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const folder of folders) {
      if (folder.parentId !== null && ids.has(folder.parentId) && !ids.has(folder.id)) {
        ids.add(folder.id);
        grew = true;
      }
    }
  }
  return ids;
}

export function childFolderCount(folders: readonly MediaFolder[], folderId: number): number {
  return folders.filter((folder) => folder.parentId === folderId).length;
}

/* ---------------------------------------------------------- the query */

/** Library scopes: useful filters, never folders. */
export type MediaLibrarySource = "all" | "recent" | "mine" | "needs-metadata" | "unfiled";

export const MEDIA_LIBRARY_SOURCES: ReadonlyArray<{ value: MediaLibrarySource; label: string }> = [
  { value: "all", label: "All media" },
  { value: "recent", label: "Recent" },
  { value: "mine", label: "Uploaded by me" },
  { value: "needs-metadata", label: "Needs metadata" },
  { value: "unfiled", label: "Unfiled" }
];

/** "Recent" means uploaded in this many days. */
export const MEDIA_RECENT_DAYS = 14;

export function isMediaLibrarySource(value: unknown): value is MediaLibrarySource {
  return MEDIA_LIBRARY_SOURCES.some((source) => source.value === value);
}

export type MediaLibrarySort = "newest" | "oldest" | "name" | "captured";
export const MEDIA_SORTS: ReadonlyArray<{ value: MediaLibrarySort; label: string }> = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "captured", label: "Captured date" },
  { value: "name", label: "Name" }
];
export const isMediaSort = (value: unknown): value is MediaLibrarySort => MEDIA_SORTS.some((sort) => sort.value === value);

/** What the toolbar adds on top of a scope or folder. Temporary: never stored. */
export type MediaLibraryFilters = {
  search: string;
  /** Where a search looks when a folder is open: everywhere (default) or only in that folder. */
  searchScope: "all" | "folder";
  type: MediaKind | "";
  uploaderId: number | null;
  needsMetadata: boolean;
  /** Newsroom days, inclusive. */
  capturedFrom: string;
  capturedTo: string;
  publication: MediaPublicationAssetState | "";
  /** Files with this tag ("" for any). */
  tag: string;
};

export const EMPTY_MEDIA_FILTERS: MediaLibraryFilters = { search: "", searchScope: "all", type: "", uploaderId: null, needsMetadata: false, capturedFrom: "", capturedTo: "", publication: "", tag: "" };

/** One page request to the Library read model. */
export type MediaLibraryQuery = MediaLibraryFilters & {
  source: MediaLibrarySource;
  folderId: number | null;
  sort: MediaLibrarySort;
  page: number;
  limit: number;
};

export const MEDIA_PAGE_SIZE = 48;
export const MEDIA_PAGE_MAX = 100;

export type MediaLibraryPage = {
  assets: MediaLibraryAsset[];
  page: number;
  totalPages: number;
  totalDocs: number;
  hasNextPage: boolean;
};

export function activeFilterCount(filters: MediaLibraryFilters): number {
  return [filters.type, filters.uploaderId, filters.needsMetadata, filters.capturedFrom || filters.capturedTo, filters.publication, filters.tag].filter(Boolean).length;
}

/** Whether a search ignores the open folder (and scope) and looks across all media. */
export function searchesEverywhere(query: Pick<MediaLibraryQuery, "search" | "searchScope" | "folderId">): boolean {
  return query.search.trim() !== "" && query.folderId !== null && query.searchScope === "all";
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const positive = (value: string | null) => {
  const number = Number(value);
  return value !== null && Number.isSafeInteger(number) && number > 0 ? number : null;
};

/** The read model's query parameters (only what is set). */
export function mediaLibraryParams(query: MediaLibraryQuery): Record<string, string> {
  const params: Record<string, string> = {};
  if (query.folderId !== null) params.folder = String(query.folderId);
  else if (query.source !== "all") params.source = query.source;
  if (query.search.trim()) params.q = query.search.trim();
  if (query.search.trim() && query.folderId !== null && query.searchScope === "folder") params.within = "folder";
  if (query.type) params.type = query.type;
  if (query.uploaderId !== null) params.uploader = String(query.uploaderId);
  if (query.needsMetadata) params.metadata = "needs";
  if (query.capturedFrom) params.capturedFrom = query.capturedFrom;
  if (query.capturedTo) params.capturedTo = query.capturedTo;
  if (query.publication) params.publication = query.publication;
  if (query.tag) params.tag = query.tag;
  if (query.sort !== "newest") params.sort = query.sort;
  if (query.page > 1) params.page = String(query.page);
  if (query.limit !== MEDIA_PAGE_SIZE) params.limit = String(query.limit);
  return params;
}

/** The server side of `mediaLibraryParams`: anything unknown falls back to the default, never to raw query syntax. */
export function parseMediaLibraryParams(params: URLSearchParams): MediaLibraryQuery {
  const folderId = positive(params.get("folder"));
  const source = params.get("source");
  const type = params.get("type");
  const publication = params.get("publication");
  const sort = params.get("sort");
  const day = (value: string | null) => (value && DAY.test(value) ? value : "");
  const limit = positive(params.get("limit")) ?? MEDIA_PAGE_SIZE;
  return {
    folderId,
    source: folderId === null && isMediaLibrarySource(source) ? source : "all",
    search: (params.get("q") ?? "").trim().slice(0, 200),
    searchScope: params.get("within") === "folder" ? "folder" : "all",
    type: type === "image" || type === "audio" || type === "document" ? type : "",
    uploaderId: positive(params.get("uploader")),
    needsMetadata: params.get("metadata") === "needs",
    capturedFrom: day(params.get("capturedFrom")),
    capturedTo: day(params.get("capturedTo")),
    publication: publication === "not-prepared" || publication === "preparing" || publication === "ready" || publication === "failed" ? publication : "",
    tag: normalizeMediaTags([params.get("tag") ?? ""])[0] ?? "",
    sort: isMediaSort(sort) ? sort : "newest",
    page: positive(params.get("page")) ?? 1,
    limit: Math.min(limit, MEDIA_PAGE_MAX)
  };
}

/* ------------------------------------------------------------ navigator */

export type MediaLibraryCounts = Record<"all" | "recent" | "mine" | "needs-metadata" | "unfiled", number>;

export type MediaCapabilities = {
  canUpload: boolean;
  /** Create, rename, move and delete folders (editors). */
  canManageFolders: boolean;
  /** Delete any asset (editors). */
  canDelete: boolean;
  /** The file types the Library accepts (the server enforces the same list). */
  acceptedMimeTypes: string[];
  /** The largest file one upload may carry (the server's own limit). */
  maxUploadBytes: number;
};

/** Everything the Media navigator needs in one cheap read. */
export type MediaNavigatorData = {
  folders: MediaFolder[];
  counts: MediaLibraryCounts;
  capabilities: MediaCapabilities;
  uploaders: MediaPersonRef[];
};

/* ---------------------------------------------------- the screen address */

export type MediaView = "library" | "work";

/**
 * Where the Media screen is, as its address says it: bookmarkable and
 * Back/Forward-safe. A bare `/media` is Library → All media. Transient UI
 * (search text, filters, inspector width) is never in the address.
 *
 * /media                              Library, All media
 * /media?source=unfiled               Library, Unfiled
 * /media?folder=12                    Library, one folder
 * /media?view=work&scope=mine         Work, My assignments
 * /media?asset=456                    any of the above with an asset selected
 */
export type MediaRoute = { view: MediaView; source: MediaLibrarySource; folderId: number | null; scope: MediaWorkScope; assetId: number | null };

export const DEFAULT_MEDIA_ROUTE: MediaRoute = { view: "library", source: "all", folderId: null, scope: "mine", assetId: null };

export function parseMediaRoute(params: URLSearchParams | string): MediaRoute {
  const search = typeof params === "string" ? new URLSearchParams(params) : params;
  const view: MediaView = search.get("view") === "work" ? "work" : "library";
  const scope = search.get("scope");
  const source = search.get("source");
  const folderId = view === "library" ? positive(search.get("folder")) : null;
  return {
    view,
    folderId,
    source: view === "library" && folderId === null && isMediaLibrarySource(source) ? source : "all",
    scope: view === "work" && isMediaWorkScope(scope) ? scope : "mine",
    assetId: view === "library" ? positive(search.get("asset")) : null
  };
}

/** The canonical query string for a route (defaults omitted; `""` for Library → All media). */
export function mediaRouteSearch(route: MediaRoute): string {
  const params = new URLSearchParams();
  if (route.view === "work") {
    params.set("view", "work");
    params.set("scope", route.scope);
  } else {
    if (route.folderId !== null) params.set("folder", String(route.folderId));
    else if (route.source !== "all") params.set("source", route.source);
    if (route.assetId !== null) params.set("asset", String(route.assetId));
  }
  const text = params.toString();
  return text ? `?${text}` : "";
}

export function sameMediaRoute(a: MediaRoute, b: MediaRoute): boolean {
  return mediaRouteSearch(a) === mediaRouteSearch(b);
}

/* --------------------------------------------------------------- upload */

export type UploadStatus = "queued" | "uploading" | "done" | "failed";

/** Whether the Library accepts a file of this type (the server checks again). */
export function acceptsFile(file: Pick<File, "type" | "name">, accepted: readonly string[]): boolean {
  const type = file.type.toLowerCase();
  return Boolean(type) && accepted.includes(type);
}
