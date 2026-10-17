import type { SchoolEvent } from "./headless";
/** Match WordPress's local Y-m-dTH:i comparison at build time, rather than
 * freezing the endpoint's "upcoming" filter at snapshot preparation time. */
export function upcomingSnapshotEvents(events: SchoolEvent[], timezone: string, limit: number, now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const part = (name: Intl.DateTimeFormatPartTypes) => parts.find((entry) => entry.type === name)?.value;
  const localNow = `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
  return events.filter((event) => event.startDate >= localNow).sort((a, b) => a.startDate.localeCompare(b.startDate)).slice(0, Math.max(1, limit));
}
