import { IMAGE_CROP_SHAPES, isImageCropShape, type CropRect, type FocalPoint, type ImageCropShape, type ImageRendition } from "@byline/core";

/**
 * Prepared publication media: the closed, public-safe description of the
 * immutable files a Media asset publishes as. The newsroom prepares them
 * (private originals never leave it); a static build acquires exactly the
 * files a manifest names and serves them from `/_byline/media/`.
 *
 * Provider-neutral and runtime-free: no CMS, filesystem, image library or
 * framework. A manifest never contains filesystem paths, CMS URLs, original
 * filenames' directories, credentials or anything private: only content
 * hashes, byte counts, MIME types, dimensions and fingerprinted public paths.
 *
 * Two versions, deliberately separate:
 * - `PUBLICATION_MEDIA_SCHEMA_VERSION`: the shape of this manifest.
 * - `PUBLICATION_MEDIA_RECIPE_VERSION`: how files are prepared (sizes,
 *   formats, quality). Bumping it makes every older generation stale even
 *   where a record still says `ready`.
 *
 * Full documentation: docs/publication-media.md.
 */
export const PUBLICATION_MEDIA_SCHEMA_VERSION = 1 as const;
export const PUBLICATION_MEDIA_RECIPE_VERSION = 1;

/** Cloudflare Workers Static Assets refuses any single file larger than 25 MiB. */
export const PUBLICATION_STATIC_ASSET_MAX_BYTES = 25 * 1024 * 1024;

export const PUBLICATION_MEDIA_PATH_PREFIX = "/_byline/media/";

/** Every public MIME type a prepared file may have, and its extension. */
export const PUBLICATION_MEDIA_TYPES = {
  "image/webp": "webp",
  "image/jpeg": "jpg",
  "application/pdf": "pdf",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/wav": "wav"
} as const;
export type PublicationMimeType = keyof typeof PUBLICATION_MEDIA_TYPES;

export type PublicationMediaKind = "image" | "document" | "audio";
const KIND_DIRECTORY: Record<PublicationMediaKind, string> = { image: "images", document: "documents", audio: "audio" };

/** One immutable prepared file. */
export type PublicationBlob = {
  /** Full lowercase hex SHA-256 of the file's bytes. */
  sha256: string;
  bytes: number;
  mimeType: PublicationMimeType;
  /** Fingerprinted path under `/_byline/media/`, never reused for other bytes. */
  publicPath: string;
  width?: number;
  height?: number;
};

export type PublicationImageFile = PublicationBlob & { width: number; height: number };

/** The three crawlable Article/NewsArticle image ratios. */
export const PUBLICATION_SEO_RATIOS = { "16x9": "wide", "4x3": "standard", "1x1": "square" } as const satisfies Record<string, ImageCropShape>;
export type PublicationSeoRatio = keyof typeof PUBLICATION_SEO_RATIOS;

/** Shapes that get explicit responsive crop families. Social is its own single file. */
export const PUBLICATION_CROP_FAMILY_SHAPES = IMAGE_CROP_SHAPES.filter((shape) => shape !== "social") as Exclude<ImageCropShape, "social">[];
export type PublicationCropFamilyShape = (typeof PUBLICATION_CROP_FAMILY_SHAPES)[number];

export type PublicationMediaWarningCode = "low-resolution-natural" | "low-resolution-crop" | "low-resolution-seo" | "low-resolution-social" | "animation-still-only";
export type PublicationMediaWarning = { code: PublicationMediaWarningCode; target?: string; message: string };

