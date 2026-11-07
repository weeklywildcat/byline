import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { publicationMediaPath, type PublicationBlob, type PublicationMimeType } from "@byline/content";
import { closedDescriptorSet, materializePublicationMedia, outputPathFor } from "@/scripts/publication-media";
import { carriesImageMetadata, verifyNoPrivateNewsroomReferences, verifyPublicationMedia } from "@/scripts/verify-static-export.mjs";

const TOKEN = "build-token-for-tests-0123456789abcdef0123456789";
const objects = new Map<string, Buffer>();
const requests: string[] = [];
let server: Server;
let endpoint = "";
let out = "";

const sha = (data: Buffer) => createHash("sha256").update(data).digest("hex");
function descriptor(data: Buffer, mimeType: PublicationMimeType, label: string, kind: "image" | "document" = "image", overrides: Partial<PublicationBlob> = {}): PublicationBlob {
  const hash = sha(data);
  return { sha256: hash, bytes: data.length, mimeType, publicPath: publicationMediaPath({ kind, filename: "Marching Band.jpg", label, sha256: hash, mimeType }), ...overrides };
}
const listOut = () => {
  const root = path.join(out, "_byline", "media");
  const files: string[] = [];
  const walk = (dir: string) => { for (const entry of readdirSync(dir, { withFileTypes: true })) entry.isDirectory() ? walk(path.join(dir, entry.name)) : files.push(path.relative(out, path.join(dir, entry.name)).split(path.sep).join("/")); };
  try { walk(root); } catch { /* none */ }
  return files.sort();
};

let webp: Buffer;
let jpeg: Buffer;
let pdf: Buffer;
let camera: Buffer;

