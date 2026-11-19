import { batchRunReports, MAX_BATCH_REPORTS, runReport, type DateRangeSpec, type ReportRow, type ReportSpec, type ReportTable } from "./data-client";
import { averageEngagementSeconds, change, eachDay, gaDate, rangeSince, resolveRange } from "./dates";
import { AnalyticsError, toProblem } from "./errors";
import { analyticsDimensions as dim, analyticsMetrics as met, CHANNEL_LABELS, EVENT_LABELS, READ_EVENTS, storyContentId, type AcquisitionDto, type AudienceDto, type ChannelRow, type ContentDto, type ContentFilters, type EventsDto, type Meta, type NamedCount, type OverviewDto, type ResolvedRange, type Section, type SeriesPoint, type StoryPerformanceDto, type StoryRef, type StoryRow } from "./model";
import { cached, ttlFor } from "./cache";
import { hostnameOf } from "./admin-client";
import { mapRow, matchesFilters, pathsFor, type Catalog, type CatalogStory } from "./content-map";

/** Everything a report needs, resolved once per request. */
export type ReportContext = { token: string; property: string; timeZone: string; catalog: Catalog; now?: Date; refresh?: boolean };

export const toStoryRef = (story: CatalogStory): StoryRef => ({ id: story.id, title: story.title, href: story.path, section: story.section, publishedAt: story.publishedAt });

const CURRENT = "current";
const PREVIOUS = "previous";
const ranges = (range: ResolvedRange, comparison = true): DateRangeSpec[] => [
  { startDate: range.start, endDate: range.end, name: CURRENT },
  ...(comparison ? [{ startDate: range.previousStart, endDate: range.previousEnd, name: PREVIOUS }] : [])
];
const only = (rows: ReportRow[], name: string) => rows.filter((row) => (row.dims.dateRange ?? CURRENT) === name);
const sum = (rows: ReportRow[], metric: string) => rows.reduce((total, row) => total + (row.metrics[metric] ?? 0), 0);

/* --------------------------------------------------------------- definitions */

export const reportSpecs = {
  totals: (range: ResolvedRange): ReportSpec => ({ dimensions: [], metrics: [met.views, met.activeUsers, met.sessions, met.engagementDuration], dateRanges: ranges(range) }),
  series: (range: ResolvedRange): ReportSpec => ({ dimensions: [dim.date], metrics: [met.views, met.activeUsers], dateRanges: ranges(range, false), orderBys: [{ dimension: { dimensionName: dim.date } }], limit: 400 }),
  content: (range: ResolvedRange): ReportSpec => ({
    dimensions: [dim.contentId, dim.pagePath, dim.pageTitle], metrics: [met.views, met.activeUsers, met.engagementDuration, met.scrolledUsers],
    dateRanges: ranges(range), orderBys: [{ metric: { metricName: met.views }, desc: true }], limit: 5000
  }),
  channels: (range: ResolvedRange): ReportSpec => ({ dimensions: [dim.channel], metrics: [met.sessions, met.activeUsers, met.engagedSessions, met.engagementRate], dateRanges: ranges(range, false), orderBys: [{ metric: { metricName: met.sessions }, desc: true }], limit: 25 }),
  sources: (range: ResolvedRange): ReportSpec => ({ dimensions: [dim.sourceMedium], metrics: [met.sessions, met.activeUsers, met.engagementRate], dateRanges: ranges(range, false), orderBys: [{ metric: { metricName: met.sessions }, desc: true }], limit: 50 }),
  landing: (range: ResolvedRange): ReportSpec => ({ dimensions: [dim.landingPage, dim.sourceMedium], metrics: [met.sessions, met.engagementRate], dateRanges: ranges(range, false), orderBys: [{ metric: { metricName: met.sessions }, desc: true }], limit: 500 }),
  devices: (range: ResolvedRange): ReportSpec => breakdown(range, dim.deviceCategory),
  browsers: (range: ResolvedRange): ReportSpec => breakdown(range, dim.browser),
  systems: (range: ResolvedRange): ReportSpec => breakdown(range, dim.operatingSystem),
  countries: (range: ResolvedRange): ReportSpec => breakdown(range, dim.country),
  regions: (range: ResolvedRange): ReportSpec => breakdown(range, dim.region),
  readers: (range: ResolvedRange): ReportSpec => breakdown(range, dim.newVsReturning, [met.activeUsers, met.newUsers]),
  events: (range: ResolvedRange): ReportSpec => ({ dimensions: [dim.eventName], metrics: [met.events, met.activeUsers, met.keyEvents], dateRanges: ranges(range, false), orderBys: [{ metric: { metricName: met.events }, desc: true }], limit: 100 })
};

