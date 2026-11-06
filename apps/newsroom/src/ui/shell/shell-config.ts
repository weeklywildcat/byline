/** Remembers whether the desktop sidebar is expanded; read on the server so the first paint is right. */
export const SIDEBAR_COOKIE = "byline_sidebar";

/**
 * ⌘/Ctrl + \ toggles the sidebar. Not shadcn's ⌘B: that is Bold in the
 * article editor.
 */
export const SIDEBAR_SHORTCUT = "\\";

/**
 * The one sidebar's widths, in px (inline CSS variables escape the newsroom's
 * rem→px compile, and Payload's root font is not 16px). The icon width is the
 * collapsed sidebar and, in a workspace, the global rail.
 */
export const SIDEBAR_WIDTH = { default: 256, storyWorkspace: 350, calendarWorkspace: 350, icon: 48, mobile: 288 } as const;

/**
 * The narrowest viewport that gets the Story workspace sidebar (shadcn's
 * nested sidebar-09: the global icon rail plus the Story list, 350px in all).
 * Measured in the browser: beside it, Payload's Edit view gutters take 120px
 * and the Story screen's padding 64px, so the Write tab's 760px article
 * measure needs 350 + 120 + 64 + 760 = 1294px. At 1200 the article shrank to
 * 666px. This is not sidebar-09's `md`: narrower screens (1280 laptops
 * included) keep the ordinary sidebar and switch stories from a temporary
 * sheet. StoryHeader's `min-[1300px]:hidden` must match.
 */
export const STORY_WORKSPACE_MIN_WIDTH = 1300;
export const STORY_WORKSPACE_QUERY = `(min-width: ${STORY_WORKSPACE_MIN_WIDTH}px)`;

/** The Story switcher's remembered queue (Payload Preferences, never a schema field). */
export const STORY_SWITCHER_QUEUE_PREFERENCE = "byline:story-switcher:queue:v1";

/**
 * The narrowest viewport that gets the Calendar workspace sidebar (the icon
 * rail plus the Calendar's controls, 350px in all). PLACEHOLDER until measured.
 */
export const CALENDAR_WORKSPACE_MIN_WIDTH = 1440;
export const CALENDAR_WORKSPACE_QUERY = `(min-width: ${CALENDAR_WORKSPACE_MIN_WIDTH}px)`;
