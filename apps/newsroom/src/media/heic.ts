import { isHeifFile, isRawPhotoFile, PRORAW_UNSUPPORTED_MESSAGE } from "@byline/core";
import { APIError } from "payload";
import sharp from "sharp";
import { PUBLICATION_RECIPE } from "../publication-media/recipe";

/**
 * HEIC/HEIF ingestion.
 *
 * iPhones and iPads shoot HEIC by default. Sharp's prebuilt libvips reads the
 * AVIF flavour of HEIF but ships without an HEVC decoder (no patent-encumbered
 * codec in the binary), so `sharp(heic)` reads the header and EXIF but fails
 * to decode pixels. Rather than rebuild libvips with libde265 in the Docker
 * image, the pixels are decoded server-side by `libheif-js` (libheif + libde265
 * compiled to WebAssembly, LGPL-3.0, used unmodified as a dependency; no
 * native build, no system packages) and handed to sharp as raw RGBA.
 *
 * This is the one place that happens: `normalizeHeifUpload` runs before
 * Payload sees an upload (Media's `beforeOperation`, the Field/Reporting photo
 * endpoint), so the rest of the pipeline (library preview, publication
 * renditions, art direction) only ever sees a JPEG.
 *
 * Fidelity: full resolution, JPEG quality 95 with 4:4:4 chroma, the file's
 * EXIF (orientation reset to 1, because libheif has already applied the
 * rotation) and ICC profile carried across, and the original file name's stem
 * kept (`IMG_0042.HEIC` becomes `IMG_0042.jpg`). The original HEIC bytes are not
 * stored: Media keeps one file per asset, so retaining the original would need
 * a second stored file and a schema change. Provenance keeps the original's
 * SHA-256 (`capture.originalHash`) for Field/Reporting photos.
 */

/** Anything larger than this many pixels is refused before decoding: RGBA in WebAssembly memory is 4 bytes per pixel. */
export const HEIF_MAX_PIXELS = PUBLICATION_RECIPE.limitInputPixels;

export type UploadedFile = { data: Buffer; mimetype: string; name: string; size: number; tempFilePath?: string };

const HEIF_BRANDS = new Set(["heic", "heix", "hevc", "hevx", "heim", "heis", "hevm", "hevs", "mif1", "msf1"]);

/** HEIC by declared type or name, or (some browsers report neither) by the ISO-BMFF `ftyp` brand. AVIF has its own brands and is left to sharp. */
export function isHeifUpload(file: { data?: Buffer; mimetype?: string | null; name?: string | null }): boolean {
  if (isHeifFile({ name: file.name, type: file.mimetype })) return true;
  const head = file.data;
  if (!head || head.length < 12 || head.toString("latin1", 4, 8) !== "ftyp") return false;
  return HEIF_BRANDS.has(head.toString("latin1", 8, 12));
}

/** Refuses Apple ProRAW/DNG with a specific message. */
export function assertNotRawPhoto(file: { mimetype?: string | null; name?: string | null }): void {
  if (isRawPhotoFile({ name: file.name, type: file.mimetype })) throw new APIError(PRORAW_UNSUPPORTED_MESSAGE, 415);
}

type HeifImage = { get_width(): number; get_height(): number; display(target: { data: Uint8ClampedArray; width: number; height: number }, done: (result: unknown) => void): void };
type HeifModule = { HeifDecoder: new () => { decode(data: Uint8Array): HeifImage[] } };

let libheif: Promise<HeifModule> | undefined;
/** Loaded on first use: the WebAssembly bundle is large and most requests never see a HEIC. */
function heifModule(): Promise<HeifModule> {
  libheif ??= import("libheif-js/wasm-bundle").then((mod) => ((mod as { default?: HeifModule }).default ?? mod) as HeifModule);
  return libheif;
}

async function decodeToRgba(data: Buffer): Promise<{ rgba: Buffer; width: number; height: number }> {
  const heif = await heifModule();
  const images = new heif.HeifDecoder().decode(data);
  if (!images.length) throw new Error("no image");
  // The primary image is first; if a file carries several top-level images, the largest is the photograph.
  const image = images.reduce((best, next) => (next.get_width() * next.get_height() > best.get_width() * best.get_height() ? next : best));
  const width = image.get_width();
  const height = image.get_height();
  if (!width || !height) throw new Error("empty image");
  if (width * height > HEIF_MAX_PIXELS) throw new APIError("That photo is too large to process.", 413);
  const target = { data: new Uint8ClampedArray(width * height * 4), width, height };
  await new Promise<void>((resolve, reject) => image.display(target, (result) => (result ? resolve() : reject(new Error("decode failed")))));
  return { rgba: Buffer.from(target.data.buffer, target.data.byteOffset, target.data.byteLength), width, height };
}

