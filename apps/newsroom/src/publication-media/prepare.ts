import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { IMAGE_CROP_SHAPE_DETAILS, autoCrop, cropPixelBox, normalizeArtDirectionIntent, type CropRect, type ImageArtDirectionIntent, type ImageCropShape } from "@byline/core";
import {
  PUBLICATION_CROP_FAMILY_SHAPES,
  PUBLICATION_MEDIA_SCHEMA_VERSION,
  PUBLICATION_SEO_RATIOS,
  publicationMediaPath,
  validatePublicationMediaManifest,
  type PublicationBlob,
  type PublicationFileManifest,
  type PublicationImageFile,
  type PublicationImageManifest,
  type PublicationMediaKind,
  type PublicationMediaManifest,
  type PublicationMediaWarning,
  type PublicationMimeType,
  type PublicationSeoRatio
} from "@byline/content";
import sharp, { type OutputInfo, type Sharp } from "sharp";
import type { PublicationStore } from "./blob-store";
import { PUBLICATION_RECIPE } from "./recipe";

/**
 * Prepares one Media source into immutable publication files under the
 * current recipe (`recipe.ts`) and returns their manifest. Pure with respect
 * to Payload: it reads the private original, writes only to the publication
 * store, and never touches the database. The job (`task.ts`) decides whether
 * the result may be promoted.
 *
 * Images: decoded once, oriented (EXIF orientation applied before any crop or
 * resize), converted to sRGB; every output is re-encoded without metadata, so
 * no EXIF, GPS or camera data survives. Nothing is ever upscaled.
 * - natural: the whole photo at the recipe widths up to the source width;
 * - crops: only the editor's explicit crops, at the shape's own widths;
 * - SEO: one 16:9, 4:3 and 1:1 candidate (an explicit crop's largest file when
 *   one exists, otherwise one automatic focal-point crop);
 * - social: one 1200×630 JPEG (explicit Social crop or automatic).
 * Animated GIF/WebP: a bounded animated WebP plus first-frame stills for the
 * rest; custom crops do not apply to animation.
 * PDF and audio: validated, exact-byte copies.
 */
export class PreparationError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
  }
}

export type PreparationSource = {
  /** The private original on the newsroom volume. */
  path: string;
  mimeType: string;
  /** The Media filename (only its stem reaches public paths). */
  filename: string;
  artDirection: unknown;
};

export type PreparationResult = { manifest: PublicationMediaManifest; sourceHash: string };

const LIMIT = PUBLICATION_RECIPE.maxOutputBytes;
const MIB = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

async function readSource(source: PreparationSource) {
  let info;
  try {
    info = await stat(source.path);
  } catch {
    throw new PreparationError("source-missing", "The original file is missing from the newsroom's storage.");
  }
  if (!info.isFile() || info.size === 0) throw new PreparationError("source-missing", "The original file is empty or missing.");
  const data = await readFile(source.path);
  return { data, sourceHash: createHash("sha256").update(data).digest("hex") };
}

async function store(output: Buffer, ctx: { store: PublicationStore; filename: string; kind: PublicationMediaKind }, label: string, mimeType: PublicationMimeType) {
  if (output.length > LIMIT) throw new PreparationError("output-too-large", `A prepared file (${label}) is ${MIB(output.length)}, over the ${MIB(LIMIT)} static file limit.`);
  const saved = await ctx.store.put(output);
  const blob: PublicationBlob = { sha256: saved.sha256, bytes: saved.bytes, mimeType, publicPath: publicationMediaPath({ kind: ctx.kind, filename: ctx.filename, label, sha256: saved.sha256, mimeType }) };
  return blob;
}

/* ------------------------------------------------------------------ files */

function looksLike(mimeType: string, data: Buffer): boolean {
  const ascii = (start: number, end: number) => data.subarray(start, end).toString("latin1");
  switch (mimeType) {
    case "application/pdf":
      return ascii(0, 5) === "%PDF-" && data.subarray(Math.max(0, data.length - 1024)).toString("latin1").includes("%%EOF");
    case "audio/mpeg":
      return ascii(0, 3) === "ID3" || (data[0] === 0xff && (data[1] & 0xe0) === 0xe0);
    case "audio/mp4":
      return ascii(4, 8) === "ftyp";
    case "audio/wav":
      return ascii(0, 4) === "RIFF" && ascii(8, 12) === "WAVE";
    default:
      return false;
  }
}

