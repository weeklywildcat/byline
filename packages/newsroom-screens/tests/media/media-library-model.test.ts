import { describe, expect, it } from "vitest";
import {
  acceptsFile,
  assetFacts,
  buildFolderTree,
  cleanMediaName,
  draggedMediaIds,
  MEDIA_DRAG_TYPE,
  MEDIA_TAGS_MAX,
  normalizeMediaTags,
  DEFAULT_MEDIA_ROUTE,
  EMPTY_MEDIA_FILTERS,
  folderPath,
  folderSubtreeIds,
  MEDIA_PAGE_MAX,
  MEDIA_PAGE_SIZE,
  mediaLibraryParams,
  mediaMetadataGaps,
  mediaRouteSearch,
  parseMediaLibraryParams,
  parseMediaRoute,
  searchesEverywhere,
  splitFilename,
  type MediaFolder,
  type MediaLibraryQuery
} from "../../src/media/media-library-model";

const folders: MediaFolder[] = [
  { id: 1, name: "Sports", parentId: null, assetCount: 0 },
  { id: 2, name: "Football", parentId: 1, assetCount: 4 },
  { id: 3, name: "Homecoming", parentId: 2, assetCount: 1 },
  { id: 4, name: "basketball", parentId: 1, assetCount: 0 },
  { id: 5, name: "Arts", parentId: null, assetCount: 2 },
  // A parent that no longer exists: still reachable, as a root.
  { id: 6, name: "Orphan", parentId: 99, assetCount: 0 }
];

describe("the Media address", () => {
  it("is Library → All media when bare", () => {
    expect(parseMediaRoute("")).toEqual(DEFAULT_MEDIA_ROUTE);
    expect(mediaRouteSearch(DEFAULT_MEDIA_ROUTE)).toBe("");
  });

  it("round-trips folders, Library scopes, Work scopes and a selected asset", () => {
    for (const search of ["?folder=12", "?source=unfiled", "?source=needs-metadata&asset=7", "?folder=3&asset=456", "?view=work&scope=due", "?view=work&scope=mine"]) {
      expect(mediaRouteSearch(parseMediaRoute(search))).toBe(search);
    }
  });

  it("ignores what doesn't belong: unknown scopes, a source beside a folder, an asset on Work", () => {
    expect(parseMediaRoute("?source=folders")).toEqual(DEFAULT_MEDIA_ROUTE);
    expect(parseMediaRoute("?folder=4&source=mine")).toMatchObject({ folderId: 4, source: "all" });
    expect(parseMediaRoute("?view=work&scope=everything&asset=9")).toMatchObject({ view: "work", scope: "mine", assetId: null });
    expect(parseMediaRoute("?folder=-1&asset=abc")).toEqual(DEFAULT_MEDIA_ROUTE);
  });
});

describe("folders", () => {
  it("nest into a tree of real folders, siblings by name", () => {
    const tree = buildFolderTree(folders);
    expect(tree.map((node) => node.name)).toEqual(["Arts", "Orphan", "Sports"]);
    const sports = tree.find((node) => node.name === "Sports")!;
    expect(sports.children.map((node) => node.name)).toEqual(["basketball", "Football"]);
    expect(sports.children[1].children[0]).toMatchObject({ name: "Homecoming", depth: 2 });
  });

  it("never loop on a cycle", () => {
    const tree = buildFolderTree([{ id: 1, name: "A", parentId: 2, assetCount: 0 }, { id: 2, name: "B", parentId: 1, assetCount: 0 }, { id: 3, name: "C", parentId: null, assetCount: 0 }]);
    expect(tree.map((node) => node.name)).toEqual(["C"]);
    expect(folderPath([{ id: 1, name: "A", parentId: 2, assetCount: 0 }, { id: 2, name: "B", parentId: 1, assetCount: 0 }], 1).map((folder) => folder.name)).toEqual(["B", "A"]);
  });

  it("give a path from the root and a subtree to rule out moving a folder into itself", () => {
    expect(folderPath(folders, 3).map((folder) => folder.name)).toEqual(["Sports", "Football", "Homecoming"]);
    expect([...folderSubtreeIds(folders, 1)].sort()).toEqual([1, 2, 3, 4]);
  });
});

describe("metadata gaps", () => {
  const blank = { alt: "", credit: "", creator: "", copyright: "", license: "", sourceUrl: "" };
  it("name what an image is missing, concretely", () => {
    expect(mediaMetadataGaps({ ...blank, mimeType: "image/jpeg" })).toEqual(["alt", "credit", "rights"]);
    expect(mediaMetadataGaps({ ...blank, mimeType: "image/png", alt: "Chart", creator: "Pat", license: "CC BY 4.0" })).toEqual([]);
  });
  it("ask only for rights or a source on PDFs and audio", () => {
    expect(mediaMetadataGaps({ ...blank, mimeType: "application/pdf" })).toEqual(["rights"]);
    expect(mediaMetadataGaps({ ...blank, mimeType: "audio/mpeg", sourceUrl: "https://example.test" })).toEqual([]);
  });
  it("ignore whitespace-only values", () => {
    expect(mediaMetadataGaps({ ...blank, mimeType: "image/gif", alt: "  ", credit: "x", copyright: "x" })).toEqual(["alt"]);
  });
});