function breakdown(range: ResolvedRange, dimension: string, metrics: readonly string[] = [met.activeUsers]): ReportSpec {
  return { dimensions: [dimension], metrics, dateRanges: ranges(range, false), orderBys: [{ metric: { metricName: metrics[0]! }, desc: true }], limit: 25 };
}

/** The rows of one Story: its Byline content ID, or any path it has answered at (canonical or a redirect). */
export function storyFilter(storyId: number, catalog: Catalog) {
  const paths = pathsFor(storyId, catalog).flatMap((path) => [path, path.replace(/\/$/, "")]);
  return { orGroup: { expressions: [
    { filter: { fieldName: dim.contentId, stringFilter: { matchType: "EXACT", value: storyContentId(storyId) } } },
    ...(paths.length ? [{ filter: { fieldName: dim.pagePath, inListFilter: { values: paths, caseSensitive: true } } }] : [])
  ] } };
}

/* ------------------------------------------------------------------ running */

async function section<T>(work: () => Promise<T>): Promise<Section<T>> {
  try { return { ok: true, data: await work() }; } catch (error) { return { ok: false, problem: toProblem(error) }; }
}

/** Reports a failure that applies to the whole desk (reconnect, wrong property) instead of one card. */
const FATAL = new Set(["needs-reconnect", "not-connected", "not-configured", "api-disabled"]);

/** Runs reports together (at most five per batch). A failed batch is retried one by one so one bad report doesn't blank the rest. */
async function runAll(context: ReportContext, specs: ReportSpec[]): Promise<Array<Section<ReportTable>>> {
  const results: Array<Section<ReportTable>> = [];
  for (let start = 0; start < specs.length; start += MAX_BATCH_REPORTS) {
    const chunk = specs.slice(start, start + MAX_BATCH_REPORTS);
    try {
      const tables = chunk.length === 1 ? [await runReport(context.token, context.property, chunk[0]!)] : await batchRunReports(context.token, context.property, chunk);
      results.push(...tables.map((data): Section<ReportTable> => ({ ok: true, data })));
    } catch (error) {
      if (error instanceof AnalyticsError && FATAL.has(error.code)) throw error;
      results.push(...await Promise.all(chunk.map((spec) => section(() => runReport(context.token, context.property, spec)))));
    }
  }
  return results;
}

const meta = (range: ResolvedRange | null, fetchedAt: string, cachedHit: boolean): Meta => ({ fetchedAt, cached: cachedHit, range });
const map = <T, U>(value: Section<T>, convert: (data: T) => U): Section<U> => value.ok ? { ok: true, data: convert(value.data) } : value;
const key = (context: ReportContext, name: string, range: ResolvedRange, extra = "") => `${context.property}|${name}|${range.start}|${range.end}|${extra}`;

function counts(rows: ReportRow[], dimension: string, metric: string, options: { top?: number; label?: (value: string) => string } = {}): NamedCount[] {
  const merged = new Map<string, number>();
  for (const row of rows) {
    const raw = row.dims[dimension] ?? "";
    const name = options.label?.(raw) ?? (raw && raw !== "(not set)" ? raw : "Unknown");
    merged.set(name, (merged.get(name) ?? 0) + (row.metrics[metric] ?? 0));
  }
  const total = [...merged.values()].reduce((a, b) => a + b, 0);
  return [...merged].map(([name, value]) => ({ name, value, share: total > 0 ? value / total : 0 })).filter((item) => item.value > 0).sort((a, b) => b.value - a.value).slice(0, options.top ?? 12);
}

const channelLabel = (value: string) => CHANNEL_LABELS[value] ?? (value && value !== "(not set)" ? value : "Unknown");