/** Sets the EXIF Orientation (IFD0 tag 0x0112) to 1. The pixels are already upright. Returns a copy; unknown layouts return the input untouched. */
export function resetExifOrientation(exif: Buffer): Buffer {
  const copy = Buffer.from(exif);
  const base = copy.toString("latin1", 0, 6) === "Exif\u0000\u0000" ? 6 : 0;
  const order = copy.toString("latin1", base, base + 2);
  const little = order === "II";
  if (!little && order !== "MM") return copy;
  const u16 = (at: number) => (at + 2 <= copy.length ? (little ? copy.readUInt16LE(at) : copy.readUInt16BE(at)) : -1);
  const u32 = (at: number) => (at + 4 <= copy.length ? (little ? copy.readUInt32LE(at) : copy.readUInt32BE(at)) : -1);
  const ifd = u32(base + 4);
  const count = ifd < 0 ? -1 : u16(base + ifd);
  if (count < 0 || count > 512) return copy;
  for (let index = 0; index < count; index++) {
    const entry = base + ifd + 2 + index * 12;
    if (u16(entry) === 0x0112 && entry + 12 <= copy.length) {
      if (little) copy.writeUInt16LE(1, entry + 8);
      else copy.writeUInt16BE(1, entry + 8);
      break;
    }
  }
  return copy;
}

/** Adds an EXIF APP1 and ICC APP2 segment(s) after the JPEG's SOI marker. Metadata that does not fit a segment is dropped, never truncated. */
export function injectJpegMetadata(jpeg: Buffer, parts: { exif?: Buffer | null; icc?: Buffer | null }): Buffer {
  if (jpeg.length < 2 || jpeg[0] !== 0xff || jpeg[1] !== 0xd8) return jpeg;
  const segments: Buffer[] = [];
  const segment = (marker: number, payload: Buffer) => {
    const header = Buffer.from([0xff, marker, 0, 0]);
    header.writeUInt16BE(payload.length + 2, 2);
    return Buffer.concat([header, payload]);
  };
  const exif = parts.exif ? (parts.exif.toString("latin1", 0, 6) === "Exif\u0000\u0000" ? parts.exif : Buffer.concat([Buffer.from("Exif\u0000\u0000", "latin1"), parts.exif])) : null;
  if (exif && exif.length <= 0xffff - 2) segments.push(segment(0xe1, exif));
  if (parts.icc?.length) {
    const chunk = 0xffff - 2 - 14;
    const total = Math.ceil(parts.icc.length / chunk);
    if (total <= 255) {
      for (let index = 0; index < total; index++) {
        const tag = Buffer.from("ICC_PROFILE\u0000\u0000\u0000", "latin1");
        tag[12] = index + 1;
        tag[13] = total;
        segments.push(segment(0xe2, Buffer.concat([tag, parts.icc.subarray(index * chunk, (index + 1) * chunk)])));
      }
    }
  }
  return Buffer.concat([jpeg.subarray(0, 2), ...segments, jpeg.subarray(2)]);
}

const jpegName = (name: string) => `${(name || "photo").replace(/\.[^./\\]*$/, "") || "photo"}.jpg`;

/**
 * Decodes a HEIC/HEIF upload to a full-resolution JPEG. Files that are not
 * HEIC pass through unchanged (`converted: false`). A file that claims to be
 * HEIC but cannot be decoded is refused with a message a reporter can act on.
 */
export async function normalizeHeifUpload<T extends UploadedFile>(file: T): Promise<{ file: T; converted: boolean }> {
  assertNotRawPhoto(file);
  if (!isHeifUpload(file)) return { file, converted: false };
  let jpeg: Buffer;
  try {
    // Header-only reads: sharp understands the HEIF container (dimensions, EXIF, ICC) even without an HEVC decoder.
    const meta = await sharp(file.data, { limitInputPixels: HEIF_MAX_PIXELS }).metadata().catch(() => null);
    const { rgba, width, height } = await decodeToRgba(file.data);
    const pixels = await sharp(rgba, { raw: { width, height, channels: 4 }, limitInputPixels: HEIF_MAX_PIXELS })
      .removeAlpha()
      .jpeg({ quality: 95, chromaSubsampling: "4:4:4" })
      .toBuffer();
    jpeg = injectJpegMetadata(pixels, { exif: meta?.exif ? resetExifOrientation(meta.exif) : null, icc: meta?.icc ?? null });
  } catch (error) {
    if (error instanceof APIError) throw error;
    throw new APIError("That HEIC photo couldn't be read. Try sharing it from Photos as a JPEG, or choose it again.", 422);
  }
  return { file: { ...file, data: jpeg, size: jpeg.length, mimetype: "image/jpeg", name: jpegName(file.name) }, converted: true };
}