describe("the Library query", () => {
  const query = (patch: Partial<MediaLibraryQuery> = {}): MediaLibraryQuery => ({ ...EMPTY_MEDIA_FILTERS, source: "all", folderId: null, sort: "newest", page: 1, limit: MEDIA_PAGE_SIZE, ...patch });

  it("sends only what is set and parses back to the same query", () => {
    expect(mediaLibraryParams(query())).toEqual({});
    const full = query({ folderId: 4, search: "band", searchScope: "folder", type: "image", uploaderId: 9, needsMetadata: true, capturedFrom: "2026-11-01", capturedTo: "2026-11-05", publication: "ready", sort: "captured", page: 3 });
    expect(parseMediaLibraryParams(new URLSearchParams(mediaLibraryParams(full)))).toEqual(full);
    expect(parseMediaLibraryParams(new URLSearchParams(mediaLibraryParams(query({ source: "unfiled" }))))).toEqual(query({ source: "unfiled" }));
  });

  it("never passes raw query syntax through, and caps the page size", () => {
    const parsed = parseMediaLibraryParams(new URLSearchParams("where[filename][equals]=x&type=video&sort=-id&publication=leaked&delivery=private&capturedFrom=yesterday&limit=10000&folder=abc&source=everything"));
    expect(parsed).toEqual(query({ limit: MEDIA_PAGE_MAX }));
  });

  it("searches everywhere from a folder unless asked to stay in it", () => {
    expect(searchesEverywhere(query({ folderId: 4, search: "band" }))).toBe(true);
    expect(searchesEverywhere(query({ folderId: 4, search: "band", searchScope: "folder" }))).toBe(false);
    expect(searchesEverywhere(query({ search: "band" }))).toBe(false);
  });
});

describe("files", () => {
  it("are accepted only by the Library's own type list", () => {
    const accepted = ["image/jpeg", "application/pdf"];
    expect(acceptsFile({ type: "image/jpeg", name: "a.jpg" }, accepted)).toBe(true);
    expect(acceptsFile({ type: "video/mp4", name: "a.mp4" }, accepted)).toBe(false);
    expect(acceptsFile({ type: "", name: "a.heic" }, accepted)).toBe(false);
  });
  it("describe themselves briefly", () => {
    expect(assetFacts({ mimeType: "image/jpeg", width: 6000, height: 4000, filesize: 17_912_487 })).toBe("JPEG · 6000 × 4000 · 17 MB");
    expect(assetFacts({ mimeType: "audio/mpeg", width: null, height: null, filesize: 481_532 })).toBe("MP3 · 470 KB");
  });
});

describe("renaming", () => {
  it("keeps the extension apart from the editable name", () => {
    expect(splitFilename("band-at-homecoming.final.jpg")).toEqual({ stem: "band-at-homecoming.final", extension: ".jpg" });
    expect(splitFilename("README")).toEqual({ stem: "README", extension: "" });
    expect(splitFilename(".hidden")).toEqual({ stem: ".hidden", extension: "" });
  });
  it("cleans a typed name into a safe file name, never a path", () => {
    expect(cleanMediaName("  Homecoming   crowd ", ".jpg")).toBe("Homecoming crowd");
    expect(cleanMediaName("Homecoming crowd.JPG", ".jpg")).toBe("Homecoming crowd");
    expect(cleanMediaName("../../etc/passwd", ".jpg")).toBe("etc passwd");
    expect(cleanMediaName("a:b*c?d|e<f>g\"h", ".png")).toBe("a b c d e f g h");
    expect(cleanMediaName(" ../ ", ".jpg")).toBe("");
    expect(cleanMediaName("...", ".jpg")).toBe("");
    expect(cleanMediaName("x".repeat(400), ".jpg")).toHaveLength(160);
  });
});

describe("tags", () => {
  it("have one spelling: trimmed, lowercase, no leading #, split on commas, unique", () => {
    expect(normalizeMediaTags(["Football", " football ", "#Homecoming", "night   game, Stadium", "", 7, null])).toEqual(["football", "homecoming", "night game", "stadium"]);
    expect(normalizeMediaTags(["x".repeat(80)])[0]).toHaveLength(40);
    expect(normalizeMediaTags(Array.from({ length: 50 }, (_, index) => `tag ${index}`))).toHaveLength(MEDIA_TAGS_MAX);
  });
  it("travel in the Library query and are normalized when parsed", () => {
    const params = mediaLibraryParams({ ...EMPTY_MEDIA_FILTERS, source: "all", folderId: null, sort: "newest", page: 1, limit: MEDIA_PAGE_SIZE, tag: "football" });
    expect(params.tag).toBe("football");
    expect(parseMediaLibraryParams(new URLSearchParams("tag=%23Football%20")).tag).toBe("football");
    expect(parseMediaLibraryParams(new URLSearchParams("")).tag).toBe("");
  });
});

describe("dragging files", () => {
  const data = (value: string) => ({ getData: (type: string) => (type === MEDIA_DRAG_TYPE ? value : "") });
  it("carries Media IDs and nothing else", () => {
    expect(draggedMediaIds(data("[3,4,\"5\"]"))).toEqual([3, 4, 5]);
    expect(draggedMediaIds(data("[-1,0,1.5,\"x\"]"))).toEqual([]);
    expect(draggedMediaIds(data("not json"))).toEqual([]);
    expect(draggedMediaIds(data(""))).toEqual([]);
  });
});
