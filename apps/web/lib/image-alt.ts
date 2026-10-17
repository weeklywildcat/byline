import { stripHtml } from "@/lib/format";

const IMAGE_EXTENSION = /\.(?:jpe?g|png|gif|webp|avif|heic|heif|tiff?|bmp|svg)\b/i;
// Camera, phone and export names: IMG_0042, DSC01234, PXL_20260101, Screenshot 2026-01-01...
const GENERATED_NAME = /^(?:img|dsc[nf]?|pxl|mvimg|image|photo|picture|pic|screenshot|screen[\s_-]?shot|scan|untitled|unnamed|download|file|copy)(?:[\s_-]*(?:of|copy|\(?\d))?/i;
const GENERIC_WORDS = new Set(["image", "images", "photo", "photos", "picture", "pictures", "pic", "img", "untitled", "screenshot", "copy", "scaled", "edited", "final", "hero", "banner", "featured"]);

type AltSource = {
  alt_text?: string;
  title?: { rendered?: string };
};

/**
 * WordPress names an upload after its file, so an attachment's title is often
 * `CTeam-Pelion_20261015_15` or `IMG_0042`. Those read like text but describe
 * nothing, and screen readers and crawlers would treat them as a description.
 */
export function looksLikeFilename(text: string) {
  const value = text.trim();
  if (!value) return true;
  if (IMAGE_EXTENSION.test(value)) return true;
  if (/[_]/.test(value)) return true;
  if (!/\s/.test(value)) return true;
  if (GENERATED_NAME.test(value) && /\d/.test(value)) return true;
  if (/\d{6,}/.test(value.replace(/[\s-]/g, ""))) return true;

  const words = value.toLowerCase().split(/[\s-]+/).filter(Boolean);
  const letters = value.replace(/[^a-z]/gi, "").length;
  return letters < 4 || words.every((word) => GENERIC_WORDS.has(word) || /^\d+$/.test(word));
}

/**
 * The text to use as an image's alt: the editor's alt text when there is some,
 * otherwise the attachment title only if it reads as a human description.
 * Returns "" (a decorative image) rather than inventing a description.
 */
export function getMeaningfulImageAlt(image: AltSource | null | undefined) {
  if (!image) return "";

  const altText = image.alt_text?.trim();
  if (altText) return altText;

  const title = stripHtml(image.title?.rendered ?? "");
  return title && !looksLikeFilename(title) ? title : "";
}