function channelRows(table: ReportTable): ChannelRow[] {
  return table.rows.map((row) => ({
    channel: row.dims[dim.channel] ?? "", label: channelLabel(row.dims[dim.channel] ?? ""), sessions: row.metrics[met.sessions] ?? 0,
    activeUsers: row.metrics[met.activeUsers] ?? 0, engagedSessions: row.metrics[met.engagedSessions] ?? 0, engagementRate: row.metrics[met.engagementRate] ?? null
  }));
}

const seriesFor = (rows: ReportRow[], range: ResolvedRange): SeriesPoint[] => {
  const byDate = new Map(rows.map((row) => [gaDate(row.dims[dim.date] ?? ""), row]));
  return eachDay(range.start, range.end).map((date) => ({ date, views: byDate.get(date)?.metrics[met.views] ?? 0, activeUsers: byDate.get(date)?.metrics[met.activeUsers] ?? 0 }));
};

/* --------------------------------------------------------- Story aggregation */

type Tally = { views: number; activeUsers: number; duration: number; scrolled: number; viewsBefore: number };

/**
 * Maps every row of one content report to exactly one Story (or a non-Story page) and sums it.
 * Active users are summed per Byline record, which can slightly over-count a reader who saw one
 * Story at two addresses; views are exact.
 */
export function tallyContent(rows: ReportRow[], catalog: Catalog) {
  const stories = new Map<number, Tally>();
  const pages = new Map<string, { title: string; views: number; activeUsers: number }>();
  let unmatchedViews = 0;
  for (const row of rows) {
    const previous = (row.dims.dateRange ?? CURRENT) === PREVIOUS;
    const mapped = mapRow({ contentId: row.dims[dim.contentId], pagePath: row.dims[dim.pagePath] }, catalog);
    const views = row.metrics[met.views] ?? 0;
    if (mapped.kind === "story") {
      const tally = stories.get(mapped.story.id) ?? { views: 0, activeUsers: 0, duration: 0, scrolled: 0, viewsBefore: 0 };
      if (previous) tally.viewsBefore += views;
      else {
        tally.views += views; tally.activeUsers += row.metrics[met.activeUsers] ?? 0;
        tally.duration += row.metrics[met.engagementDuration] ?? 0; tally.scrolled += row.metrics[met.scrolledUsers] ?? 0;
      }
      stories.set(mapped.story.id, tally);
    } else if (!previous) {
      const page = pages.get(mapped.path) ?? { title: row.dims[dim.pageTitle] ?? "", views: 0, activeUsers: 0 };
      page.views += views; page.activeUsers += row.metrics[met.activeUsers] ?? 0;
      pages.set(mapped.path, page);
      unmatchedViews += views;
    }
  }
  return { stories, pages, unmatchedViews };
}

function storyRows(tally: ReturnType<typeof tallyContent>, catalog: Catalog, filters: ContentFilters = {}): StoryRow[] {
  return [...tally.stories].flatMap(([id, value]) => {
    const story = catalog.stories.get(id);
    if (!story || !matchesFilters(story, filters)) return [];
    if (filters.q && !story.title.toLowerCase().includes(filters.q.toLowerCase())) return [];
    return [{
      story: toStoryRef(story), views: value.views, activeUsers: value.activeUsers,
      engagement: averageEngagementSeconds(value.duration, value.activeUsers),
      scrolled: value.scrolled > 0 ? value.scrolled : null, viewsChange: change(value.views, value.viewsBefore)
    }];
  }).filter((row) => row.views > 0 || row.viewsChange.previous).sort((a, b) => b.views - a.views);
}

/* ------------------------------------------------------------------ Overview */

