/**
 * The one source of truth for Google Analytics names and for what Byline means by them
 * (docs/google-analytics.md). Dimension and metric API names are checked against the
 * Data API v1beta Core and Realtime schemas; no component spells one.
 *
 * This file is type- and constant-only so the browser can import it.
 */

export const analyticsMetrics = {
  views: "screenPageViews",
  activeUsers: "activeUsers",
  users: "totalUsers",
  newUsers: "newUsers",
  sessions: "sessions",
  engagedSessions: "engagedSessions",
  engagementRate: "engagementRate",
  engagementDuration: "userEngagementDuration",
  events: "eventCount",
  keyEvents: "keyEvents",
  scrolledUsers: "scrolledUsers"
} as const;

/** Core (processed) report dimensions. `contentId`, `contentType` and `contentGroup` are GA's built-in content dimensions. */
export const analyticsDimensions = {
  date: "date",
  contentId: "contentId",
  contentType: "contentType",
  contentGroup: "contentGroup",
  pagePath: "pagePath",
  pageTitle: "pageTitle",
  pageReferrer: "pageReferrer",
  channel: "sessionDefaultChannelGroup",
  sourceMedium: "sessionSourceMedium",
  landingPage: "landingPage",
  deviceCategory: "deviceCategory",
  browser: "browser",
  operatingSystem: "operatingSystem",
  country: "country",
  region: "region",
  eventName: "eventName",
  newVsReturning: "newVsReturning"
} as const;

/** Realtime has its own, much smaller vocabulary: no path, no source, no landing page. */
export const realtimeDimensions = {
  minutesAgo: "minutesAgo",
  pageTitle: "unifiedScreenName",
  country: "country",
  deviceCategory: "deviceCategory",
  eventName: "eventName"
} as const;
export const realtimeMetrics = { activeUsers: "activeUsers", events: "eventCount" } as const;

/** Story identity sent by Byline-managed pageviews. */
export const STORY_CONTENT_TYPE = "story";
export const storyContentId = (id: number | string) => `story:${id}`;
export function storyIdFromContentId(value: string): number | null {
  const match = /^story:(\d{1,12})$/.exec(value);
  return match ? Number(match[1]) : null;
}

/** Byline's reading-progress events (docs/google-analytics.md#reader-events). */
export const READ_EVENTS = { 25: "byline_read_25", 50: "byline_read_50", 75: "byline_read_75", 100: "byline_read_100" } as const;

export const EVENT_LABELS: Record<string, string> = {
  page_view: "Page views",
  scroll: "Reached 90%",
  share: "Shares",
  search: "Searches",
  view_search_results: "Search results viewed",
  sign_up: "Sign-ups",
  first_visit: "First visits",
  session_start: "Sessions started",
  user_engagement: "Engaged time",
  click: "Outbound clicks",
  file_download: "File downloads",
  video_start: "Videos started",
  video_progress: "Video progress",
  video_complete: "Videos finished",
  [READ_EVENTS[25]]: "Read 25%",
  [READ_EVENTS[50]]: "Read 50%",
  [READ_EVENTS[75]]: "Read 75%",
  [READ_EVENTS[100]]: "Read to the end"
};

export const CHANNEL_LABELS: Record<string, string> = {
  "Organic Search": "Search", "Organic Social": "Social", "Direct": "Direct", "Referral": "Other sites",
  "Email": "Email", "Paid Search": "Paid search", "Paid Social": "Paid social", "Unassigned": "Unknown", "Organic Video": "Video"
};

/* ----------------------------------------------------------------- ranges */

export const RANGE_PRESETS = ["today", "7d", "28d", "90d", "custom"] as const;
export type RangePreset = (typeof RANGE_PRESETS)[number];

/** Inclusive dates in the Analytics property's timezone. */
export type ResolvedRange = {
  preset: RangePreset;
  start: string;
  end: string;
  previousStart: string;
  previousEnd: string;
  days: number;
  includesToday: boolean;
  timeZone: string;
};

/* ------------------------------------------------------------------ errors */

export type AnalyticsErrorCode =
  | "not-configured" | "not-connected" | "needs-reconnect" | "property-unavailable" | "api-disabled"
  | "quota" | "unavailable" | "bad-request" | "forbidden";

