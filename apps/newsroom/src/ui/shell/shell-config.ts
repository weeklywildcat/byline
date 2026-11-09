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
export const SIDEBAR_WIDTH = { default: 256, storyWorkspace: 350, calendarWorkspace: 350, mediaWorkspace: 320, storiesWorkspace: 300, collectionWorkspace: 340, icon: 48, mobile: 288 } as const;

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

/**
 * Media's own geometry (not the Story screen's 1300 or the Calendar's 1320).
 * The Media workspace sidebar is the icon rail plus the Media navigator,
 * 320px; the screen has 48px of side padding (lg:px-6). Its content is a
 * grid of thumbnails, each at least 168px (a 4:3 preview, a filename that
 * stays legible), 12px apart. The navigator earns its place only while at
 * least three comfortable thumbnails still fit beside it:
 * 320 + 48 + 3 x 168 + 2 x 12 = 896px, plus a scrollbar and a margin so the
 * third column never collapses during a sidebar transition. Measured in the
 * browser (docs/media-workspace.md): see MEDIA_WORKSPACE_MIN_WIDTH.
 * Below it the ordinary 256px sidebar stays and the navigator opens in a
 * sheet.
 */
export const MEDIA_GEOMETRY = { sidebar: 320, sidePadding: 48, tileMin: 168, gap: 12, inspectorMin: 340 } as const;
export const MEDIA_WORKSPACE_MIN_WIDTH = 1024;
export const MEDIA_WORKSPACE_QUERY = `(min-width: ${MEDIA_WORKSPACE_MIN_WIDTH}px)`;

/**
 * The persistent asset inspector (a resizable panel beside the grid) needs
 * its own, larger threshold: rail + navigator, the inspector at its 340px
 * minimum and still three comfortable thumbnails. That fits mathematically
 * around 1240px, but at 1366 the grid was down to three cramped columns and
 * every resize of the inspector reflowed it; from 1440 three columns stay
 * comfortable at the default width. Narrower screens open the same
 * inspector in a sheet.
 */
export const MEDIA_INSPECTOR_MIN_WIDTH = 1440;
export const MEDIA_INSPECTOR_QUERY = `(min-width: ${MEDIA_INSPECTOR_MIN_WIDTH}px)`;

/**
 * Stories' own geometry. The Stories workspace sidebar is the icon rail plus
 * the Stories pane (Views, Stages, Writers), 300px in all: a 48px rail and a
 * 252px pane. The screen has 48px of side padding (lg:px-6), so the board's
 * frame is viewport - 348 (measured in the browser: 932px at 1280).
 * The pane earns its place only while the board's Lanes layout fits without
 * sideways scrolling for the default workflow: two populated main stages and
 * one populated sidelined stage expanded at their 240px minimum (min-w-60),
 * the five empty stages as 40px rails, the 1px sidelined divider, and eight
 * 8px gaps between those nine items:
 * 3 x 240 + 5 x 40 + 1 + 8 x 8 = 985px, so 348 + 985 = 1333px. At 1280 the
 * board scrolled sideways (932 < 985), so the breakpoint is 1340 (a scrollbar's
 * margin above 1333). 1366 laptops get the pane; 1280 ones keep the ordinary
 * 256px sidebar and open the same pane in a Views sheet.
 */
export const STORIES_GEOMETRY = { sidebar: 300, sidePadding: 48, laneMin: 240, railWidth: 40, divider: 1, gap: 8, expandedLanes: 3, rails: 5 } as const;
export const STORIES_WORKSPACE_MIN_WIDTH = 1340;
export const STORIES_WORKSPACE_QUERY = `(min-width: ${STORIES_WORKSPACE_MIN_WIDTH}px)`;

/**
 * Collections' own geometry. The Collection workspace sidebar is the icon
 * rail plus the Collection switcher, 340px in all (a 292px pane: two-line
 * rows, a name of about 32 characters before it wraps). The screen has 48px
 * of side padding (lg:px-6), so the workspace's content is viewport - 388.
 * See COLLECTION_WORKSPACE_MIN_WIDTH for the measurement.
 */
export const COLLECTION_GEOMETRY = { sidebar: 340, sidePadding: 48, contentMin: 880, propertiesAt: 960 } as const;
export const COLLECTION_WORKSPACE_MIN_WIDTH = 1280;
export const COLLECTION_WORKSPACE_QUERY = `(min-width: ${COLLECTION_WORKSPACE_MIN_WIDTH}px)`;

/** The Collection switcher's remembered view (Payload Preferences, never a schema field). */
export const COLLECTION_SWITCHER_VIEW_PREFERENCE = "byline:collections:switcher-view:v1";