async function prepareFile(source: PreparationSource, data: Buffer, ctx: { store: PublicationStore; filename: string }): Promise<PublicationFileManifest> {
  const kind = source.mimeType === "application/pdf" ? "document" : "audio";
  if (!looksLike(source.mimeType, data)) throw new PreparationError("source-invalid", `This file is not a valid ${kind === "document" ? "PDF" : "audio file"}.`);
  if (data.length > LIMIT) throw new PreparationError("file-too-large", `This ${kind === "document" ? "PDF" : "audio file"} is ${MIB(data.length)}; published files must be ${MIB(LIMIT)} or smaller. Upload a smaller version.`);
  const file = await store(data, { ...ctx, kind }, "file", source.mimeType as PublicationMimeType);
  return { schemaVersion: PUBLICATION_MEDIA_SCHEMA_VERSION, recipeVersion: PUBLICATION_RECIPE.version, kind, file };
}

/* ----------------------------------------------------------------- images */

type Still = { raw: Buffer; width: number; height: number; channels: 1 | 2 | 3 | 4; opaque: boolean; graphic: boolean };

async function decodeStill(data: Buffer): Promise<{ still: Still; format: string; frames: number; frameHeight: number }> {
  let meta;
  try {
    meta = await sharp(data, { limitInputPixels: PUBLICATION_RECIPE.limitInputPixels }).metadata();
  } catch (error) {
    throw new PreparationError("source-unreadable", `This image could not be read (${(error as Error).message.slice(0, 120)}).`);
  }
  const frames = meta.pages ?? 1;
  try {
    const { data: raw, info } = await sharp(data, { limitInputPixels: PUBLICATION_RECIPE.limitInputPixels, failOn: "error", page: 0, pages: 1 })
      .autoOrient()
      .toColourspace("srgb")
      .raw()
      .toBuffer({ resolveWithObject: true });
    const channels = info.channels as Still["channels"];
    const opaque = channels % 2 === 1 || (await sharp(raw, { raw: { width: info.width, height: info.height, channels } }).stats()).isOpaque;
    // Graphics (PNG/GIF art, anything with real transparency) keep exact pixels.
    const graphic = !opaque || meta.format === "png" || meta.format === "gif";
    return { still: { raw, width: info.width, height: info.height, channels, opaque, graphic }, format: meta.format ?? "", frames, frameHeight: meta.pageHeight ?? meta.height ?? info.height };
  } catch (error) {
    if (error instanceof PreparationError) throw error;
    throw new PreparationError("source-unreadable", `This image could not be decoded (${(error as Error).message.slice(0, 120)}).`);
  }
}

function fromStill(still: Still): Sharp {
  const image = sharp(still.raw, { raw: { width: still.width, height: still.height, channels: still.channels }, limitInputPixels: PUBLICATION_RECIPE.limitInputPixels });
  return still.opaque && still.channels === 4 ? image.removeAlpha() : image;
}