export async function overview(context: ReportContext, input: { preset?: unknown; start?: unknown; end?: unknown }): Promise<OverviewDto> {
  const range = resolveRange(input, context.timeZone, context.now);
  const { value, cached: hit, fetchedAt } = await cached(key(context, "overview", range), ttlFor(range), async () => {
    const [totals, series, content, channels, devices] = await runAll(context, [reportSpecs.totals(range), reportSpecs.series(range), reportSpecs.content(range), reportSpecs.channels(range), reportSpecs.devices(range)]);
    return {
      totals: map(totals!, (table) => {
        const now = only(table.rows, CURRENT), before = only(table.rows, PREVIOUS);
        const duration = (rows: ReportRow[]) => averageEngagementSeconds(sum(rows, met.engagementDuration), sum(rows, met.activeUsers));
        return {
          views: change(sum(now, met.views), before.length ? sum(before, met.views) : null), activeUsers: change(sum(now, met.activeUsers), before.length ? sum(before, met.activeUsers) : null),
          sessions: change(sum(now, met.sessions), before.length ? sum(before, met.sessions) : null), engagement: change(duration(now), before.length ? duration(before) : null)
        };
      }),
      series: map(series!, (table) => seriesFor(table.rows, range)),
      topStories: map(content!, (table) => storyRows(tallyContent(table.rows, context.catalog), context.catalog).slice(0, 10)),
      channels: map(channels!, channelRows),
      devices: map(devices!, (table) => counts(table.rows, dim.deviceCategory, met.activeUsers, { top: 4 }))
    };
  }, { refresh: context.refresh });
  return { meta: meta(range, fetchedAt, hit), ...value };
}

/* ------------------------------------------------------------------- Content */

export async function content(context: ReportContext, input: { preset?: unknown; start?: unknown; end?: unknown }, filters: ContentFilters): Promise<ContentDto> {
  const range = resolveRange(input, context.timeZone, context.now);
  const { value, cached: hit, fetchedAt } = await cached(key(context, "content", range), ttlFor(range), async () => {
    const [table] = await runAll(context, [reportSpecs.content(range)]);
    return map(table!, (data) => tallyContent(data.rows, context.catalog));
  }, { refresh: context.refresh });
  const facets = { sections: context.catalog.sections, authors: context.catalog.authors, topics: context.catalog.topics };
  if (!value.ok) return { meta: meta(range, fetchedAt, hit), stories: value, otherPages: value, facets, filteredBy: filters, unmatchedViews: 0 };
  const tally = value.data;
  return {
    meta: meta(range, fetchedAt, hit),
    stories: { ok: true, data: storyRows(tally, context.catalog, filters) },
    otherPages: { ok: true, data: [...tally.pages].map(([path, page]) => ({ path, title: page.title, views: page.views, activeUsers: page.activeUsers })).sort((a, b) => b.views - a.views).slice(0, 25) },
    facets, filteredBy: filters, unmatchedViews: tally.unmatchedViews
  };
}

/* --------------------------------------------------------------- Acquisition */

export async function acquisition(context: ReportContext, input: { preset?: unknown; start?: unknown; end?: unknown }): Promise<AcquisitionDto> {
  const range = resolveRange(input, context.timeZone, context.now);
  const { value, cached: hit, fetchedAt } = await cached(key(context, "acquisition", range), ttlFor(range), async () => {
    const [channels, sources, landing] = await runAll(context, [reportSpecs.channels(range), reportSpecs.sources(range), reportSpecs.landing(range)]);
    return {
      channels: map(channels!, channelRows),
      sources: map(sources!, (table) => table.rows.map((row) => ({ source: row.dims[dim.sourceMedium] ?? "", sessions: row.metrics[met.sessions] ?? 0, activeUsers: row.metrics[met.activeUsers] ?? 0, engagementRate: row.metrics[met.engagementRate] ?? null })).map((row) => ({ ...row, source: row.source === "(not set)" ? "Unknown" : row.source.replace(" / (none)", "") }))),
      landing: map(landing!, (table) => {
        const merged = new Map<string, { story: StoryRef | null; path: string; title: string; source: string; sessions: number; rate: number }>();
        for (const row of table.rows) {
          const mapped = mapRow({ pagePath: row.dims[dim.landingPage] }, context.catalog);
          const path = mapped.kind === "story" ? mapped.story.path : mapped.path;
          const source = row.dims[dim.sourceMedium] ?? "";
          const keyed = `${path}|${source}`;
          const entry = merged.get(keyed) ?? { story: mapped.kind === "story" ? toStoryRef(mapped.story) : null, path, title: mapped.kind === "story" ? mapped.story.title : path, source, sessions: 0, rate: 0 };
          const sessions = row.metrics[met.sessions] ?? 0;
          entry.rate += (row.metrics[met.engagementRate] ?? 0) * sessions;
          entry.sessions += sessions;
          merged.set(keyed, entry);
        }
        return [...merged.values()].sort((a, b) => b.sessions - a.sessions).slice(0, 30).map((entry) => ({ story: entry.story, path: entry.path, title: entry.title, source: entry.source === "(not set)" ? "Unknown" : entry.source, sessions: entry.sessions, engagementRate: entry.sessions > 0 ? entry.rate / entry.sessions : null }));
      })
    };
  }, { refresh: context.refresh });
  return { meta: meta(range, fetchedAt, hit), ...value };
}