export type PublicationImageManifest = {
  schemaVersion: typeof PUBLICATION_MEDIA_SCHEMA_VERSION;
  recipeVersion: number;
  kind: "image";
  /** The oriented source's size (never its file). */
  source: { width: number; height: number; animated: boolean; hasAlpha: boolean };
  /** Editorial focal point the automatic crops used (CSS `object-position` on natural files). */
  focalPoint: FocalPoint;
  /** The whole photo, smallest first. The largest is the public fallback/source. Stills for an animation. */
  natural: PublicationImageFile[];
  /** Explicit editor crops only, smallest first per shape. An automatic crop is the natural file plus the focal point. */
  crops: Partial<Record<PublicationCropFamilyShape, { rect: CropRect; renditions: PublicationImageFile[] }>>;
  /** One high-resolution crawlable candidate per ratio. */
  seo: Record<PublicationSeoRatio, PublicationImageFile & { origin: "custom" | "auto" }>;
  /** The share image (1200×630 when the source allows). */
  social: PublicationImageFile & { origin: "custom" | "auto" };
  /** A bounded animated file, for an animated source. `natural`, SEO and social are its first frame. */
  animation: (PublicationImageFile & { frames: number }) | null;
  warnings: PublicationMediaWarning[];
};

export type PublicationFileManifest = {
  schemaVersion: typeof PUBLICATION_MEDIA_SCHEMA_VERSION;
  recipeVersion: number;
  kind: "document" | "audio";
  /** An exact-byte copy of the validated original. */
  file: PublicationBlob;
};

export type PublicationMediaManifest = PublicationImageManifest | PublicationFileManifest;

/* ------------------------------------------------------------ public paths */

const SHA256 = /^[0-9a-f]{64}$/;
const LABEL = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PATH = /^\/_byline\/media\/(images|documents|audio)\/([0-9a-f]{2})\/([a-z0-9]+(?:-[a-z0-9]+)*)--([a-z0-9]+(?:-[a-z0-9]+)*)--([0-9a-f]{16})\.([a-z0-9]+)$/;

export function isSha256(value: unknown): value is string {
  return typeof value === "string" && SHA256.test(value);
}

/** A readable, safe stem from a filename: `Marching Band (2).JPG` → `marching-band-2`. */
export function publicationMediaStem(filename: string) {
  const base = filename.replace(/\.[A-Za-z0-9]{1,8}$/, "");
  const stem = base.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60).replace(/-+$/, "");
  return stem || "media";
}

/**
 * The one place a prepared file's public path is made:
 * `/_byline/media/images/ab/marching-band--wide-1920--abcdef0123456789.webp`.
 * The directory and fingerprint come from the content hash, so different
 * bytes never share a path and a path is never overwritten.
 */
export function publicationMediaPath(input: { kind: PublicationMediaKind; filename: string; label: string; sha256: string; mimeType: PublicationMimeType }) {
  if (!isSha256(input.sha256)) throw new Error("A publication path needs a full SHA-256.");
  if (!LABEL.test(input.label) || input.label.length > 40) throw new Error(`Invalid publication label "${input.label}".`);
  const extension = PUBLICATION_MEDIA_TYPES[input.mimeType];
  if (!extension) throw new Error(`Unsupported publication type ${input.mimeType}.`);
  return `${PUBLICATION_MEDIA_PATH_PREFIX}${KIND_DIRECTORY[input.kind]}/${input.sha256.slice(0, 2)}/${publicationMediaStem(input.filename)}--${input.label}--${input.sha256.slice(0, 16)}.${extension}`;
}

/** True when a path is a well-formed publication path for exactly these bytes and type. */
export function isPublicationMediaPath(path: unknown, sha256?: string, mimeType?: string): path is string {
  if (typeof path !== "string" || path.length > 200) return false;
  const match = PATH.exec(path);
  if (!match) return false;
  const [, , dir, , , fingerprint, extension] = match;
  if (sha256 !== undefined && (dir !== sha256.slice(0, 2) || fingerprint !== sha256.slice(0, 16))) return false;
  if (mimeType !== undefined && PUBLICATION_MEDIA_TYPES[mimeType as PublicationMimeType] !== extension) return false;
  return true;
}

/* -------------------------------------------------------------- validation */

const positiveInt = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value > 0;
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

function unexpectedFields(value: Record<string, unknown>, allowed: readonly string[], where: string): string[] {
  return Object.keys(value).filter((key) => !allowed.includes(key)).map((key) => `${where}: unexpected field ${key}`);
}

