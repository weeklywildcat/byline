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
 * Beside the Calendar workspace's 350px sidebar, the Calendar needs room for
 * Schedule-X's grids, which have their own geometry (not the Story screen's
 * 1300). Measured in the browser (1180-1440px, Month and Week): the
 * Calendar frame is the viewport minus the 350px sidebar minus the screen's
 * 48px of side padding (lg:px-6), so frame = viewport - 398. Schedule-X's
 * week grid takes 82px for its time axis and gives each of its 7 columns
 * (frame - 82) / 7; the month grid gives each of 7 cells frame / 7.
 * A timed event chip (icon, time, a title) and an all-day chip need about
 * 120px in the week grid and 130px in a month cell before titles stop being
 * recognisable: at 1180px (week column 100px, month cell 111px) a title read
 * "Robotics t…", at 1300px 117px / 128px was borderline, and from 1366px
 * (126px / 138px) it was comfortable. The stricter limit is the week grid:
 * 398 + 82 + 7 x 120 = 1320px. Below it the screen keeps the ordinary 256px
 * sidebar, gives Schedule-X the full width, and offers the same controls in
 * a sheet; the Calendar is never squeezed to keep the pane.
 */
export const CALENDAR_WORKSPACE_MIN_WIDTH = 1320;
export const CALENDAR_WORKSPACE_QUERY = `(min-width: ${CALENDAR_WORKSPACE_MIN_WIDTH}px)`;

/** The measured geometry the breakpoint derives from (tests pin the arithmetic). */
export const CALENDAR_GEOMETRY = { sidebar: 350, sidePadding: 48, weekAxis: 82, weekColumnMin: 120, monthCellMin: 130 } as const;