/* ------------------------------------------------------------------ Audience */

export async function audience(context: ReportContext, input: { preset?: unknown; start?: unknown; end?: unknown }): Promise<AudienceDto> {
  const range = resolveRange(input, context.timeZone, context.now);
  const { value, cached: hit, fetchedAt } = await cached(key(context, "audience", range), ttlFor(range), async () => {
    const [readers, devices, browsers, systems, countries, regions] = await runAll(context, [reportSpecs.readers(range), reportSpecs.devices(range), reportSpecs.browsers(range), reportSpecs.systems(range), reportSpecs.countries(range), reportSpecs.regions(range)]);
    const named = (table: Section<ReportTable>, dimension: string, top = 8) => map(table, (data) => counts(data.rows, dimension, met.activeUsers, { top }));
    return {
      readers: map(readers!, (table) => {
        const returning = table.rows.find((row) => row.dims[dim.newVsReturning] === "returning");
        const fresh = table.rows.find((row) => row.dims[dim.newVsReturning] === "new");
        return { activeUsers: sum(table.rows, met.activeUsers), newUsers: sum(table.rows, met.newUsers), returningUsers: returning || fresh ? (returning?.metrics[met.activeUsers] ?? 0) : null };
      }),
      devices: named(devices!, dim.deviceCategory, 4), browsers: named(browsers!, dim.browser), systems: named(systems!, dim.operatingSystem), countries: named(countries!, dim.country, 10), regions: named(regions!, dim.region, 10)
    };
  }, { refresh: context.refresh });
  return { meta: meta(range, fetchedAt, hit), ...value };
}

/* -------------------------------------------------------------------- Events */

export async function events(context: ReportContext, input: { preset?: unknown; start?: unknown; end?: unknown }): Promise<EventsDto> {
  const range = resolveRange(input, context.timeZone, context.now);
  const { value, cached: hit, fetchedAt } = await cached(key(context, "events", range), ttlFor(range), async () => {
    const [table] = await runAll(context, [reportSpecs.events(range)]);
    return map(table!, (data) => data.rows.map((row) => {
      const name = row.dims[dim.eventName] ?? "";
      return { name, label: EVENT_LABELS[name] ?? name.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()), count: row.metrics[met.events] ?? 0, users: row.metrics[met.activeUsers] ?? 0, keyEvents: row.metrics[met.keyEvents] ?? 0 };
    }));
  }, { refresh: context.refresh });
  return { meta: meta(range, fetchedAt, hit), events: value };
}

/* --------------------------------------------------------- Story Performance */

