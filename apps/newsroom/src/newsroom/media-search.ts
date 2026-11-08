import { MEDIA_METADATA_FIELDS } from "@byline/newsroom-screens/media/media-library-model";
import type { Where } from "payload";

/** The command palette and Library search the same Media metadata. */
export function mediaSearchWhere(search: string): Where {
  return { or: [...(["filename", ...MEDIA_METADATA_FIELDS] as const).map((field) => ({ [field]: { like: search } })), { tags: { like: search } }] };
}