function blobErrors(value: unknown, where: string, options: { image: boolean }): string[] {
  if (!isRecord(value)) return [`${where}: not a file descriptor`];
  const errors: string[] = [];
  if (!isSha256(value.sha256)) errors.push(`${where}: sha256 must be 64 lowercase hex characters`);
  if (!positiveInt(value.bytes)) errors.push(`${where}: bytes must be a positive integer`);
  else if (value.bytes > PUBLICATION_STATIC_ASSET_MAX_BYTES) errors.push(`${where}: larger than the static asset limit`);
  if (typeof value.mimeType !== "string" || !(value.mimeType in PUBLICATION_MEDIA_TYPES)) errors.push(`${where}: unsupported MIME type`);
  if (options.image && value.mimeType !== "image/webp" && value.mimeType !== "image/jpeg") errors.push(`${where}: images publish as WebP or JPEG`);
  if (!isPublicationMediaPath(value.publicPath, isSha256(value.sha256) ? value.sha256 : undefined, typeof value.mimeType === "string" ? value.mimeType : undefined)) errors.push(`${where}: unsafe or mismatched public path`);
  if (options.image && (!positiveInt(value.width) || !positiveInt(value.height))) errors.push(`${where}: images need width and height`);
  if (!options.image && (value.width !== undefined || value.height !== undefined) && (!positiveInt(value.width) || !positiveInt(value.height))) errors.push(`${where}: invalid dimensions`);
  const allowed = new Set(["sha256", "bytes", "mimeType", "publicPath", "width", "height", "origin", "frames"]);
  for (const key of Object.keys(value)) if (!allowed.has(key)) errors.push(`${where}: unexpected field ${key}`);
  return errors;
}

function ladderErrors(value: unknown, where: string): string[] {
  if (!Array.isArray(value) || value.length === 0) return [`${where}: needs at least one file`];
  const errors = value.flatMap((item, index) => blobErrors(item, `${where}[${index}]`, { image: true }));
  if (!errors.length) {
    for (let index = 1; index < value.length; index++) {
      if ((value[index] as PublicationImageFile).width <= (value[index - 1] as PublicationImageFile).width) errors.push(`${where}: widths must increase`);
    }
  }
  return errors;
}

function rectValid(value: unknown) {
  if (!isRecord(value)) return false;
  const { x, y, w, h } = value;
  const ok = (n: unknown) => typeof n === "number" && Number.isFinite(n);
  return ok(x) && ok(y) && ok(w) && ok(h) && (x as number) >= 0 && (y as number) >= 0 && (w as number) > 0 && (h as number) > 0 && (x as number) + (w as number) <= 1.000001 && (y as number) + (h as number) <= 1.000001;
}

export type PublicationManifestValidation = { ok: true; manifest: PublicationMediaManifest } | { ok: false; errors: string[] };