export async function storyPerformance(context: ReportContext, story: CatalogStory, input: { preset?: unknown; start?: unknown; end?: unknown }): Promise<Omit<StoryPerformanceDto, "readingNow" | "story">> {
  const since = !input.preset || input.preset === "since";
  const range = since && story.publishedAt ? rangeSince(story.publishedAt, context.timeZone, context.now) : resolveRange(input, context.timeZone, context.now);
  const filter = storyFilter(story.id, context.catalog);
  const readEvents = Object.values(READ_EVENTS);
  const specs: ReportSpec[] = [
    // Totals have no date dimension, so a reader active on two days is one active user.
    { dimensions: [dim.contentId, dim.pagePath], metrics: [met.views, met.activeUsers, met.engagementDuration, met.scrolledUsers], dateRanges: ranges(range, false), dimensionFilter: filter, limit: 1000 },
    { dimensions: [dim.date, dim.contentId, dim.pagePath], metrics: [met.views, met.activeUsers], dateRanges: ranges(range, false), dimensionFilter: filter, limit: 5000 },
    { dimensions: [dim.channel, dim.contentId, dim.pagePath], metrics: [met.views], dateRanges: ranges(range, false), dimensionFilter: filter, limit: 1000 },
    { dimensions: [dim.pageReferrer, dim.contentId, dim.pagePath], metrics: [met.views], dateRanges: ranges(range, false), dimensionFilter: filter, limit: 1000 },
    { dimensions: [dim.deviceCategory, dim.contentId, dim.pagePath], metrics: [met.activeUsers], dateRanges: ranges(range, false), dimensionFilter: filter, limit: 1000 },
    { dimensions: [dim.eventName, dim.contentId, dim.pagePath], metrics: [met.activeUsers], dateRanges: ranges(range, false), dimensionFilter: { andGroup: { expressions: [filter, { filter: { fieldName: dim.eventName, inListFilter: { values: readEvents } } }] } }, limit: 200 }
  ];
  const { value, cached: hit, fetchedAt } = await cached(key(context, "story", range, String(story.id)), ttlFor(range), async () => {
    const [totals, series, channels, referrers, devices, reading] = await runAll(context, specs);
    // Rows were requested by Story or path; only rows that map to this Story count.
    const mine = (rows: ReportRow[]) => rows.filter((row) => {
      const mapped = mapRow({ contentId: row.dims[dim.contentId], pagePath: row.dims[dim.pagePath] }, context.catalog);
      return mapped.kind === "story" && mapped.story.id === story.id;
    });
    const rolled = (table: Section<ReportTable>, dimension: string, metric: string, label?: (value: string) => string) => map(table, (data) => counts(mine(data.rows), dimension, metric, { label, top: 6 }));
    const host = context.catalog.siteHost;
    return {
      totals: map(totals!, (table) => {
        const rows = mine(table.rows);
        const users = sum(rows, met.activeUsers);
        return { views: sum(rows, met.views), activeUsers: users, engagement: averageEngagementSeconds(sum(rows, met.engagementDuration), users), scrolled: sum(rows, met.scrolledUsers) || null };
      }),
      series: map(series!, (table) => {
        const rows = mine(table.rows);
        const byDate = new Map<string, { views: number; activeUsers: number }>();
        for (const row of rows) {
          const date = gaDate(row.dims[dim.date] ?? "");
          const entry = byDate.get(date) ?? { views: 0, activeUsers: 0 };
          entry.views += row.metrics[met.views] ?? 0; entry.activeUsers += row.metrics[met.activeUsers] ?? 0;
          byDate.set(date, entry);
        }
        return eachDay(range.start, range.end).map((date) => ({ date, views: byDate.get(date)?.views ?? 0, activeUsers: byDate.get(date)?.activeUsers ?? 0 }));
      }),
      channels: rolled(channels!, dim.channel, met.views, channelLabel),
      referrers: map(referrers!, (table) => {
        const hosts = new Map<string, number>();
        for (const row of mine(table.rows)) {
          const referrer = hostnameOf(row.dims[dim.pageReferrer] ?? "");
          if (!referrer || referrer === host) continue;
          hosts.set(referrer, (hosts.get(referrer) ?? 0) + (row.metrics[met.views] ?? 0));
        }
        return [...hosts].map(([referrer, views]) => ({ referrer, views })).sort((a, b) => b.views - a.views).slice(0, 6);
      }),
      devices: rolled(devices!, dim.deviceCategory, met.activeUsers),
      reading: map(reading!, (table) => {
        const rows = mine(table.rows);
        if (!rows.length) return null;
        const users = (event: string) => rows.filter((row) => row.dims[dim.eventName] === event).reduce((total, row) => total + (row.metrics[met.activeUsers] ?? 0), 0);
        return ([25, 50, 75, 100] as const).map((percent) => ({ percent, users: users(READ_EVENTS[percent]) }));
      })
    };
  }, { refresh: context.refresh });
  const body = value;
  const empty = body.totals.ok && body.totals.data.views === 0 && body.series.ok;
  return { meta: meta(range, fetchedAt, hit), empty, ...body };
}