async function encode(image: Sharp, still: Still, as: "webp" | "jpeg"): Promise<{ data: Buffer; width: number; height: number }> {
  const pipeline = as === "jpeg"
    ? image.flatten({ background: "#ffffff" }).jpeg(PUBLICATION_RECIPE.socialJpeg)
    : still.graphic ? image.webp(PUBLICATION_RECIPE.webpLossless) : image.webp(PUBLICATION_RECIPE.webp);
  const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

async function imageFile(ctx: ImageContext, label: string, image: Sharp, as: "webp" | "jpeg" = "webp"): Promise<PublicationImageFile> {
  const out = await encode(image, ctx.still, as);
  const blob = await store(out.data, ctx, label, as === "jpeg" ? "image/jpeg" : "image/webp");
  return { ...blob, width: out.width, height: out.height };
}

type ImageContext = { store: PublicationStore; filename: string; kind: "image"; still: Still; warnings: PublicationMediaWarning[] };

/**
 * Never upscales: the widths at or below `available`, plus `available` itself
 * when larger targets had to be dropped (so the sharpest real file is still
 * offered), or only `available` when even the smallest target is too big.
 */
export function widthsWithin(widths: readonly number[], available: number) {
  const size = Math.max(1, Math.floor(available));
  const fit = widths.filter((width) => width <= size);
  if (!fit.length) return [size];
  return fit.length < widths.length && fit[fit.length - 1] < size ? [...fit, size] : fit;
}

const ratioHeight = (shape: ImageCropShape, width: number) => {
  const [w, h] = IMAGE_CROP_SHAPE_DETAILS[shape].ratio;
  return Math.max(1, Math.round((width * h) / w));
};

function cropped(ctx: ImageContext, rect: CropRect, shape: ImageCropShape, width: number) {
  const box = cropPixelBox(rect, ctx.still);
  return fromStill(ctx.still).extract(box).resize({ width, height: ratioHeight(shape, width), fit: "cover", position: "centre" });
}

async function prepareImage(source: PreparationSource, data: Buffer, store: PublicationStore): Promise<PublicationImageManifest> {
  const decoded = await decodeStill(data);
  const { still } = decoded;
  const animatedSource = decoded.frames > 1 && (decoded.format === "gif" || decoded.format === "webp");
  const warnings: PublicationMediaWarning[] = [];
  const ctx: ImageContext = { store, filename: source.filename, kind: "image", still, warnings };
  const dimensions = { width: still.width, height: still.height };
  const stored = normalizeArtDirectionIntent(source.artDirection, dimensions);
  // Custom crops are not offered for animation; the focal point still places its stills.
  const intent: ImageArtDirectionIntent = animatedSource ? { ...stored, crops: {} } : stored;

  // Natural responsive family.
  const natural: PublicationImageFile[] = [];
  for (const width of widthsWithin(PUBLICATION_RECIPE.naturalWidths, still.width)) {
    natural.push(await imageFile(ctx, `w${width}`, fromStill(still).resize({ width, withoutEnlargement: true })));
  }
  if (still.width < PUBLICATION_RECIPE.seo.preferredMinWidth) warnings.push({ code: "low-resolution-natural", message: `This image is ${still.width}px wide; it may look soft on large screens.` });

  // Explicit editor crops.
  const crops: PublicationImageManifest["crops"] = {};
  for (const shape of PUBLICATION_CROP_FAMILY_SHAPES) {
    const rect = intent.crops[shape];
    if (!rect) continue;
    const box = cropPixelBox(rect, dimensions);
    const widths = widthsWithin(PUBLICATION_RECIPE.cropWidths(shape), box.width);
    if (box.width < PUBLICATION_RECIPE.cropWidths(shape)[0]) warnings.push({ code: "low-resolution-crop", target: shape, message: `The ${IMAGE_CROP_SHAPE_DETAILS[shape].label} crop is only ${box.width}px wide.` });
    const renditions: PublicationImageFile[] = [];
    for (const width of widths) renditions.push(await imageFile(ctx, `${shape}-${width}`, cropped(ctx, rect, shape, width)));
    crops[shape] = { rect, renditions };
  }

  // SEO candidates: reuse an explicit crop's largest file, else one automatic crop.
  const seo = {} as PublicationImageManifest["seo"];
  for (const ratio of Object.keys(PUBLICATION_SEO_RATIOS) as PublicationSeoRatio[]) {
    const shape = PUBLICATION_SEO_RATIOS[ratio];
    const family = crops[shape];
    let file: PublicationImageFile;
    let origin: "custom" | "auto";
    if (family) {
      file = family.renditions[family.renditions.length - 1];
      origin = "custom";
    } else {
      const rect = autoCrop(shape, intent.focalPoint, still.width, still.height);
      const width = Math.min(PUBLICATION_RECIPE.seo.width, cropPixelBox(rect, dimensions).width);
      file = await imageFile(ctx, `seo-${ratio}`, cropped(ctx, rect, shape, width));
      origin = "auto";
    }
    if (file.width < PUBLICATION_RECIPE.seo.preferredMinWidth) warnings.push({ code: "low-resolution-seo", target: ratio, message: `The ${ratio.replace("x", ":")} search image is ${file.width}px wide; search engines prefer at least ${PUBLICATION_RECIPE.seo.preferredMinWidth}px.` });
    seo[ratio] = { ...file, origin };
  }

  // Social: always a real 1200×630 crop when the source allows; never invented pixels.
  const socialRect = intent.crops.social ?? autoCrop("social", intent.focalPoint, still.width, still.height);
  const socialWidth = Math.min(PUBLICATION_RECIPE.social.width, cropPixelBox(socialRect, dimensions).width);
  if (socialWidth < PUBLICATION_RECIPE.social.width) warnings.push({ code: "low-resolution-social", message: `The social image is only ${socialWidth}px wide (1200px is best); it will look soft when shared.` });
  const social = { ...(await imageFile(ctx, "social", cropped(ctx, socialRect, "social", socialWidth), "jpeg")), origin: intent.crops.social ? "custom" as const : "auto" as const };

  const animation = animatedSource ? await prepareAnimation(data, decoded, ctx) : null;

  return {
    schemaVersion: PUBLICATION_MEDIA_SCHEMA_VERSION,
    recipeVersion: PUBLICATION_RECIPE.version,
    kind: "image",
    source: { width: still.width, height: still.height, animated: animatedSource, hasAlpha: !still.opaque },
    focalPoint: intent.focalPoint,
    natural,
    crops,
    seo,
    social,
    animation,
    warnings
  };
}

/** A bounded animated WebP. Refuses (never silently flattens) an animation over the decode limits. */
async function prepareAnimation(data: Buffer, decoded: { frames: number; frameHeight: number; still: Still }, ctx: ImageContext): Promise<PublicationImageFile & { frames: number }> {
  const limits = PUBLICATION_RECIPE.animation;
  const frameWidth = decoded.still.width;
  const decodedPixels = frameWidth * decoded.frameHeight * decoded.frames;
  if (decoded.frames > limits.maxFrames) throw new PreparationError("animation-too-long", `This animation has ${decoded.frames} frames; the limit is ${limits.maxFrames}.`);
  if (decodedPixels > limits.maxDecodedPixels) throw new PreparationError("animation-too-large", "This animation is too large to prepare safely. Use a shorter or smaller animation.");
  let out: { data: Buffer; info: OutputInfo };
  try {
    out = await sharp(data, { animated: true, limitInputPixels: limits.maxDecodedPixels })
      .resize({ width: limits.maxEdge, height: limits.maxEdge, fit: "inside", withoutEnlargement: true })
      .webp(limits.webp)
      .toBuffer({ resolveWithObject: true });
  } catch (error) {
    throw new PreparationError("animation-unreadable", `This animation could not be prepared (${(error as Error).message.slice(0, 120)}).`);
  }
  const check = await sharp(out.data, { animated: true }).metadata();
  const frames = check.pages ?? 1;
  if (frames !== decoded.frames) throw new PreparationError("animation-flattened", "The animation lost frames while it was prepared.");
  const blob = await store(out.data, ctx, "animated", "image/webp");
  return { ...blob, width: check.width ?? out.info.width, height: check.pageHeight ?? out.info.height, frames };
}

/* ------------------------------------------------------------------- entry */

export async function preparePublicationMedia(source: PreparationSource, publicationStore: PublicationStore): Promise<PreparationResult> {
  const { data, sourceHash } = await readSource(source);
  const mimeType = source.mimeType.toLowerCase();
  let manifest: PublicationMediaManifest;
  if (mimeType.startsWith("image/")) manifest = await prepareImage(source, data, publicationStore);
  else if (mimeType === "application/pdf" || mimeType.startsWith("audio/")) manifest = await prepareFile({ ...source, mimeType }, data, { store: publicationStore, filename: source.filename });
  else throw new PreparationError("unsupported-type", "Byline does not publish this kind of file.");
  const validation = validatePublicationMediaManifest(manifest);
  if (!validation.ok) throw new PreparationError("invalid-manifest", `The prepared files did not validate: ${validation.errors.slice(0, 3).join("; ")}.`);
  return { manifest, sourceHash };
}
