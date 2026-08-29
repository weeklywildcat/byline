import { __ } from "@wordpress/i18n";

export const MEDIA_FEATURED_IN_USE_CODE = "byline_editorial_media_featured_in_use";

const MEDIA_FEATURED_IN_USE_MESSAGE = "This image is the story's featured image. Choose another featured image or remove it as featured before unlinking it from the story.";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function describeMediaDeskError(error: unknown, fallback = __("Media request could not be updated.", "weekly-wildcat-headless")): string {
  if (isRecord(error) && error.code === MEDIA_FEATURED_IN_USE_CODE) {
    return __(MEDIA_FEATURED_IN_USE_MESSAGE, "weekly-wildcat-headless");
  }
  if (typeof error === "string" && error.trim()) return error.trim();
  if (isRecord(error) && typeof error.message === "string" && error.message.trim()) {
    return error.message.trim();
  }
  return fallback;
}
