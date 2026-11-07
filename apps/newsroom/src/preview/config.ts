import type { LivePreviewConfig } from "payload";

/**
 * Story Live Preview, configured once. Payload owns the pane, iframe,
 * toolbar, device sizes, zoom, pop-out, transport and the saved open/closed
 * preference; Byline owns the page at `STORY_PREVIEW_PATH`.
 */

/**
 * The static, same-origin preview page. Deliberately not a function: Payload
 * 3.92.1 recomputes function URLs during form-state requests, and with
 * Byline's frequent autosave an overlapping request can drop the URL and close
 * Live Preview. The page learns which Story it shows from Payload's own
 * form-state messages (see `population.ts`).
 */
export const STORY_PREVIEW_PATH = "/preview/story";

/**
 * How deep Payload populates each unsaved state. 2 reaches every relationship
 * the article renders: the lead image and the body's Photo, Gallery and
 * Document Media (story → media), section and topics (story → term) and each
 * contributor's portrait (story → person → media).
 */
export const STORY_LIVE_PREVIEW_DEPTH = 2;

export const STORY_PREVIEW_BREAKPOINTS: NonNullable<LivePreviewConfig["breakpoints"]> = [
  { name: "phone", label: "Phone", width: 390, height: 844 },
  { name: "tablet", label: "Tablet", width: 820, height: 1180 },
  { name: "desktop", label: "Desktop", width: 1440, height: 900 }
];

export const storyLivePreview: LivePreviewConfig = {
  url: STORY_PREVIEW_PATH,
  breakpoints: STORY_PREVIEW_BREAKPOINTS,
  // Closed until someone opens it; after that Payload's stored preference decides.
  openByDefault: false
};