/** Validates a manifest from storage or the network. Anything unexpected is an error, never ignored. */
export function validatePublicationMediaManifest(value: unknown): PublicationManifestValidation {
  if (!isRecord(value)) return { ok: false, errors: ["manifest: not an object"] };
  const errors: string[] = [];
  if (value.schemaVersion !== PUBLICATION_MEDIA_SCHEMA_VERSION) errors.push("manifest: unsupported schemaVersion");
  if (!positiveInt(value.recipeVersion)) errors.push("manifest: recipeVersion must be a positive integer");
  if (value.kind === "document" || value.kind === "audio") {
    errors.push(...blobErrors(value.file, "file", { image: false }));
    if (isRecord(value.file) && typeof value.file.mimeType === "string") {
      const expected = value.kind === "document" ? value.file.mimeType === "application/pdf" : value.file.mimeType.startsWith("audio/");
      if (!expected) errors.push(`file: wrong type for ${value.kind}`);
    }
    for (const key of Object.keys(value)) if (!["schemaVersion", "recipeVersion", "kind", "file"].includes(key)) errors.push(`manifest: unexpected field ${key}`);
  } else if (value.kind === "image") {
    const source = value.source;
    if (!isRecord(source) || !positiveInt(source.width) || !positiveInt(source.height) || typeof source.animated !== "boolean" || typeof source.hasAlpha !== "boolean") errors.push("source: needs width, height, animated and hasAlpha");
    if (isRecord(source)) errors.push(...unexpectedFields(source, ["width", "height", "animated", "hasAlpha"], "source"));
    const focal = value.focalPoint;
    if (!isRecord(focal) || typeof focal.x !== "number" || typeof focal.y !== "number" || !(focal.x >= 0 && focal.x <= 100 && focal.y >= 0 && focal.y <= 100)) errors.push("focalPoint: must be 0–100");
    if (isRecord(focal)) errors.push(...unexpectedFields(focal, ["x", "y"], "focalPoint"));
    errors.push(...ladderErrors(value.natural, "natural"));
    if (!isRecord(value.crops)) errors.push("crops: must be an object");
    else {
      for (const [shape, family] of Object.entries(value.crops)) {
        if (!isImageCropShape(shape) || shape === "social") { errors.push(`crops: unknown shape ${shape}`); continue; }
        if (!isRecord(family) || !rectValid(family.rect)) { errors.push(`crops.${shape}: needs a crop rectangle`); continue; }
        errors.push(...unexpectedFields(family, ["rect", "renditions"], `crops.${shape}`));
        if (isRecord(family.rect)) errors.push(...unexpectedFields(family.rect, ["x", "y", "w", "h"], `crops.${shape}.rect`));
        errors.push(...ladderErrors(family.renditions, `crops.${shape}.renditions`));
      }
    }
    if (!isRecord(value.seo)) errors.push("seo: must be an object");
    else {
      for (const ratio of Object.keys(PUBLICATION_SEO_RATIOS)) {
        const file = value.seo[ratio];
        errors.push(...blobErrors(file, `seo.${ratio}`, { image: true }));
        if (isRecord(file) && file.origin !== "custom" && file.origin !== "auto") errors.push(`seo.${ratio}: origin must be custom or auto`);
      }
      for (const key of Object.keys(value.seo)) if (!(key in PUBLICATION_SEO_RATIOS)) errors.push(`seo: unexpected ratio ${key}`);
    }
    errors.push(...blobErrors(value.social, "social", { image: true }));
    if (isRecord(value.social) && value.social.origin !== "custom" && value.social.origin !== "auto") errors.push("social: origin must be custom or auto");
    if (value.animation !== null) {
      errors.push(...blobErrors(value.animation, "animation", { image: true }));
      if (isRecord(value.animation) && (!positiveInt(value.animation.frames) || value.animation.mimeType !== "image/webp")) errors.push("animation: needs a frame count and WebP");
      if (isRecord(source) && source.animated !== true) errors.push("animation: present for a still source");
    } else if (isRecord(source) && source.animated === true) errors.push("animation: missing for an animated source");
    if (!Array.isArray(value.warnings) || !value.warnings.every((warning) => isRecord(warning) && typeof warning.code === "string" && typeof warning.message === "string" && (warning.target === undefined || typeof warning.target === "string") && Object.keys(warning).every((key) => key === "code" || key === "target" || key === "message"))) errors.push("warnings: must be a list of {code, message}");
    const allowed = ["schemaVersion", "recipeVersion", "kind", "source", "focalPoint", "natural", "crops", "seo", "social", "animation", "warnings"];
    for (const key of Object.keys(value)) if (!allowed.includes(key)) errors.push(`manifest: unexpected field ${key}`);
  } else {
    errors.push("manifest: unknown kind");
  }
  return errors.length ? { ok: false, errors } : { ok: true, manifest: value as unknown as PublicationMediaManifest };
}

