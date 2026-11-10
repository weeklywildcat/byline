/**
 * The photograph formats the newsroom accepts, in one place so Media, Reporting
 * and Field Mode cannot disagree. iPhone and iPad cameras write HEIC/HEIF by
 * default; the server decodes it at the ingest boundary
 * (apps/newsroom/src/media/heic.ts), so nobody has to switch the camera to
 * "Most Compatible". Apple ProRAW (DNG) is a separate raw workflow and is
 * refused with a specific message rather than a generic type error.
 */
export const HEIF_MIME_TYPES = ["image/heic", "image/heif"] as const;
export const HEIF_EXTENSIONS = [".heic", ".heif"] as const;
export const RAW_PHOTO_EXTENSIONS = [".dng"] as const;
export const RAW_PHOTO_MIME_TYPES = ["image/dng", "image/x-adobe-dng", "image/x-dng"] as const;

/** Raster photographs a person may choose. Never `image/*`: that would also match raw formats the newsroom cannot ingest. */
export const PHOTO_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif", "image/gif", ...HEIF_MIME_TYPES] as const;
/** The `accept` value for a photograph file input: MIME types, plus extensions for pickers that report no type for HEIC. */
export const PHOTO_FILE_ACCEPT = [...PHOTO_MIME_TYPES, ...HEIF_EXTENSIONS].join(",");

export const PRORAW_UNSUPPORTED_MESSAGE = "Apple ProRAW/DNG isn't supported yet. Export or share the photo as HEIC or JPEG.";

type Named = { name?: string | null; type?: string | null };
const extensionOf = (name: string | null | undefined) => {
  const dot = (name ?? "").lastIndexOf(".");
  return dot < 0 ? "" : (name as string).slice(dot).toLowerCase();
};

export function isHeifFile(file: Named): boolean {
  const type = (file.type ?? "").toLowerCase();
  return (HEIF_MIME_TYPES as readonly string[]).includes(type) || type === "image/heic-sequence" || type === "image/heif-sequence" || (HEIF_EXTENSIONS as readonly string[]).includes(extensionOf(file.name));
}

export function isRawPhotoFile(file: Named): boolean {
  return (RAW_PHOTO_MIME_TYPES as readonly string[]).includes((file.type ?? "").toLowerCase()) || (RAW_PHOTO_EXTENSIONS as readonly string[]).includes(extensionOf(file.name));
}