beforeAll(async () => {
  webp = await sharp({ create: { width: 64, height: 48, channels: 3, background: "#369" } }).webp({ quality: 80 }).toBuffer();
  jpeg = await sharp({ create: { width: 120, height: 63, channels: 3, background: "#963" } }).jpeg({ quality: 80 }).toBuffer();
  camera = await sharp({ create: { width: 80, height: 60, channels: 3, background: "#555" } }).jpeg().withExif({ IFD0: { Make: "Canon", Model: "EOS R7" } }).toBuffer();
  pdf = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n", "latin1");
  for (const data of [webp, jpeg, pdf, Buffer.from("not requested")]) objects.set(sha(data), data);
  server = createServer((req, res) => {
    requests.push(req.url ?? "");
    if (req.headers.authorization !== `Bearer ${TOKEN}`) { res.writeHead(401).end(); return; }
    const match = /^\/api\/byline\/build\/media\/([0-9a-f]{64})$/.exec(req.url ?? "");
    const body = match ? objects.get(match[1]) : undefined;
    if (!body) { res.writeHead(404).end(); return; }
    res.writeHead(200, { "Content-Type": "application/octet-stream", "Content-Length": body.length }).end(body);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  endpoint = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/byline/build/media`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));
afterEach(() => { if (out) rmSync(out, { recursive: true, force: true }); requests.length = 0; });
const freshOut = () => (out = mkdtempSync(path.join(os.tmpdir(), "byline-publication-out-")));

describe("publication media materialization", () => {
  it("downloads only the requested blobs with a valid credential, verified, at their public paths", async () => {
    freshOut();
    const wanted = [descriptor(webp, "image/webp", "w640"), descriptor(jpeg, "image/jpeg", "social"), descriptor(pdf, "application/pdf", "file", "document")];
    const result = await materializePublicationMedia({ descriptors: wanted, endpoint, token: TOKEN, outDir: out, concurrency: 2 });
    expect(result).toMatchObject({ written: 3, unchanged: 0 });
    expect(listOut()).toEqual(wanted.map((blob) => blob.publicPath.slice(1)).sort());
    expect(readFileSync(outputPathFor(out, wanted[0].publicPath)).equals(webp)).toBe(true);
    // Nothing else (no listing, no unrequested object) was asked for.
    expect(requests).toHaveLength(3);
    expect(readdirSync(path.join(out, "_byline")).filter((name) => name.startsWith(".media-staging"))).toEqual([]);
    // Immutable paths: a second run downloads nothing.
    const again = await materializePublicationMedia({ descriptors: wanted, endpoint, token: TOKEN, outDir: out });
    expect(again).toMatchObject({ written: 0, unchanged: 3 });
    expect(await verifyPublicationMedia(out)).toBe(3);
  });

  it("fails on a missing or wrong credential", async () => {
    freshOut();
    await expect(materializePublicationMedia({ descriptors: [descriptor(webp, "image/webp", "w640")], endpoint, token: "wrong-token", outDir: out })).rejects.toThrow(/credential/);
    await expect(materializePublicationMedia({ descriptors: [descriptor(webp, "image/webp", "w640")], endpoint, token: "", outDir: out })).rejects.toThrow(/BYLINE_BUILD_TOKEN/);
    expect(listOut()).toEqual([]);
  });

  it("fails on a wrong hash, wrong byte count, wrong type or missing blob, and writes nothing for it", async () => {
    freshOut();
    // The server answers this descriptor's hash with different bytes.
    const swapped = descriptor(jpeg, "image/jpeg", "social");
    objects.set(swapped.sha256, Buffer.concat([jpeg.subarray(0, jpeg.length - 1), Buffer.from([0])]));
    await expect(materializePublicationMedia({ descriptors: [swapped], endpoint, token: TOKEN, outDir: out })).rejects.toThrow(/SHA-256/);
    objects.set(swapped.sha256, jpeg);

    await expect(materializePublicationMedia({ descriptors: [descriptor(webp, "image/webp", "w640", "image", { bytes: webp.length - 1 })], endpoint, token: TOKEN, outDir: out })).rejects.toThrow(/larger than its expected/);
    await expect(materializePublicationMedia({ descriptors: [descriptor(webp, "image/webp", "w640", "image", { bytes: webp.length + 1 })], endpoint, token: TOKEN, outDir: out })).rejects.toThrow(/expected .* bytes/);

    const jpegAsWebp = { ...descriptor(jpeg, "image/webp", "w640") };
    await expect(materializePublicationMedia({ descriptors: [jpegAsWebp], endpoint, token: TOKEN, outDir: out })).rejects.toThrow(/expected image\/webp/);

    const missing = descriptor(Buffer.from("gone"), "image/webp", "w320");
    await expect(materializePublicationMedia({ descriptors: [missing], endpoint, token: TOKEN, outDir: out })).rejects.toThrow(/missing from the newsroom/);
    expect(listOut()).toEqual([]);
  });

  it("refuses unsafe or conflicting paths before any request", async () => {
    const good = descriptor(webp, "image/webp", "w640");
    expect(() => closedDescriptorSet([{ ...good, publicPath: "/_byline/media/images/../../index.html" }])).toThrow(/Unsafe/);
    expect(() => closedDescriptorSet([{ ...good, publicPath: "/api/media/file/IMG_4932.jpg" }])).toThrow(/Unsafe/);
    expect(() => closedDescriptorSet([{ ...good, sha256: "../../etc/passwd" }])).toThrow(/SHA-256/);
    expect(() => closedDescriptorSet([good, { ...good, bytes: good.bytes + 1 }])).toThrow(/two different/);
    expect(() => outputPathFor("/tmp/out", "/_byline/../escape")).toThrow();
    expect(requests).toEqual([]);
  });
});

describe("static export verification of publication media", () => {
  it("rejects a camera original, a misnamed file and leaked private references", async () => {
    freshOut();
    const original = descriptor(camera, "image/jpeg", "social");
    mkdirSync(path.dirname(outputPathFor(out, original.publicPath)), { recursive: true });
    writeFileSync(outputPathFor(out, original.publicPath), camera);
    expect(carriesImageMetadata(camera, "jpg")).toBe(true);
    expect(carriesImageMetadata(jpeg, "jpg")).toBe(false);
    expect(carriesImageMetadata(webp, "webp")).toBe(false);
    await expect(verifyPublicationMedia(out)).rejects.toThrow(/camera metadata/);
    rmSync(path.join(out, "_byline"), { recursive: true, force: true });

    const prepared = descriptor(webp, "image/webp", "w640");
    mkdirSync(path.dirname(outputPathFor(out, prepared.publicPath)), { recursive: true });
    writeFileSync(outputPathFor(out, prepared.publicPath), jpeg);
    await expect(verifyPublicationMedia(out)).rejects.toThrow(/fingerprint/);
    rmSync(path.join(out, "_byline"), { recursive: true, force: true });

    mkdirSync(path.join(out, "_byline", "media", "images"), { recursive: true });
    writeFileSync(path.join(out, "_byline", "media", "images", "IMG_4932.JPG"), camera);
    await expect(verifyPublicationMedia(out)).rejects.toThrow(/Unexpected file/);
    rmSync(path.join(out, "_byline"), { recursive: true, force: true });

    writeFileSync(path.join(out, "index.html"), `<img src="/_byline/media/images/aa/x--w640--aaaaaaaaaaaaaaaa.webp">`);
    await expect(verifyNoPrivateNewsroomReferences(out, { BYLINE_BUILD_TOKEN: TOKEN })).resolves.toBeUndefined();
    writeFileSync(path.join(out, "story.html"), `<img src="https://newsroom.example/api/media/file/IMG_4932.jpg">`);
    await expect(verifyNoPrivateNewsroomReferences(out, {})).rejects.toThrow(/private newsroom/);
    writeFileSync(path.join(out, "story.html"), `<script>const t = "${TOKEN}"</script>`);
    await expect(verifyNoPrivateNewsroomReferences(out, { BYLINE_BUILD_TOKEN: TOKEN })).rejects.toThrow(/build credential/);
  });
});