/** Every distinct file a manifest names (one per public path), for acquisition and existence checks. */
export function publicationManifestBlobs(manifest: PublicationMediaManifest): PublicationBlob[] {
  const all: PublicationBlob[] = manifest.kind === "image"
    ? [
        ...manifest.natural,
        ...Object.values(manifest.crops).flatMap((family) => family?.renditions ?? []),
        ...Object.values(manifest.seo),
        manifest.social,
        ...(manifest.animation ? [manifest.animation] : [])
      ]
    : [manifest.file];
  const byPath = new Map<string, PublicationBlob>();
  for (const blob of all) {
    if (byPath.has(blob.publicPath)) continue;
    const { sha256, bytes, mimeType, publicPath, width, height } = blob;
    byPath.set(publicPath, { sha256, bytes, mimeType, publicPath, ...(width !== undefined ? { width } : {}), ...(height !== undefined ? { height } : {}) });
  }
  return [...byPath.values()];
}

/* --------------------------------------------------------------- readiness */

export type PublicationAssetStatus = "not-prepared" | "preparing" | "ready" | "failed";

/** What a CMS stores about an asset's prepared generation (field names are the contract, storage is not). */
export type PublicationAssetsRecord = {
  status?: string | null;
  preparedRevision?: number | null;
  recipeVersion?: number | null;
  manifest?: unknown;
};

export type PublicationNotReadyReason = "not-prepared" | "preparing" | "failed" | "stale-revision" | "stale-recipe" | "invalid-manifest";

export type PublicationReadiness = { ready: true; manifest: PublicationMediaManifest } | { ready: false; reason: PublicationNotReadyReason };

/**
 * The one rule for "this asset's prepared files are current": the record says
 * ready, for the asset's current publication revision, under today's recipe,
 * with a valid manifest of that recipe. Never test `status === "ready"` alone.
 */
export function publicationMediaReadiness(record: PublicationAssetsRecord | null | undefined, publicationRevision: number | null | undefined, recipeVersion: number = PUBLICATION_MEDIA_RECIPE_VERSION): PublicationReadiness {
  const status = record?.status;
  if (status === "preparing" || status === "failed") return { ready: false, reason: status };
  if (status !== "ready") return { ready: false, reason: "not-prepared" };
  if (typeof publicationRevision !== "number" || record?.preparedRevision !== publicationRevision) return { ready: false, reason: "stale-revision" };
  if (record?.recipeVersion !== recipeVersion) return { ready: false, reason: "stale-recipe" };
  const validation = validatePublicationMediaManifest(record?.manifest);
  if (!validation.ok || validation.manifest.recipeVersion !== recipeVersion) return { ready: false, reason: "invalid-manifest" };
  return { ready: true, manifest: validation.manifest };
}

/** The status a list or badge shows: stale generations read as not prepared, never as ready. */
export function effectivePublicationStatus(record: PublicationAssetsRecord | null | undefined, publicationRevision: number | null | undefined, recipeVersion: number = PUBLICATION_MEDIA_RECIPE_VERSION): PublicationAssetStatus {
  const readiness = publicationMediaReadiness(record, publicationRevision, recipeVersion);
  if (readiness.ready) return "ready";
  return readiness.reason === "preparing" || readiness.reason === "failed" ? readiness.reason : "not-prepared";
}

/* ------------------------------------------------- compatibility (Phase 7) */

/** The largest natural file: the public `source_url` of a compatibility snapshot. */
export function largestNaturalImage(manifest: PublicationImageManifest): PublicationImageFile {
  return manifest.natural[manifest.natural.length - 1];
}

/**
 * Prepared crop families in the legacy `bylineImage.artDirection.renditions`
 * shape (URLs are public paths), so a v1 snapshot needs no new renderer.
 * Social is always present, as WordPress always made one.
 */
export function legacyRenditionsFromManifest(manifest: PublicationImageManifest): Partial<Record<ImageCropShape, ImageRendition[]>> {
  const renditions: Partial<Record<ImageCropShape, ImageRendition[]>> = {};
  for (const shape of PUBLICATION_CROP_FAMILY_SHAPES) {
    const family = manifest.crops[shape];
    if (family) renditions[shape] = family.renditions.map((file) => ({ url: file.publicPath, width: file.width, height: file.height }));
  }
  renditions.social = [{ url: manifest.social.publicPath, width: manifest.social.width, height: manifest.social.height }];
  return renditions;
}
