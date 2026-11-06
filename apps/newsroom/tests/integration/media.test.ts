import { buildFolderTree, EMPTY_MEDIA_FILTERS, MEDIA_PAGE_SIZE, type MediaLibraryQuery } from "@byline/newsroom-screens/media/media-library-model";
import { createLocalReq, getPayload, type Endpoint, type Payload, type PayloadRequest } from "payload";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { newsroomEndpoints } from "../../src/newsroom/endpoints";
import { screenContext } from "../../src/newsroom/screen-models";
import type { Media, User } from "../../src/payload-types";

/**
 * Byline Media over Payload: native folders (access, structure, safe delete),
 * the Library read model (search, filters, pagination, detail, linked uses,
 * metadata edits, delete), the private library preview, uploads, and Media
 * Work (production assignments) as each account may see them.
 */
let payload: Payload;
const accounts: Record<string, User> = {};
const people: Record<string, number> = {};
const TZ = "America/New_York";
const NOW = new Date("2026-11-06T15:00:00Z");

async function account(key: string, role: User["role"], person = true) {
  if (person) people[key] = (await payload.create({ collection: "people", data: { name: `${key} Person`, slug: `media-${key}`, status: "active" } })).id;
  const user = await payload.create({ collection: "users", data: { email: `media-${key}@example.test`, password: `pw-${key}-123456`, name: `${key} Account`, role, enabled: true, linkedPerson: people[key] ?? null } });
  accounts[key] = { ...user, collection: "users" } as User;
}

const reqAs = (key: string | null, extra: Partial<PayloadRequest> = {}) => (key ? createLocalReq({ user: accounts[key], req: extra }, payload) : createLocalReq({ req: extra }, payload));

async function call(method: string, routePath: string, key: string | null, options: { data?: unknown; params?: Record<string, string>; query?: string; file?: PayloadRequest["file"] } = {}) {
  const endpoint = newsroomEndpoints.find((candidate) => candidate.method === method && candidate.path === routePath);
  if (!endpoint) throw new Error(`No endpoint ${method} ${routePath}`);
  const req = await reqAs(key);
  Object.assign(req, { routeParams: options.params ?? {}, data: options.data, searchParams: new URLSearchParams(options.query ?? ""), file: options.file });
  const response = (await endpoint.handler(req)) as Response;
  return { status: response.status, body: response.status === 204 ? null : await response.json() };
}

/** A real JPEG of a given size: noise, so it compresses like a photograph rather than a flat fixture. */
async function photo(width: number, height: number, name: string, quality = 92) {
  const data = await sharp({ create: { width, height, channels: 3, noise: { type: "gaussian", mean: 128, sigma: 40 } } }).jpeg({ quality }).toBuffer();
  return { data, mimetype: "image/jpeg", name, size: data.length };
}