/** What a person sees: never a provider payload. */
export type AnalyticsProblem = { code: AnalyticsErrorCode; title: string; detail: string; retryable: boolean };

export type Section<T> = { ok: true; data: T } | { ok: false; problem: AnalyticsProblem };

export type Change = {
  current: number | null;
  previous: number | null;
  /** (current - previous) / previous, or null when there is nothing honest to compare. */
  ratio: number | null;
};

/* --------------------------------------------------------------- DTO shapes */

export type SeriesPoint = { date: string; views: number; activeUsers: number };

export type StoryRef = {
  id: number;
  title: string;
  href: string;
  section: { name: string; slug: string } | null;
  publishedAt: string | null;
};

export type StoryRow = {
  story: StoryRef;
  views: number;
  activeUsers: number;
  engagement: number | null;
  scrolled: number | null;
  viewsChange: Change;
};

export type OtherPageRow = { path: string; title: string; views: number; activeUsers: number };

export type Meta = { fetchedAt: string; cached: boolean; range: ResolvedRange | null };

export type Totals = { views: Change; activeUsers: Change; sessions: Change; engagement: Change };
export type ChannelRow = { channel: string; label: string; sessions: number; activeUsers: number; engagedSessions: number; engagementRate: number | null };
export type NamedCount = { name: string; value: number; share: number };

export type OverviewDto = {
  meta: Meta;
  totals: Section<Totals>;
  series: Section<SeriesPoint[]>;
  topStories: Section<StoryRow[]>;
  channels: Section<ChannelRow[]>;
  devices: Section<NamedCount[]>;
};

export type RealtimeDto = {
  meta: Meta;
  activeUsers: number;
  windowMinutes: number;
  activity: Array<{ minutesAgo: number; activeUsers: number }>;
  pages: Array<{ title: string; activeUsers: number; story: StoryRef | null }>;
  countries: NamedCount[];
  devices: NamedCount[];
  events: Array<{ name: string; label: string; count: number }>;
};

export type ContentFilters = { section?: string; author?: number; topic?: number; story?: number; q?: string };

export type ContentDto = {
  meta: Meta;
  stories: Section<StoryRow[]>;
  otherPages: Section<OtherPageRow[]>;
  /** Facets for the filters, from Byline's own metadata (never sent to Google). */
  facets: { sections: Array<{ slug: string; name: string }>; authors: Array<{ id: number; name: string }>; topics: Array<{ id: number; name: string }> };
  filteredBy: ContentFilters;
  unmatchedViews: number;
};

export type SourceRow = { source: string; sessions: number; activeUsers: number; engagementRate: number | null };
export type LandingRow = { story: StoryRef | null; path: string; title: string; source: string; sessions: number; engagementRate: number | null };
export type AcquisitionDto = { meta: Meta; channels: Section<ChannelRow[]>; sources: Section<SourceRow[]>; landing: Section<LandingRow[]> };

export type AudienceDto = {
  meta: Meta;
  readers: Section<{ activeUsers: number; newUsers: number; returningUsers: number | null }>;
  devices: Section<NamedCount[]>;
  browsers: Section<NamedCount[]>;
  systems: Section<NamedCount[]>;
  countries: Section<NamedCount[]>;
  regions: Section<NamedCount[]>;
};

export type EventRow = { name: string; label: string; count: number; users: number; keyEvents: number };
export type EventsDto = { meta: Meta; events: Section<EventRow[]> };

export type StoryPerformanceDto = {
  meta: Meta;
  story: StoryRef & { published: boolean };
  /** True when Google has reported nothing for this Story in the range. */
  empty: boolean;
  totals: Section<{ views: number; activeUsers: number; engagement: number | null; scrolled: number | null }>;
  readingNow: Section<{ readers: number }>;
  series: Section<SeriesPoint[]>;
  channels: Section<NamedCount[]>;
  referrers: Section<Array<{ referrer: string; views: number }>>;
  devices: Section<NamedCount[]>;
  reading: Section<Array<{ percent: 25 | 50 | 75 | 100; users: number }> | null>;
};

export type HomeAudienceDto = { activeUsers: number; windowMinutes: number; top: { title: string; story: StoryRef | null; activeUsers: number } | null };
