import { runRealtimeReport } from "./data-client";
import { cached, TTL } from "./cache";
import { realtimeDimensions as rd, realtimeMetrics as rm, EVENT_LABELS, type HomeAudienceDto, type NamedCount, type RealtimeDto } from "./model";
import { storyForTitle, type Catalog } from "./content-map";
import { toStoryRef, type ReportContext } from "./reports";

/**
 * Google's Realtime API reports the last 30 minutes (minutesAgo 00–29) by page *title*
 * (`unifiedScreenName`), country, device and event. It has no page path and no traffic source, so
 * neither is invented here: a title only becomes a Story when exactly one published Story has that
 * title, and otherwise stays a generic page.
 */
export const REALTIME_WINDOW_MINUTES = 30;

const named = (rows: Array<{ name: string; value: number }>, top: number): NamedCount[] => {
  const total = rows.reduce((sum, row) => sum + row.value, 0);
  return rows.filter((row) => row.value > 0).sort((a, b) => b.value - a.value).slice(0, top).map((row) => ({ ...row, share: total > 0 ? row.value / total : 0 }));
};

export async function realtime(context: ReportContext): Promise<RealtimeDto> {
  const { value, cached: hit, fetchedAt } = await cached(`${context.property}|realtime`, TTL.realtime, async () => {
    const run = (dimensions: string[], metrics: string[], limit = 25) => runRealtimeReport(context.token, context.property, { dimensions, metrics, limit });
    const [total, minutes, pages, countries, devices, events] = await Promise.all([
      run([], [rm.activeUsers], 1),
      run([rd.minutesAgo], [rm.activeUsers], REALTIME_WINDOW_MINUTES),
      run([rd.pageTitle], [rm.activeUsers], 25),
      run([rd.country], [rm.activeUsers], 25),
      run([rd.deviceCategory], [rm.activeUsers], 10),
      run([rd.eventName], [rm.events], 15)
    ]);
    return {
      activeUsers: total.rows[0]?.metrics[rm.activeUsers] ?? 0,
      activity: Array.from({ length: REALTIME_WINDOW_MINUTES }, (_, minute) => ({ minutesAgo: minute, activeUsers: minutes.rows.find((row) => Number(row.dims[rd.minutesAgo]) === minute)?.metrics[rm.activeUsers] ?? 0 })),
      pages: pages.rows.map((row) => ({ title: row.dims[rd.pageTitle] ?? "", activeUsers: row.metrics[rm.activeUsers] ?? 0 })).filter((row) => row.title && row.title !== "(not set)").sort((a, b) => b.activeUsers - a.activeUsers),
      countries: named(countries.rows.map((row) => ({ name: row.dims[rd.country] || "Unknown", value: row.metrics[rm.activeUsers] ?? 0 })), 8),
      devices: named(devices.rows.map((row) => ({ name: row.dims[rd.deviceCategory] || "Unknown", value: row.metrics[rm.activeUsers] ?? 0 })), 4),
      events: events.rows.map((row) => ({ name: row.dims[rd.eventName] ?? "", count: row.metrics[rm.events] ?? 0 })).filter((row) => row.name).sort((a, b) => b.count - a.count).slice(0, 8)
    };
  }, { refresh: context.refresh });
  return {
    meta: { fetchedAt, cached: hit, range: null },
    activeUsers: value.activeUsers, windowMinutes: REALTIME_WINDOW_MINUTES, activity: value.activity,
    pages: value.pages.map((page) => ({ ...page, story: matchStory(page.title, context.catalog) })),
    countries: value.countries, devices: value.devices,
    events: value.events.map((event) => ({ ...event, label: EVENT_LABELS[event.name] ?? event.name.replace(/_/g, " ") }))
  };
}

function matchStory(title: string, catalog: Catalog) {
  const story = storyForTitle(title, catalog);
  return story ? toStoryRef(story) : null;
}

/** Readers now on exactly one published Story's page title (the sum across its pageview titles). */
export function readersOnStory(dto: Pick<RealtimeDto, "pages">, storyId: number): number {
  return dto.pages.filter((page) => page.story?.id === storyId).reduce((sum, page) => sum + page.activeUsers, 0);
}

export function homeAudience(dto: RealtimeDto): HomeAudienceDto {
  const top = dto.pages[0];
  return { activeUsers: dto.activeUsers, windowMinutes: dto.windowMinutes, top: top ? { title: top.story?.title ?? top.title, story: top.story, activeUsers: top.activeUsers } : null };
}