/** A minimal well-formed one-page PDF (Payload checks the header, the xref table and %%EOF). */
function pdf() {
  const objects = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>", "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>"];
  let body = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((object, index) => {
    offsets.push(body.length);
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}`;
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  const data = Buffer.from(body, "latin1");
  return { data, mimetype: "application/pdf", name: "board-minutes.pdf", size: data.length };
}

async function upload(key: string, file: NonNullable<PayloadRequest["file"]>, folderId: number | null = null, metadata: Partial<Media> = {}) {
  const result = await call("post", "/byline/media/upload", key, { data: { folderId }, file });
  if (result.status !== 200) throw new Error(`upload failed: ${JSON.stringify(result.body)}`);
  const id = result.body.id as number;
  if (Object.keys(metadata).length) await payload.update({ collection: "media", id, data: metadata, overrideAccess: true });
  return id;
}

const library = async (key: string, query: Partial<MediaLibraryQuery> = {}) => {
  const params = new URLSearchParams();
  const { mediaLibraryParams } = await import("@byline/newsroom-screens/media/media-library-model");
  for (const [name, value] of Object.entries(mediaLibraryParams({ ...EMPTY_MEDIA_FILTERS, source: "all", folderId: null, sort: "newest", page: 1, limit: MEDIA_PAGE_SIZE, ...query }))) params.set(name, value);
  const result = await call("get", "/byline/media", key, { query: params.toString() });
  expect(result.status).toBe(200);
  return result.body as { assets: Array<{ id: number; filename: string; gaps: string[]; canUpdate: boolean; canDelete: boolean; previewUrl: string | null; url: string | null; folder: { id: number } | null }>; totalDocs: number; totalPages: number; hasNextPage: boolean; page: number };
};
const names = (page: { assets: Array<{ filename: string }> }) => page.assets.map((asset) => asset.filename).sort();

const folder = async (key: string, name: string, parentId: number | null = null) => call("post", "/byline/media/folders", key, { data: { name, parentId } });

const ids: Record<string, number> = {};
const folders: Record<string, number> = {};

beforeAll(async () => {
  const url = new URL(process.env.DATABASE_URL!);
  url.pathname = `${url.pathname}_media`;
  process.env.DATABASE_URL = url.toString();
  const { default: config } = await import("../../src/payload.config");
  payload = await getPayload({ config });
  await account("editor", "editor");
  await account("alice", "staff");
  await account("bob", "staff");
  await account("photo", "staff", false);

  folders.sports = (await folder("editor", "Sports")).body.id;
  folders.football = (await folder("editor", "Football", folders.sports)).body.id;
  folders.homecoming = (await folder("editor", "Homecoming", folders.football)).body.id;
  folders.arts = (await folder("editor", "Arts")).body.id;

  ids.camera = await upload("alice", await photo(6000, 4000, "IMG_4932.jpg"), folders.football, { alt: "Quarterback throws", credit: "Alice / The Weekly Wildcat", copyright: "© 2026 The Weekly Wildcat", capturedAt: "2026-11-04T17:00:00.000Z" });
  ids.small = await upload("alice", await photo(320, 240, "thumb-sized.jpg", 80), null);
  ids.png = await upload("bob", { data: await sharp({ create: { width: 900, height: 600, channels: 4, background: "#2a6" } }).png().toBuffer(), mimetype: "image/png", name: "chart.png", size: 0 }, folders.arts, { alt: "Budget chart", credit: "Bob", license: "CC BY 4.0" });
  ids.pdf = await upload("editor", pdf(), null, { sourceUrl: "https://example.test/minutes" });
  ids.gif = await upload("bob", { data: await sharp({ create: { width: 200, height: 200, channels: 3, background: "#f80" } }).gif().toBuffer(), mimetype: "image/gif", name: "loading.gif", size: 0 }, folders.homecoming, { alt: "Spinner", creator: "Bob" });
}, 300_000);

afterAll(async () => {
  await payload?.db?.destroy?.();
});

describe("native folders", () => {
  it("are Payload's own folder collection on Media, with no Byline folder schema", () => {
    expect(payload.collections["payload-folders"]).toBeDefined();
    expect(payload.config.folders && payload.config.folders.slug).toBe("payload-folders");
    expect(payload.collections.media.config.fields.some((field) => "name" in field && field.name === "folder")).toBe(true);
    for (const slug of ["media-folders", "media-folder-relations"]) expect(payload.collections[slug as "media"]).toBeUndefined();
    expect(payload.collections.media.config.fields.some((field) => "name" in field && (field.name === "folderPath" || field.name === "parentFolder"))).toBe(false);
  });

  it("form a nested tree every signed-in account can read", async () => {
    const navigator = await call("get", "/byline/media/navigator", "bob");
    expect(navigator.status).toBe(200);
    const tree = buildFolderTree(navigator.body.folders);
    expect(tree.map((node) => node.name)).toEqual(["Arts", "Sports"]);
    const sports = tree.find((node) => node.name === "Sports")!;
    expect(sports.children.map((node) => node.name)).toEqual(["Football"]);
    expect(sports.children[0].children.map((node) => node.name)).toEqual(["Homecoming"]);
    expect(navigator.body.folders.find((item: { id: number }) => item.id === folders.football).assetCount).toBe(1);
    expect(navigator.body.capabilities).toMatchObject({ canUpload: true, canManageFolders: false, canDelete: false });
    expect((await call("get", "/byline/media/navigator", "editor")).body.capabilities.canManageFolders).toBe(true);
    expect((await call("get", "/byline/media/navigator", null)).status).toBe(401);
  });

  it("are created, renamed, moved and deleted by editors only", async () => {
    expect((await folder("alice", "Alice's folder")).status).toBe(403);
    expect((await call("patch", "/byline/media/folders/:id", "alice", { params: { id: String(folders.arts) }, data: { name: "Renamed" } })).status).toBe(403);
    expect((await call("patch", "/byline/media/folders/:id", "alice", { params: { id: String(folders.homecoming) }, data: { parentId: null } })).status).toBe(403);
    expect((await call("delete", "/byline/media/folders/:id", "alice", { params: { id: String(folders.arts) } })).status).toBe(403);
    // The raw collection refuses too (no Byline endpoint needed to enforce it).
    await expect(payload.create({ collection: "payload-folders", data: { name: "Sneaky" }, overrideAccess: false, req: await reqAs("alice") })).rejects.toThrow();

    const renamed = await call("patch", "/byline/media/folders/:id", "editor", { params: { id: String(folders.arts) }, data: { name: "  Arts &   Culture " } });
    expect(renamed.status).toBe(200);
    expect(renamed.body).toMatchObject({ name: "Arts & Culture", parentId: null, assetCount: 1 });
  });

  it("keep sibling names distinct and refuse a move into the folder's own subtree", async () => {
    expect((await folder("editor", "sports")).status).toBe(400);
    const elsewhere = await folder("editor", "Sports", folders.arts);
    expect(elsewhere.status).toBe(200);
    expect((await call("patch", "/byline/media/folders/:id", "editor", { params: { id: String(folders.sports) }, data: { parentId: folders.homecoming } })).status).toBe(400);
    expect((await call("patch", "/byline/media/folders/:id", "editor", { params: { id: String(folders.sports) }, data: { parentId: folders.sports } })).status).toBe(400);
    // A real reparent: Homecoming moves up beside Football, and its asset goes with it untouched.
    const moved = await call("patch", "/byline/media/folders/:id", "editor", { params: { id: String(folders.homecoming) }, data: { parentId: folders.sports } });
    expect(moved.body.parentId).toBe(folders.sports);
    const gif = await payload.findByID({ collection: "media", id: ids.gif, depth: 0 });
    expect(Number(gif.folder)).toBe(folders.homecoming);
    expect((await call("delete", "/byline/media/folders/:id", "editor", { params: { id: String(elsewhere.body.id) } })).status).toBe(204);
  });

  it("refuse to delete a folder that still holds files or subfolders", async () => {
    // Files: Football holds the camera original.
    const withFiles = await call("delete", "/byline/media/folders/:id", "editor", { params: { id: String(folders.football) } });
    expect(withFiles.status).toBe(409);
    expect(withFiles.body.message).toContain("1 file");
    // Subfolders only: a parent whose child is empty.
    const parent = (await folder("editor", "Archive")).body.id;
    const child = (await folder("editor", "2025", parent)).body.id;
    const withChild = await call("delete", "/byline/media/folders/:id", "editor", { params: { id: String(parent) } });
    expect(withChild.status).toBe(409);
    expect(withChild.body.message).toContain("1 subfolder");
    // Empty folders go; nothing else changes.
    const before = (await payload.count({ collection: "media" })).totalDocs;
    expect((await call("delete", "/byline/media/folders/:id", "editor", { params: { id: String(child) } })).status).toBe(204);
    expect((await call("delete", "/byline/media/folders/:id", "editor", { params: { id: String(parent) } })).status).toBe(204);
    expect((await payload.count({ collection: "media" })).totalDocs).toBe(before);
    expect((await payload.findByID({ collection: "media", id: ids.camera, depth: 0 })).folder).toBe(folders.football);
    // Root-level files are untouched by any of it.
    expect((await payload.findByID({ collection: "media", id: ids.pdf, depth: 0 })).folder ?? null).toBeNull();
  });

  it("file assets through Media's own access: staff move their own uploads, editors any", async () => {
    const own = await call("post", "/byline/media/move", "alice", { data: { ids: [ids.small], folderId: folders.arts } });
    expect(own.body).toEqual({ moved: [ids.small], failed: [] });
    const others = await call("post", "/byline/media/move", "alice", { data: { ids: [ids.png], folderId: folders.sports } });
    expect(others.body.moved).toEqual([]);
    expect(others.body.failed[0]).toMatchObject({ id: ids.png, message: "You can only move files you uploaded." });
    expect(Number((await payload.findByID({ collection: "media", id: ids.png, depth: 0 })).folder)).toBe(folders.arts);
    const editor = await call("post", "/byline/media/move", "editor", { data: { ids: [ids.small], folderId: null } });
    expect(editor.body.moved).toEqual([ids.small]);
    // A folder that doesn't exist is a clear 400, never a database error.
    expect((await call("post", "/byline/media/move", "alice", { data: { ids: [ids.small], folderId: 999999 } })).status).toBe(400);
    // Moving through the metadata write follows the same rule.
    expect((await call("patch", "/byline/media/:id", "alice", { params: { id: String(ids.png) }, data: { folderId: null } })).status).toBe(403);
  });
});

describe("the private library preview", () => {
  it("is a small WebP rendition of every image, never the original", async () => {
    const camera = await payload.findByID({ collection: "media", id: ids.camera, depth: 0 });
    const preview = camera.sizes?.library;
    expect(preview?.mimeType).toBe("image/webp");
    expect(Math.max(preview?.width ?? 0, preview?.height ?? 0)).toBeLessThanOrEqual(640);
    expect(camera.filesize).toBeGreaterThan(5_000_000);
    expect(preview?.filesize ?? Infinity).toBeLessThan(camera.filesize! / 20);
    const page = await library("bob", { search: "IMG_4932" });
    const asset = page.assets[0];
    expect(asset.previewUrl).toBe(preview?.url);
    expect(asset.previewUrl).not.toBe(asset.url);
    // A small image is not enlarged; it still gets its own preview file.
    const small = await payload.findByID({ collection: "media", id: ids.small, depth: 0 });
    expect(small.sizes?.library?.width).toBe(320);
    // No public rendition was made, and nothing is public.
    expect(camera.publicDelivery?.status ?? "private").toBe("private");
    expect(camera.publicDelivery?.renditions ?? null).toBeNull();
  });

  it("is served under the same access as the original", async () => {
    const camera = await payload.findByID({ collection: "media", id: ids.camera, depth: 0 });
    const endpoint = (payload.collections.media.config.endpoints as Endpoint[]).find((candidate) => candidate.path === "/file/:filename")!;
    const get = async (key: string | null, filename: string) => {
      const req = await reqAs(key);
      Object.assign(req, { routeParams: { collection: "media", filename }, searchParams: new URLSearchParams() });
      try {
        return ((await endpoint.handler(req)) as Response).status;
      } catch (error) {
        return (error as { status?: number }).status ?? 500;
      }
    };
    expect(await get(null, camera.filename!)).toBe(403);
    expect(await get(null, camera.sizes!.library!.filename!)).toBe(403);
    expect(await get("bob", camera.sizes!.library!.filename!)).toBe(200);
  });
});

describe("the Library read model", () => {
  it("lists newest first with pagination and never exposes storage internals", async () => {
    const first = await library("bob", { limit: 2 });
    expect(first.totalDocs).toBe(5);
    expect(first.totalPages).toBe(3);
    expect(first.hasNextPage).toBe(true);
    expect(first.assets.map((asset) => asset.id)).toEqual([ids.gif, ids.pdf]);
    const third = await library("bob", { limit: 2, page: 3 });
    expect(third.assets.map((asset) => asset.id)).toEqual([ids.camera]);
    const raw = JSON.stringify(first);
    for (const secret of ["contentHash", "renditions", "artDirection", "staticDir", "prefix"]) expect(raw).not.toContain(secret);
  });

  it("searches filenames and metadata, across all media or within the open folder", async () => {
    expect(names(await library("bob", { search: "quarterback" }))).toEqual(["IMG_4932.jpg"]);
    expect(names(await library("bob", { search: "weekly wildcat" }))).toEqual(["IMG_4932.jpg"]);
    expect(names(await library("bob", { search: "CC BY" }))).toEqual(["chart.png"]);
    expect(names(await library("bob", { search: "minutes" }))).toEqual(["board-minutes.pdf"]);
    // From a folder, a search looks everywhere unless asked to stay.
    expect(names(await library("bob", { folderId: folders.arts, search: "quarterback" }))).toEqual(["IMG_4932.jpg"]);
    expect(names(await library("bob", { folderId: folders.arts, search: "quarterback", searchScope: "folder" }))).toEqual([]);
  });

  it("browses a folder, Unfiled, Uploaded by me and Recent", async () => {
    expect(names(await library("bob", { folderId: folders.football }))).toEqual(["IMG_4932.jpg"]);
    expect(names(await library("bob", { source: "unfiled" }))).toEqual(["board-minutes.pdf", "thumb-sized.jpg"]);
    expect(names(await library("bob", { source: "mine" }))).toEqual(["chart.png", "loading.gif"]);
    expect((await library("bob", { source: "recent" })).totalDocs).toBe(5);
  });

  it("filters by type, uploader, captured date and delivery state", async () => {
    expect(names(await library("bob", { type: "document" }))).toEqual(["board-minutes.pdf"]);
    expect((await library("bob", { type: "image" })).totalDocs).toBe(4);
    expect(names(await library("bob", { uploaderId: Number(accounts.alice.id) }))).toEqual(["IMG_4932.jpg", "thumb-sized.jpg"]);
    // 17:00 UTC on Nov 4 is Nov 4 in New York.
    expect(names(await library("bob", { capturedFrom: "2026-11-04", capturedTo: "2026-11-04" }))).toEqual(["IMG_4932.jpg"]);
    expect(names(await library("bob", { capturedFrom: "2026-11-05" }))).toEqual([]);
    expect((await library("bob", { delivery: "private" })).totalDocs).toBe(5);
    expect((await library("bob", { delivery: "public" })).totalDocs).toBe(0);
  });

  it("names concrete metadata gaps and finds the files that have them", async () => {
    const page = await library("bob");
    const gaps = new Map(page.assets.map((asset) => [asset.filename, asset.gaps]));
    expect(gaps.get("IMG_4932.jpg")).toEqual([]);
    expect(gaps.get("thumb-sized.jpg")).toEqual(["alt", "credit", "rights"]);
    expect(gaps.get("chart.png")).toEqual([]);
    expect(gaps.get("board-minutes.pdf")).toEqual([]);
    expect(gaps.get("loading.gif")).toEqual(["rights"]);
    expect(names(await library("bob", { source: "needs-metadata" }))).toEqual(["loading.gif", "thumb-sized.jpg"]);
    expect(names(await library("bob", { needsMetadata: true, folderId: folders.homecoming }))).toEqual(["loading.gif"]);
    expect((await call("get", "/byline/media/navigator", "bob")).body.counts).toMatchObject({ all: 5, "needs-metadata": 2, unfiled: 2, mine: 2 });
  });

  it("says who may change and delete each file", async () => {
    const page = await library("alice");
    const rights = new Map(page.assets.map((asset) => [asset.filename, [asset.canUpdate, asset.canDelete]]));
    expect(rights.get("IMG_4932.jpg")).toEqual([true, false]);
    expect(rights.get("chart.png")).toEqual([false, false]);
    expect((await library("editor")).assets.every((asset) => asset.canUpdate && asset.canDelete)).toBe(true);
  });
});

describe("one asset", () => {
  it("is deep-linkable with its folder path", async () => {
    const detail = await call("get", "/byline/media/:id", "bob", { params: { id: String(ids.gif) } });
    expect(detail.status).toBe(200);
    expect(detail.body.folderPath.map((item: { name: string }) => item.name)).toEqual(["Sports", "Homecoming"]);
    expect(detail.body.usagesComplete).toBe(false);
    expect((await call("get", "/byline/media/:id", "bob", { params: { id: "999999" } })).status).toBe(404);
  });

  it("takes metadata edits from its uploader and editors only, with compare-and-swap", async () => {
    const before = await call("get", "/byline/media/:id", "alice", { params: { id: String(ids.small) } });
    const saved = await call("patch", "/byline/media/:id", "alice", { params: { id: String(ids.small) }, data: { alt: "Team photo", credit: "Alice", sourceUrl: "https://example.test/photo", capturedAt: "2026-11-02", expectedUpdatedAt: before.body.updatedAt } });
    expect(saved.status).toBe(200);
    expect(saved.body).toMatchObject({ alt: "Team photo", credit: "Alice", sourceUrl: "https://example.test/photo", gaps: [] });
    expect(saved.body.capturedAt).toBe("2026-11-02T17:00:00.000Z");
    // A stale edit is refused.
    expect((await call("patch", "/byline/media/:id", "alice", { params: { id: String(ids.small) }, data: { alt: "Stale", expectedUpdatedAt: before.body.updatedAt } })).status).toBe(409);
    // Someone else's upload.
    expect((await call("patch", "/byline/media/:id", "alice", { params: { id: String(ids.png) }, data: { alt: "Not mine" } })).status).toBe(403);
    expect((await call("patch", "/byline/media/:id", "editor", { params: { id: String(ids.png) }, data: { alt: "Budget chart, 2026" } })).status).toBe(200);
    // Validation.
    expect((await call("patch", "/byline/media/:id", "alice", { params: { id: String(ids.small) }, data: { sourceUrl: "javascript:alert(1)" } })).status).toBe(400);
    expect((await call("patch", "/byline/media/:id", "alice", { params: { id: String(ids.small) }, data: { alt: "x".repeat(601) } })).status).toBe(400);
    // Delivery and attribution never change through a metadata edit or a raw update.
    await payload.update({ collection: "media", id: ids.small, data: { publicDelivery: { status: "public" }, uploadedBy: accounts.bob.id } as never, overrideAccess: false, req: await reqAs("alice") });
    const raw = await payload.findByID({ collection: "media", id: ids.small, depth: 0 });
    expect(raw.publicDelivery?.status ?? "private").toBe("private");
    expect(raw.uploadedBy).toBe(accounts.alice.id);
  });

  it("lists its linked uses, as far as this account may read them", async () => {
    const story = await payload.create({ collection: "stories", draft: true, data: { headline: "AI jobs in Greenwood", featuredMedia: ids.camera } as never, req: await reqAs("editor"), overrideAccess: false });
    await payload.create({ collection: "production-assignments", data: { story: story.id, title: "State championship photos", type: "photo", status: "uploaded", media: [ids.camera] } as never, req: await reqAs("editor"), overrideAccess: false });
    const coverage = await payload.create({ collection: "coverages", data: { title: "SCBDA live coverage", artwork: ids.camera } as never, req: await reqAs("editor"), overrideAccess: false });
    expect(coverage.id).toBeGreaterThan(0);
    const editor = await call("get", "/byline/media/:id", "editor", { params: { id: String(ids.camera) } });
    expect(editor.body.usages.map((use: { kind: string; title: string }) => `${use.kind}:${use.title}`).sort()).toEqual([
      "coverage-artwork:SCBDA live coverage",
      "production-assignment:AI jobs in Greenwood",
      "story-featured:AI jobs in Greenwood"
    ]);
    expect(editor.body.usages.find((use: { kind: string }) => use.kind === "story-featured").storyId).toBe(story.id);
    expect(editor.body.hiddenUsageCount).toBe(0);
    // Bob manages none of it: he sees the coverage (readable by all) and is told the rest exists.
    const bob = await call("get", "/byline/media/:id", "bob", { params: { id: String(ids.camera) } });
    expect(bob.body.usages.map((use: { kind: string }) => use.kind)).toEqual(["coverage-artwork"]);
    expect(bob.body.hiddenUsageCount).toBe(2);
  });

  it("is deleted by editors only, and never while something links to it", async () => {
    expect((await call("delete", "/byline/media/:id", "alice", { params: { id: String(ids.small) } })).status).toBe(403);
    const linked = await call("delete", "/byline/media/:id", "editor", { params: { id: String(ids.camera) } });
    expect(linked.status).toBe(409);
    expect(linked.body.message).toContain("linked from 3 places");
    expect((await call("delete", "/byline/media/:id", "editor", { params: { id: String(ids.small) } })).status).toBe(204);
    expect((await payload.count({ collection: "media", where: { id: { equals: ids.small } } })).totalDocs).toBe(0);
  });
});

describe("upload", () => {
  it("needs a signed-in account", async () => {
    expect((await call("post", "/byline/media/upload", null, { data: {}, file: await photo(100, 100, "anon.jpg") })).status).toBe(401);
  });

  it("files into the chosen folder, attributes the uploader and leaves delivery alone", async () => {
    const result = await call("post", "/byline/media/upload", "photo", { data: { folderId: folders.homecoming, uploadedBy: accounts.editor.id, publicDelivery: { status: "public" } }, file: await photo(1600, 1200, "sideline.jpg") });
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ filename: "sideline.jpg", folder: { id: folders.homecoming }, uploadedBy: { id: Number(accounts.photo.id) }, publicDelivery: "private", canUpdate: true, canDelete: false });
    expect(result.body.previewUrl).toContain("640x480");
    // The uploader may then edit it; another staff member may not.
    expect((await call("patch", "/byline/media/:id", "photo", { params: { id: String(result.body.id) }, data: { alt: "Sideline" } })).status).toBe(200);
    expect((await call("patch", "/byline/media/:id", "alice", { params: { id: String(result.body.id) }, data: { alt: "Mine now" } })).status).toBe(403);
  });

  it("refuses file types Media does not accept, and a missing folder", async () => {
    const text = Buffer.from("not media");
    expect((await call("post", "/byline/media/upload", "photo", { data: {}, file: { data: text, mimetype: "text/plain", name: "notes.txt", size: text.length } })).status).toBe(400);
    const video = Buffer.alloc(64);
    expect((await call("post", "/byline/media/upload", "photo", { data: {}, file: { data: video, mimetype: "video/mp4", name: "clip.mp4", size: video.length } })).status).toBe(400);
    expect((await call("post", "/byline/media/upload", "photo", { data: { folderId: 999999 }, file: await photo(100, 100, "lost.jpg") })).status).toBe(400);
    // A file that lies about its type is caught by Payload's own content check.
    expect((await call("post", "/byline/media/upload", "photo", { data: {}, file: { data: text, mimetype: "image/jpeg", name: "fake.jpg", size: text.length } })).status).toBeGreaterThanOrEqual(400);
  });
});

describe("Media Work", () => {
  let budget: number;
  let privateStory: number;
  beforeAll(async () => {
    budget = (await payload.create({ collection: "stories", draft: true, data: { headline: "Budget vote delayed", contributors: [people.alice] }, req: await reqAs("alice"), overrideAccess: false })).id;
    privateStory = (await payload.create({ collection: "stories", draft: true, data: { headline: "Editor's private story" }, req: await reqAs("editor"), overrideAccess: false })).id;
    const create = async (story: number, data: Record<string, unknown>) => payload.create({ collection: "production-assignments", data: { story, ...data } as never, req: await reqAs("editor"), overrideAccess: false });
    await create(budget, { title: "Council photos", type: "photo", status: "assigned", deadline: "2026-11-07T17:00:00.000Z", assignees: [accounts.photo.id] });
    await create(budget, { title: "Budget chart", type: "graphic", status: "in-progress", media: [ids.png] });
    await create(privateStory, { title: "Portraits", type: "photo", status: "needed", deadline: "2026-11-20T17:00:00.000Z", assignees: [accounts.photo.id] });
    await create(privateStory, { title: "Secret b-roll", type: "video", status: "needed" });
  });

  const work = async (key: string) => {
    const result = await call("get", "/byline/media/work", key);
    expect(result.status).toBe(200);
    return result.body as { assignments: Array<{ id: string; title: string; story: { id: number; title: string }; attachments: Array<{ id: number; checks: Record<string, boolean>; previewUrl: string | null }>; status: string }>; capabilities: { canAssign: boolean }; timezone: string };
  };
  const titles = (body: Awaited<ReturnType<typeof work>>) => body.assignments.map((row) => row.title).sort();

  it("shows editors every assignment in the newsroom", async () => {
    const body = await work("editor");
    expect(titles(body)).toEqual(["Budget chart", "Council photos", "Portraits", "Secret b-roll", "State championship photos"]);
    expect(body.capabilities.canAssign).toBe(true);
    expect(body.timezone).toBe(process.env.BYLINE_NEWSROOM_TIMEZONE ?? body.timezone);
  });

  it("shows staff only the work Story Work access gives them", async () => {
    // Alice manages the budget story: both of its assignments, nothing on the editor's story.
    expect(titles(await work("alice"))).toEqual(["Budget chart", "Council photos"]);
    // The photographer holds one assignment on each story and manages neither.
    const photographer = await work("photo");
    expect(titles(photographer)).toEqual(["Council photos", "Portraits"]);
    expect(photographer.capabilities.canAssign).toBe(false);
    // Bob has nothing.
    expect((await work("bob")).assignments).toEqual([]);
  });

  it("names the story and checks the linked files", async () => {
    const chart = (await work("alice")).assignments.find((row) => row.title === "Budget chart")!;
    expect(chart.story).toMatchObject({ id: budget, title: "Budget vote delayed" });
    expect(chart.attachments[0]).toMatchObject({ id: ids.png, checks: { alt: true, credit: true, rights: true } });
    expect(chart.attachments[0].previewUrl).toMatch(/-640x427\.webp$/);
  });

  it("lets the assignee mark their work complete and link files, but not reassign it", async () => {
    const council = (await work("photo")).assignments.find((row) => row.title === "Council photos")!;
    const done = await call("post", "/byline/stories/:id/media-assignments/:assignmentId", "photo", { params: { id: String(budget), assignmentId: council.id }, data: { status: "done", attachmentIds: [ids.gif] } });
    expect(done.status).toBe(200);
    const after = (await work("photo")).assignments.find((row) => row.title === "Council photos")!;
    expect(after.status).toBe("done");
    expect(after.attachments.map((file) => file.id)).toEqual([ids.gif]);
    await call("post", "/byline/stories/:id/media-assignments/:assignmentId", "photo", { params: { id: String(budget), assignmentId: council.id }, data: { assigneeId: accounts.bob.id } });
    const raw = await payload.findByID({ collection: "production-assignments", id: Number(council.id), depth: 0 });
    expect(raw.assignees).toEqual([accounts.photo.id]);
  });
});
