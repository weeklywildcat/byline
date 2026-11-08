import { createHash } from "node:crypto";
import { mkdtempSync, readdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { autoCrop } from "@byline/core";
import { publicationManifestBlobs, publicationMediaReadiness, PUBLICATION_MEDIA_RECIPE_VERSION, type PublicationImageManifest, type PublicationMediaManifest } from "@byline/content";
import { createLocalReq, getPayload, type Payload, type PayloadRequest } from "payload";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { newsroomEndpoints } from "../../src/newsroom/endpoints";
import type { Media, User } from "../../src/payload-types";
import { publicationStore } from "../../src/publication-media/blob-store";
import { serveBuildMedia } from "../../src/publication-media/build-endpoint";
import { privateMediaDir, publicationMediaDir } from "../../src/publication-media/paths";
import { preparePublicationMedia } from "../../src/publication-media/prepare";
import { publicationMediaReport, storyMediaRequirements } from "../../src/publication-media/readiness";
import { runPublicationMediaPreparation } from "../../src/publication-media/task";
import { materializePublicationMedia } from "../../../web/scripts/publication-media";

/**
 * The Phase 5 publication-media pipeline against real PostgreSQL, the real
 * Payload Jobs Queue, Sharp and a throwaway publication store: art-direction
 * permissions and revisions, preparation (natural ladder, crops, SEO, social,
 * animation, PDF), stale-generation safety, Story publish readiness, the
 * build-only endpoint and build-time materialization.
 */
let payload: Payload;
let publishingSection: number;
const accounts: Record<string, User> = {};
const people: Record<string, number> = {};
const ids: Record<string, number> = {};
const BUILD_TOKEN = "publication-media-test-build-token-0123456789abcdef";

async function account(key: string, role: User["role"]) {
  people[key] = (await payload.create({ collection: "people", data: { name: `${key} Person`, slug: `pubmedia-${key}`, status: "active" } })).id;
  const user = await payload.create({ collection: "users", data: { email: `pubmedia-${key}@example.test`, password: `pw-${key}-123456`, name: `${key} Account`, role, enabled: true, linkedPerson: people[key] } });
  accounts[key] = { ...user, collection: "users" } as User;
}

const reqAs = (key: string) => createLocalReq({ user: accounts[key] }, payload);

async function call(method: string, routePath: string, key: string, options: { data?: unknown; params?: Record<string, string>; query?: string; file?: PayloadRequest["file"] } = {}) {
  const endpoint = newsroomEndpoints.find((candidate) => candidate.method === method && candidate.path === routePath);
  if (!endpoint) throw new Error(`No endpoint ${method} ${routePath}`);
  const req = await reqAs(key);
  Object.assign(req, { routeParams: options.params ?? {}, data: options.data, searchParams: new URLSearchParams(options.query ?? ""), file: options.file });
  const response = (await endpoint.handler(req)) as Response;
  return { status: response.status, body: response.status === 204 ? null : await response.json() };
}

/** Left half red, right half blue: a focal point decides which half an automatic crop keeps. */
async function halves(width: number, height: number, name: string, options: { exif?: boolean; orientation?: number } = {}) {
  const left = await sharp({ create: { width: Math.floor(width / 2), height, channels: 3, background: "#ff0000" } }).png().toBuffer();
  let image = sharp({ create: { width, height, channels: 3, background: "#0000ff" } }).composite([{ input: left, left: 0, top: 0 }]).jpeg({ quality: 90 });
  if (options.exif) image = image.withExif({ IFD0: { Make: "Canon", Model: "EOS R7" }, IFD3: { GPSLatitudeRef: "N", GPSLatitude: "40/1 26/1 0/1" } });
  let data = await image.toBuffer();
  if (options.orientation) data = await sharp(data).withMetadata({ orientation: options.orientation }).jpeg({ quality: 90 }).toBuffer();
  return { data, mimetype: "image/jpeg", name, size: data.length };
}

async function gif(frames: number, size = 64) {
  const colors = [[255, 0, 0], [0, 255, 0], [0, 0, 255], [255, 255, 0]];
  const raw = Buffer.concat(Array.from({ length: frames }, (_, index) => Buffer.alloc(size * size * 3, Buffer.from(colors[index % colors.length]))));
  const data = await sharp(raw, { raw: { width: size, height: size * frames, channels: 3, pageHeight: size } as never }).gif({ delay: Array(frames).fill(100) }).toBuffer();
  return { data, mimetype: "image/gif", name: "pubmedia-spinner.gif", size: data.length };
}

function pdf(padding = 0) {
  const objects = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>", "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>"];
  let body = "%PDF-1.4\n";
  if (padding) body += `%${"x".repeat(padding)}\n`;
  const offsets: number[] = [];
  objects.forEach((object, index) => { offsets.push(body.length); body += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}`;
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  const data = Buffer.from(body, "latin1");
  return { data, mimetype: "application/pdf", name: "pubmedia-minutes.pdf", size: data.length };
}

async function upload(key: string, file: NonNullable<PayloadRequest["file"]>, complete = true) {
  const result = await call("post", "/byline/media/upload", key, { data: { folderId: null }, file });
  if (result.status !== 200) throw new Error(`upload failed: ${JSON.stringify(result.body)}`);
  const id = result.body.id as number;
  if (complete) await payload.update({ collection: "media", id, data: { alt: "A photograph", credit: "The Weekly Wildcat", copyright: "© 2026 The Weekly Wildcat" }, overrideAccess: true });
  return id;
}

const media = (id: number) => payload.findByID({ collection: "media", id, depth: 0, overrideAccess: true }) as Promise<Media>;
const runMediaJobs = () => payload.jobs.run({ queue: "media", limit: 50 });
const manifestOf = async (id: number) => (await media(id)).publicationAssets?.manifest as PublicationMediaManifest;
const imageManifest = async (id: number) => (await manifestOf(id)) as PublicationImageManifest;
const objectFile = (sha: string) => publicationStore().objectPath(sha)!;
const jobsFor = async (id: number) => (await payload.find({ collection: "payload-jobs", where: { concurrencyKey: { equals: `publication-media:${id}` } }, pagination: false, overrideAccess: true, depth: 0 })).docs as unknown as Array<{ id: number; input: { mediaId: number; revision: number; recipeVersion: number }; completedAt?: string | null; processing?: boolean; queue?: string; taskSlug?: string }>;
const pending = async (id: number) => (await jobsFor(id)).filter((job) => !job.completedAt);
const artDirection = (key: string, id: number, data: Record<string, unknown>) => call("put", "/byline/media/:id/art-direction", key, { params: { id: String(id) }, data });
const currentUpdatedAt = async (id: number) => (await media(id)).updatedAt;
const meanColor = async (sha: string) => {
  const { channels } = await sharp(readFileSync(objectFile(sha))).stats();
  return { r: channels[0].mean, b: channels[2].mean };
};

beforeAll(async () => {
  const url = new URL(process.env.DATABASE_URL!);
  url.pathname = `${url.pathname}_publication_media`;
  process.env.DATABASE_URL = url.toString();
  const { default: config } = await import("../../src/payload.config");
  payload = await getPayload({ config });
  publishingSection = (await payload.create({ collection: "sections", data: { name: "Publishing fixture", slug: "publishing-fixture" } })).id;
  await account("editor", "editor");
  await account("alice", "staff");
  await account("bob", "staff");
  await account("admin", "administrator");

  ids.photo = await upload("alice", await halves(3000, 2000, "marching-band.jpg"));
  ids.small = await upload("alice", await halves(1000, 750, "small.jpg"));
  ids.tiny = await upload("alice", await halves(800, 600, "tiny.jpg"));
  ids.oriented = await upload("alice", await halves(400, 200, "rotated.jpg", { orientation: 6, exif: true }));
  ids.gif = await upload("bob", await gif(3));
  ids.pdf = await upload("editor", pdf());
}, 300_000);

afterAll(async () => {
  await payload?.db?.destroy?.();
});

describe("art direction", () => {
  it("is edited by the uploader and by editors, never by unrelated staff", async () => {
    const view = await call("get", "/byline/media/:id/art-direction", "bob", { params: { id: String(ids.photo) } });
    expect(view.status).toBe(200);
    expect(view.body).toMatchObject({ mediaId: ids.photo, width: 3000, height: 2000, canUpdate: false, animated: false, intent: { version: 1, focalPoint: { x: 50, y: 50 }, crops: {} } });
    expect(view.body).not.toHaveProperty("publicationAssets");
    expect(JSON.stringify(view.body)).not.toContain(publicationMediaDir());

    const before = await media(ids.photo);
    expect((await artDirection("bob", ids.photo, { focalPoint: { x: 10, y: 10 }, expectedUpdatedAt: before.updatedAt })).status).toBe(403);
    const own = await artDirection("alice", ids.photo, { focalPoint: { x: 20, y: 40 }, expectedUpdatedAt: before.updatedAt });
    expect(own.status).toBe(200);
    expect(own.body.intent.focalPoint).toEqual({ x: 20, y: 40 });
    const edited = await artDirection("editor", ids.photo, { focalPoint: { x: 25, y: 40 }, expectedUpdatedAt: own.body.updatedAt });
    expect(edited.status).toBe(200);
    // Compare-and-swap: a save based on an older version is refused, never applied.
    expect((await artDirection("alice", ids.photo, { focalPoint: { x: 90, y: 90 }, expectedUpdatedAt: own.body.updatedAt })).status).toBe(409);
    expect((await media(ids.photo)).artDirection).toMatchObject({ focalPoint: { x: 25, y: 40 } });
  });

  it("validates and canonicalizes on the server", async () => {
    const at = await currentUpdatedAt(ids.photo);
    expect((await artDirection("alice", ids.photo, { crops: { banner: { x: 0, y: 0, w: 1, h: 1 } }, expectedUpdatedAt: at })).status).toBe(400);
    expect((await artDirection("alice", ids.photo, { focalPoint: { x: Number.NaN, y: 2 }, expectedUpdatedAt: at })).status).toBe(400);
    expect((await artDirection("alice", ids.photo, { crops: { square: { x: 0.6, y: 0, w: 0.6667, h: 1 } }, expectedUpdatedAt: at })).status).toBe(400);
    expect((await artDirection("alice", ids.photo, { focalPoint: { x: 25, y: 40 } })).status).toBe(400);
    // An automatic-equivalent crop is accepted and not stored as custom.
    const auto = autoCrop("wide", { x: 25, y: 40 }, 3000, 2000);
    const same = await artDirection("alice", ids.photo, { focalPoint: { x: 25, y: 40 }, crops: { wide: auto }, expectedUpdatedAt: at });
    expect(same.status).toBe(200);
    expect(same.body.intent.crops).toEqual({});
    expect(same.body.updatedAt).toBe(at);
  });

  it("is never written through Payload's generic update, and native focal input is ignored", async () => {
    const before = await media(ids.small);
    await payload.update({ collection: "media", id: ids.small, data: { artDirection: { focalPoint: { x: 1, y: 1 }, renditions: { wide: [{ url: "https://x" }] } }, focalX: 5, focalY: 5 } as never, overrideAccess: false, req: await reqAs("alice") });
    const after = await media(ids.small);
    expect(after.artDirection).toEqual(before.artDirection);
    expect(after.publicationRevision).toBe(before.publicationRevision);
    // Payload never re-processed the upload for a focal change: the library preview is the same file.
    expect(after.sizes?.library?.filename).toBe(before.sizes?.library?.filename);
  });
});

describe("publication revision", () => {
  it("starts at 1 on upload and queues preparation as the system", async () => {
    const created = await media(ids.tiny);
    expect(created.publicationRevision).toBe(1);
    expect(created.publicationAssets?.status).toBe("preparing");
    const jobs = await jobsFor(ids.tiny);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({ queue: "media", taskSlug: "prepare-publication-media", input: { mediaId: ids.tiny, revision: 1, recipeVersion: PUBLICATION_MEDIA_RECIPE_VERSION } });
    // Staff could not have queued it themselves: Jobs access stays administrator-only.
    await expect(payload.jobs.queue({ task: "prepare-publication-media", input: { mediaId: ids.tiny, revision: 1, recipeVersion: 1 }, overrideAccess: false, req: await reqAs("alice") } as never)).rejects.toThrow();
  });

  it("moves for focal points and crops, never for metadata, and supersedes obsolete queued work", async () => {
    const start = await media(ids.small);
    const metadata = await call("patch", "/byline/media/:id", "alice", { params: { id: String(ids.small) }, data: { alt: "New alt", credit: "New credit", copyright: "©", license: "CC", sourceUrl: "https://example.test/a", capturedAt: "2026-11-01", expectedUpdatedAt: start.updatedAt } });
    expect(metadata.status).toBe(200);
    expect((await media(ids.small)).publicationRevision).toBe(start.publicationRevision);

    const focal = await artDirection("alice", ids.small, { focalPoint: { x: 70, y: 50 }, expectedUpdatedAt: metadata.body.updatedAt });
    expect((await media(ids.small)).publicationRevision).toBe(start.publicationRevision! + 1);
    await artDirection("alice", ids.small, { focalPoint: { x: 70, y: 50 }, crops: { square: { x: 0, y: 0, w: 0.75, h: 1 } }, expectedUpdatedAt: focal.body.updatedAt });
    const now = await media(ids.small);
    expect(now.publicationRevision).toBe(start.publicationRevision! + 2);
    // Only the newest generation is still queued; older pending jobs were superseded.
    const queued = await pending(ids.small);
    expect(queued.map((job) => job.input.revision)).toEqual([now.publicationRevision]);
  });

  it("moves when the source file is replaced", async () => {
    const before = await media(ids.tiny);
    await payload.update({ collection: "media", id: ids.tiny, data: {}, file: await halves(900, 600, "tiny-v2.jpg"), overrideAccess: false, req: await reqAs("alice") });
    const after = await media(ids.tiny);
    expect(after.publicationRevision).toBe(before.publicationRevision! + 1);
    expect(after.width).toBe(900);
  });
});

describe("preparation", () => {
  it("prepares every queued generation through the Jobs Queue", async () => {
    await runMediaJobs();
    for (const key of ["photo", "small", "tiny", "oriented", "gif", "pdf"]) {
      const record = await media(ids[key]);
      const readiness = publicationMediaReadiness(record.publicationAssets, record.publicationRevision);
      expect(readiness.ready, `${key}: ${record.publicationAssets?.failureCode} ${record.publicationAssets?.failureMessage}`).toBe(true);
      for (const blob of publicationManifestBlobs(readiness.ready ? readiness.manifest : (null as never))) expect(await publicationStore().verify(blob.sha256)).toBe(true);
    }
    expect(await pending(ids.small)).toEqual([]);
  });

  it("makes the natural ladder without upscaling", async () => {
    expect((await imageManifest(ids.photo)).natural.map((file) => [file.width, file.height])).toEqual([[320, 213], [640, 427], [960, 640], [1440, 960], [1920, 1280], [2560, 1707]]);
    // A 1000px source: the targets that fit, then the source width itself (the sharpest real file), never 1440.
    expect((await imageManifest(ids.small)).natural.map((file) => file.width)).toEqual([320, 640, 960, 1000]);
    expect((await imageManifest(ids.photo)).natural.every((file) => file.mimeType === "image/webp")).toBe(true);
  });

  it("applies EXIF orientation first and publishes no camera metadata", async () => {
    const manifest = await imageManifest(ids.oriented);
    expect(manifest.source).toMatchObject({ width: 200, height: 400 });
    for (const blob of publicationManifestBlobs(manifest)) {
      const meta = await sharp(readFileSync(objectFile(blob.sha256))).metadata();
      expect(meta.exif, blob.publicPath).toBeUndefined();
      expect(meta.xmp).toBeUndefined();
      expect(meta.orientation ?? 1).toBe(1);
    }
    // The original keeps them; only publication output is clean.
    const original = await media(ids.oriented);
    expect((await sharp(path.join(privateMediaDir(), original.filename!)).metadata()).exif).toBeDefined();
  });

  it("crops explicit shapes physically and uses the focal point for automatic SEO crops", async () => {
    const manifest = await imageManifest(ids.small);
    expect(Object.keys(manifest.crops)).toEqual(["square"]);
    expect(manifest.crops.square!.renditions.map((file) => [file.width, file.height])).toEqual([[320, 320], [640, 640], [750, 750]]);
    // The square crop is the left 75% (mostly red); its largest file also serves search.
    expect(manifest.seo["1x1"]).toMatchObject({ origin: "custom", publicPath: manifest.crops.square!.renditions[2].publicPath });
    // No custom wide crop: the 16:9 search image is one automatic crop at the focal point.
    expect(manifest.seo["16x9"]).toMatchObject({ origin: "auto", width: 1000, height: 563 });
    expect(manifest.seo["4x3"].origin).toBe("auto");

    // Focal point decides what an automatic crop keeps: left (red) vs right (blue).
    const photo = await imageManifest(ids.photo);
    const square = await meanColor(photo.seo["1x1"].sha256);
    expect(square.r).toBeGreaterThan(square.b);
    expect(photo.seo["1x1"]).toMatchObject({ width: 2000, height: 2000, origin: "auto" });
    expect(photo.seo["16x9"]).toMatchObject({ width: 2560, height: 1440 });
    expect(photo.seo["4x3"]).toMatchObject({ width: 2560, height: 1920 });
  });

  it("always makes a real 1200×630 social image, and never enlarges a small one", async () => {
    expect((await imageManifest(ids.photo)).social).toMatchObject({ width: 1200, height: 630, mimeType: "image/jpeg", origin: "auto" });
    const tiny = await imageManifest(ids.tiny);
    expect(tiny.social.width).toBe(900);
    expect(tiny.warnings.map((warning) => warning.code)).toEqual(expect.arrayContaining(["low-resolution-social", "low-resolution-seo"]));
    const detail = await call("get", "/byline/media/:id", "alice", { params: { id: String(ids.tiny) } });
    expect(detail.body.publication).toMatchObject({ state: "ready", reason: "ready", canRetry: false });
    expect(detail.body.publication.warnings.join(" ")).toMatch(/social image/);
    expect(JSON.stringify(detail.body)).not.toMatch(/manifest|sha256|objects\//);
  });

  it("keeps animation animated, with first-frame stills, and refuses custom crops on it", async () => {
    const manifest = await imageManifest(ids.gif);
    expect(manifest.source.animated).toBe(true);
    expect(manifest.animation).toMatchObject({ frames: 3, mimeType: "image/webp" });
    const animated = await sharp(readFileSync(objectFile(manifest.animation!.sha256)), { animated: true }).metadata();
    expect(animated.pages).toBe(3);
    expect((await sharp(readFileSync(objectFile(manifest.natural[0].sha256))).metadata()).pages ?? 1).toBe(1);
    const view = await call("get", "/byline/media/:id/art-direction", "bob", { params: { id: String(ids.gif) } });
    expect(view.body.animated).toBe(true);
    expect((await artDirection("bob", ids.gif, { crops: { square: { x: 0, y: 0, w: 0.5, h: 0.5 } }, focalPoint: { x: 10, y: 10 }, expectedUpdatedAt: view.body.updatedAt })).status).toBe(400);
  });

  it("publishes PDFs as exact-byte copies", async () => {
    const manifest = await manifestOf(ids.pdf);
    const original = await media(ids.pdf);
    const bytes = readFileSync(path.join(privateMediaDir(), original.filename!));
    expect(manifest).toMatchObject({ kind: "document", file: { mimeType: "application/pdf", bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") } });
    expect(readFileSync(objectFile((manifest as { file: { sha256: string } }).file.sha256)).equals(bytes)).toBe(true);
  });

  it("reuses identical output bytes instead of storing them twice", async () => {
    const twin = await upload("alice", await halves(1000, 750, "small-copy.jpg"));
    await artDirection("alice", twin, { focalPoint: { x: 70, y: 50 }, crops: { square: { x: 0, y: 0, w: 0.75, h: 1 } }, expectedUpdatedAt: await currentUpdatedAt(twin) });
    await runMediaJobs();
    const original = await imageManifest(ids.small);
    const copy = await imageManifest(twin);
    expect(copy.natural.map((file) => file.sha256)).toEqual(original.natural.map((file) => file.sha256));
    expect(copy.natural[0].publicPath).not.toBe(original.natural[0].publicPath); // named for its own file, same object
    const objects = readdirSync(path.join(publicationMediaDir(), "objects", original.natural[0].sha256.slice(0, 2)));
    expect(objects.filter((name) => name === original.natural[0].sha256)).toHaveLength(1);
  });

  it("never lets a stale running generation promote over a newer revision", async () => {
    const id = await upload("alice", await halves(1200, 800, "race.jpg"));
    const queued = (await pending(id))[0];
    // Run the job's work directly, and change the crop intent while it is between processing and promotion.
    const outcome = await runPublicationMediaPreparation(payload, queued.input, {
      afterPrepare: async () => {
        await artDirection("alice", id, { focalPoint: { x: 5, y: 5 }, expectedUpdatedAt: await currentUpdatedAt(id) });
      }
    });
    expect(outcome).toBe("stale");
    const record = await media(id);
    expect(record.publicationRevision).toBe(2);
    expect(record.publicationAssets).toMatchObject({ status: "preparing" });
    expect(record.publicationAssets?.preparedRevision ?? null).toBeNull();
    // A job for an old revision exits without touching anything.
    expect(await runPublicationMediaPreparation(payload, { ...queued.input, revision: 1 })).toBe("stale");
    await runMediaJobs();
    expect((await media(id)).publicationAssets).toMatchObject({ status: "ready", preparedRevision: 2 });
  });

  it("marks a missing or corrupt source Failed, never Ready, and Retry needs Media permission", async () => {
    const missing = await upload("alice", await halves(640, 480, "missing.jpg"));
    unlinkSync(path.join(privateMediaDir(), (await media(missing)).filename!));
    const corrupt = await upload("alice", await halves(640, 480, "corrupt.jpg"));
    writeFileSync(path.join(privateMediaDir(), (await media(corrupt)).filename!), Buffer.from("not a jpeg at all"));
    await runMediaJobs();
    expect((await media(missing)).publicationAssets).toMatchObject({ status: "failed", failureCode: "source-missing" });
    expect((await media(corrupt)).publicationAssets).toMatchObject({ status: "failed", failureCode: "source-unreadable" });
    const detail = await call("get", "/byline/media/:id", "alice", { params: { id: String(corrupt) } });
    expect(detail.body.publication).toMatchObject({ state: "failed", canRetry: true });
    expect(detail.body.publicationAssets).toBe("failed");

    expect((await call("post", "/byline/media/:id/publication/retry", "bob", { params: { id: String(corrupt) } })).status).toBe(403);
    writeFileSync(path.join(privateMediaDir(), (await media(corrupt)).filename!), (await halves(640, 480, "x.jpg")).data);
    const retried = await call("post", "/byline/media/:id/publication/retry", "alice", { params: { id: String(corrupt) } });
    expect(retried.status).toBe(200);
    expect(retried.body.publication.state).toBe("preparing");
    expect(await pending(corrupt)).toHaveLength(1);
    await runMediaJobs();
    expect((await media(corrupt)).publicationAssets?.status).toBe("ready");
  });

  it("fails clearly when an output is over the static file limit", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "byline-large-"));
    try {
      const source = path.join(dir, "huge.pdf");
      writeFileSync(source, pdf(26 * 1024 * 1024).data);
      await expect(preparePublicationMedia({ path: source, mimeType: "application/pdf", filename: "huge.pdf", artDirection: null }, publicationStore())).rejects.toMatchObject({ code: "file-too-large" });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("Story publication readiness", () => {
  const story = async (media: Record<string, unknown>) => (await payload.create({ collection: "stories", draft: true, data: { headline: "Media readiness", section: publishingSection, ...media }, req: await reqAs("editor"), overrideAccess: false })).id;
  const publish = async (id: number) => payload.update({ collection: "stories", id, data: { _status: "published" }, req: await reqAs("editor"), overrideAccess: false });
  /** The field errors Publish was refused with (what Payload's form shows next to the lead image or body). */
  const refusal = async (id: number) => {
    try {
      await publish(id);
    } catch (error) {
      return ((error as { data?: { errors?: Array<{ path: string; message: string }> } }).data?.errors ?? []).map((item) => `${item.path}: ${item.message}`).join("\n");
    }
    throw new Error("Publish was not refused.");
  };
  const photoBody = (mediaId: number) => ({ root: { type: "root", version: 1, format: "", indent: 0, direction: "ltr", children: [{ type: "block", version: 2, format: "", fields: { id: "p1", blockType: "photo", blockName: "", media: mediaId, caption: "A caption", altOverride: "", placement: "column" } }] } });

  it("finds the lead image and every Media in photo, gallery and document blocks", () => {
    const body = { root: { children: [
      { type: "block", fields: { blockType: "photo", media: 11 } },
      { type: "block", fields: { blockType: "gallery", items: [{ media: 12 }, { media: { id: 13 } }] } },
      { type: "block", fields: { blockType: "document", media: 14 } },
      { type: "paragraph", children: [] }
    ] } };
    expect(storyMediaRequirements({ featuredMedia: { id: 10 }, body, contentFormat: "byline-v1" })).toEqual([
      { id: 10, role: "image", allowMissingAlt: false },
      { id: 11, role: "file", allowMissingAlt: false },
      { id: 12, role: "file", allowMissingAlt: false },
      { id: 13, role: "file", allowMissingAlt: false },
      { id: 14, role: "file", allowMissingAlt: false }
    ]);
    // Imported bodies are not scanned (Phase 8); the lead image still counts.
    expect(storyMediaRequirements({ featuredMedia: 10, body, contentFormat: "legacy-html" })).toEqual([{ id: 10, role: "image", allowMissingAlt: false }]);
  });

  it("lets drafts save with media still preparing, and refuses to publish until it is ready", async () => {
    const preparing = await upload("alice", await halves(800, 600, "preparing.jpg"));
    const id = await story({ featuredMedia: preparing });
    await payload.update({ collection: "stories", id, draft: true, data: { body: photoBody(ids.photo) as never }, req: await reqAs("editor"), overrideAccess: false });
    expect(await refusal(id)).toMatch(/featuredMedia: preparing\.jpg · Publication files are still being prepared/);
    const report = await call("get", "/byline/media/publication-readiness", "editor", { query: `lead=${preparing}&ids=${ids.photo}` });
    expect(report.body).toMatchObject({ ready: false, preparing: 1, blocked: 0 });
    await runMediaJobs();
    await expect(publish(id)).resolves.toMatchObject({ _status: "published" });
  });

  it("refuses failed, stale, metadata-incomplete and old-recipe media", async () => {
    const failed = await upload("alice", await halves(640, 480, "failed.jpg"));
    unlinkSync(path.join(privateMediaDir(), (await media(failed)).filename!));
    const gaps = await upload("alice", await halves(640, 480, "no-alt.jpg"), false);
    const stale = await upload("alice", await halves(640, 480, "stale.jpg"));
    const oldRecipe = await upload("alice", await halves(640, 480, "old-recipe.jpg"));
    await runMediaJobs();
    // A ready generation that a later edit made stale (bumped revision, job not yet run).
    await artDirection("alice", stale, { focalPoint: { x: 1, y: 1 }, expectedUpdatedAt: await currentUpdatedAt(stale) });
    // A generation from an older recipe still says "ready".
    const db = payload.db as unknown as { drizzle: { execute: (q: unknown) => Promise<unknown> } };
    const { sql } = await import("@payloadcms/db-postgres");
    await db.drizzle.execute(sql`update media set publication_assets_recipe_version = ${PUBLICATION_MEDIA_RECIPE_VERSION - 1} where id = ${oldRecipe}`);
    expect((await media(oldRecipe)).publicationAssets?.status).toBe("ready");

    for (const [mediaId, message] of [[failed, /failed\.jpg · Publication file preparation failed/], [gaps, /no-alt\.jpg · Missing alt text/], [stale, /stale\.jpg · Publication files are still being prepared/], [oldRecipe, /old-recipe\.jpg · Publication files need preparing again/]] as const) {
      expect(await refusal(await story({ featuredMedia: mediaId }))).toMatch(message);
    }
    const report = await publicationMediaReport(payload, [{ id: oldRecipe, role: "image" }]);
    expect(report.items[0]).toMatchObject({ state: "blocked", retryable: true, issues: [{ code: "stale-recipe" }] });
  });

  it("refuses media whose prepared objects are gone, and a wrong-kind lead", async () => {
    const id = await upload("alice", await halves(640, 480, "deleted-objects.jpg"));
    await runMediaJobs();
    const manifest = await imageManifest(id);
    unlinkSync(objectFile(manifest.social.sha256));
    expect(await refusal(await story({ featuredMedia: id }))).toMatch(/missing from storage/);
    expect(await refusal(await story({ featuredMedia: ids.pdf }))).toMatch(/must be a photo/);
  });
});

describe("build-only acquisition", () => {
  const request = (sha: string, authorization?: string) => serveBuildMedia({ routeParams: { sha256: sha }, headers: new Headers(authorization ? { authorization } : {}) } as unknown as PayloadRequest, { BYLINE_BUILD_TOKEN: BUILD_TOKEN });

  it("serves a prepared blob only with the build credential, by exact SHA-256", async () => {
    const blob = (await imageManifest(ids.photo)).natural[0];
    const ok = await request(blob.sha256, `Bearer ${BUILD_TOKEN}`);
    expect(ok.status).toBe(200);
    expect(ok.headers.get("cache-control")).toBe("private, no-store");
    expect(createHash("sha256").update(Buffer.from(await ok.arrayBuffer())).digest("hex")).toBe(blob.sha256);
    expect((await request(blob.sha256)).status).toBe(401);
    expect((await request(blob.sha256, "Bearer wrong")).status).toBe(401);
    expect((await request("../../media/IMG_4932.jpg", `Bearer ${BUILD_TOKEN}`)).status).toBe(400);
    expect((await request(blob.sha256.toUpperCase(), `Bearer ${BUILD_TOKEN}`)).status).toBe(400);
    expect((await request(`${blob.sha256}/..`, `Bearer ${BUILD_TOKEN}`)).status).toBe(400);
    // Without a configured token the endpoint does not exist.
    expect((await serveBuildMedia({ routeParams: { sha256: blob.sha256 }, headers: new Headers({ authorization: `Bearer ${BUILD_TOKEN}` }) } as unknown as PayloadRequest, {})).status).toBe(404);
  });

  it("keeps hashes and the manifest out of people's raw Payload reads (administrators excepted)", async () => {
    const asStaff = await payload.findByID({ collection: "media", id: ids.photo, depth: 0, overrideAccess: false, req: await reqAs("bob") });
    expect(asStaff.publicationAssets?.status).toBe("ready");
    expect(asStaff.publicationAssets?.manifest ?? null).toBeNull();
    expect(asStaff.publicationAssets?.sourceHash ?? null).toBeNull();
    const asAdmin = await payload.findByID({ collection: "media", id: ids.photo, depth: 0, overrideAccess: false, req: await reqAs("admin") });
    expect(asAdmin.publicationAssets?.manifest).toBeTruthy();
    // Byline's own read model still summarizes readiness for staff.
    expect((await call("get", "/byline/media/:id", "bob", { params: { id: String(ids.photo) } })).body.publication.state).toBe("ready");
  });

  it("can never return a private original", async () => {
    const original = await media(ids.photo);
    const bytes = readFileSync(path.join(privateMediaDir(), original.filename!));
    const sha = createHash("sha256").update(bytes).digest("hex");
    expect(original.publicationAssets?.sourceHash).toBe(sha);
    expect((await request(sha, `Bearer ${BUILD_TOKEN}`)).status).toBe(404);
  });

  it("goes end to end: upload → crop intent → preparation → Ready → publishable → acquired into a static output without the original", async () => {
    const id = await upload("alice", await halves(2400, 1600, "homecoming.jpg"));
    await artDirection("alice", id, { focalPoint: { x: 30, y: 50 }, crops: { portrait: { x: 0, y: 0, w: 0.5333, h: 1 } }, expectedUpdatedAt: await currentUpdatedAt(id) });
    await runMediaJobs();
    const record = await media(id);
    const readiness = publicationMediaReadiness(record.publicationAssets, record.publicationRevision);
    expect(readiness.ready).toBe(true);
    const storyId = (await payload.create({ collection: "stories", draft: true, data: { headline: "Homecoming", section: publishingSection, featuredMedia: id }, req: await reqAs("editor"), overrideAccess: false })).id;
    await payload.update({ collection: "stories", id: storyId, data: { _status: "published" }, req: await reqAs("editor"), overrideAccess: false });

    const server: Server = createServer(async (req, res) => {
      const match = /^\/api\/byline\/build\/media\/([^/]+)$/.exec(req.url ?? "");
      const response = await serveBuildMedia({ routeParams: { sha256: match?.[1] ?? "" }, headers: new Headers(req.headers as Record<string, string>) } as unknown as PayloadRequest, { BYLINE_BUILD_TOKEN: BUILD_TOKEN });
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(Buffer.from(await response.arrayBuffer()));
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const out = mkdtempSync(path.join(tmpdir(), "byline-static-out-"));
    try {
      const manifest = readiness.ready ? readiness.manifest : (null as never);
      const descriptors = publicationManifestBlobs(manifest);
      const endpoint = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/byline/build/media`;
      const result = await materializePublicationMedia({ descriptors, endpoint, token: BUILD_TOKEN, outDir: out });
      expect(result.written).toBe(descriptors.length);
      const files: string[] = [];
      const walk = (dir: string) => { for (const entry of readdirSync(dir, { withFileTypes: true })) entry.isDirectory() ? walk(path.join(dir, entry.name)) : files.push(path.join(dir, entry.name)); };
      walk(out);
      expect(files.map((file) => `/${path.relative(out, file).split(path.sep).join("/")}`).sort()).toEqual(descriptors.map((blob) => blob.publicPath).sort());
      const original = readFileSync(path.join(privateMediaDir(), record.filename!));
      expect(files.some((file) => readFileSync(file).equals(original))).toBe(false);
      expect((manifest as PublicationImageManifest).crops.portrait!.renditions.map((file) => file.height / file.width)).toEqual([1.25, 1.25, 1.25]);
    } finally {
      rmSync(out, { recursive: true, force: true });
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
