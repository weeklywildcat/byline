import { readFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { PRORAW_UNSUPPORTED_MESSAGE } from "@byline/core";
import { assertNotRawPhoto, injectJpegMetadata, isHeifUpload, normalizeHeifUpload, resetExifOrientation, type UploadedFile } from "../src/media/heic";

// A real HEVC-compressed HEIC (640×480), made by Apple's encoder: the format iPhone cameras write.
const heic = readFileSync(path.join(import.meta.dirname, "fixtures", "iphone-sample.heic"));
const upload = (over: Partial<UploadedFile> = {}): UploadedFile => ({ data: heic, mimetype: "image/heic", name: "IMG_0042.HEIC", size: heic.length, ...over });

describe("HEIC/HEIF ingestion", () => {
  it("is needed: sharp's prebuilt libvips reads the HEIF container but has no HEVC decoder", async () => {
    const meta = await sharp(heic).metadata();
    expect(meta).toMatchObject({ format: "heif", width: 640, height: 480 });
    await expect(sharp(heic).jpeg().toBuffer()).rejects.toThrow(/HEVC|compression format/i);
  });

  it("decodes to a full-resolution JPEG and keeps the file name stem", async () => {
    const { file, converted } = await normalizeHeifUpload(upload());
    expect(converted).toBe(true);
    expect(file).toMatchObject({ mimetype: "image/jpeg", name: "IMG_0042.jpg", size: file.data.length });
    const meta = await sharp(file.data).metadata();
    expect(meta).toMatchObject({ format: "jpeg", width: 640, height: 480 });
    const { data, info } = await sharp(file.data).raw().toBuffer({ resolveWithObject: true });
    // Not blank: the test pattern has real colour variation.
    const sample = new Set<number>();
    for (let i = 0; i < data.length; i += info.channels * 997) sample.add(data[i]);
    expect(sample.size).toBeGreaterThan(8);
  });

  it("recognises HEIC by extension or by the file's own brand when the browser reports no type", async () => {
    expect(isHeifUpload({ data: heic, mimetype: "", name: "" })).toBe(true);
    expect(isHeifUpload({ mimetype: "application/octet-stream", name: "a.heif" })).toBe(true);
    expect(isHeifUpload({ data: Buffer.from("not an image at all"), mimetype: "image/jpeg", name: "a.jpg" })).toBe(false);
    const { converted } = await normalizeHeifUpload(upload({ mimetype: "", name: "camera" }));
    expect(converted).toBe(true);
  });

  it("passes every other photo through untouched", async () => {
    const jpeg = await sharp({ create: { width: 8, height: 8, channels: 3, background: "#369" } }).jpeg().toBuffer();
    const input = upload({ data: jpeg, mimetype: "image/jpeg", name: "a.jpg", size: jpeg.length });
    const { file, converted } = await normalizeHeifUpload(input);
    expect(converted).toBe(false);
    expect(file).toBe(input);
  });

  it("refuses a file that claims to be HEIC but is not, with a message a reporter can act on", async () => {
    await expect(normalizeHeifUpload(upload({ data: Buffer.from("definitely not heic"), size: 19 }))).rejects.toMatchObject({ status: 422, message: expect.stringContaining("HEIC photo couldn't be read") });
  });

  it("refuses Apple ProRAW/DNG with its own message", async () => {
    expect(() => assertNotRawPhoto({ name: "IMG_0001.DNG", mimetype: "application/octet-stream" })).toThrow(PRORAW_UNSUPPORTED_MESSAGE);
    expect(() => assertNotRawPhoto({ name: "x", mimetype: "image/x-adobe-dng" })).toThrow(/ProRAW/);
    await expect(normalizeHeifUpload(upload({ name: "IMG_0001.dng", mimetype: "image/x-adobe-dng" }))).rejects.toMatchObject({ status: 415 });
  });

  it("resets EXIF orientation to 1 (libheif has already rotated the pixels) and carries EXIF and ICC into the JPEG", async () => {
    // A minimal big-endian TIFF with one IFD0 entry: Orientation = 6.
    const tiff = Buffer.alloc(8 + 2 + 12 + 4);
    tiff.write("MM", 0, "latin1");
    tiff.writeUInt16BE(42, 2);
    tiff.writeUInt32BE(8, 4);
    tiff.writeUInt16BE(1, 8);
    tiff.writeUInt16BE(0x0112, 10);
    tiff.writeUInt16BE(3, 12);
    tiff.writeUInt32BE(1, 14);
    tiff.writeUInt16BE(6, 18);
    const reset = resetExifOrientation(tiff);
    expect(reset.readUInt16BE(18)).toBe(1);
    expect(tiff.readUInt16BE(18)).toBe(6);

    const jpeg = await sharp({ create: { width: 8, height: 8, channels: 3, background: "#369" } }).jpeg().toBuffer();
    const icc = (await sharp(await sharp({ create: { width: 1, height: 1, channels: 3, background: "#000" } }).withIccProfile("p3").jpeg().toBuffer()).metadata()).icc!;
    const merged = injectJpegMetadata(jpeg, { exif: reset, icc });
    const meta = await sharp(merged).metadata();
    expect(meta.exif).toBeDefined();
    expect(meta.orientation).toBe(1);
    expect(meta.icc?.length).toBe(icc.length);
  });
});
