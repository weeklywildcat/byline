/**
 * Publication-local dates and the public article path: one implementation for
 * every producer of public Story facts (the newsroom's Live Preview, the v1
 * public snapshot and any compatibility helper).
 *
 * A CMS stores publication as an instant. The public article URL is
 * `/YYYY/MM/DD/<section>/<slug>/` where the date is the calendar day *in the
 * publication's timezone*, never the first ten characters of a UTC ISO string
 * (11:30 p.m. Eastern is already the next day in UTC). WordPress-compatible
 * snapshot fields carry the same instant twice: `date` as the publication's
 * local wall time and `date_gmt` as UTC, both without an offset
 * (`2026-11-07T23:30:00`).
 */

export type PublicationDateParts = { year: string; month: string; day: string; hour: string; minute: string; second: string };

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string) {
  let format = formatters.get(timeZone);
  if (!format) {
    format = new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
    formatters.set(timeZone, format);
  }
  return format;
}

/** A finite instant from a Date or an ISO string, or null. */
export function publicationInstant(value: Date | string | null | undefined): Date | null {
  if (value === null || value === undefined || value === "") return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function requireInstant(value: Date | string): Date {
  const date = publicationInstant(value);
  if (!date) throw new Error(`Invalid publication instant: ${String(value).slice(0, 40)}`);
  return date;
}

/** The wall-clock parts of an instant in a timezone (24-hour, zero-padded). */
export function publicationDateParts(value: Date | string, timeZone: string): PublicationDateParts {
  const parts = Object.fromEntries(formatter(timeZone).formatToParts(requireInstant(value)).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  // Some engines report midnight as "24" even with h23.
  const hour = parts.hour === "24" ? "00" : parts.hour;
  return { year: parts.year, month: parts.month, day: parts.day, hour, minute: parts.minute, second: parts.second };
}

/** The publication's calendar day of an instant: `YYYY-MM-DD`. */
export function publicationLocalDate(value: Date | string, timeZone: string): string {
  const { year, month, day } = publicationDateParts(value, timeZone);
  return `${year}-${month}-${day}`;
}

/** WordPress `date` / `modified`: the publication's wall time, no offset (`YYYY-MM-DDTHH:MM:SS`). */
export function publicationLocalDateTime(value: Date | string, timeZone: string): string {
  const { year, month, day, hour, minute, second } = publicationDateParts(value, timeZone);
  return `${year}-${month}-${day}T${hour}:${minute}:${second}`;
}

/** WordPress `date_gmt` / `modified_gmt`: UTC, no offset (`YYYY-MM-DDTHH:MM:SS`). */
export function publicationUtcDateTime(value: Date | string): string {
  return requireInstant(value).toISOString().slice(0, 19);
}

/** The publication's wall time to the minute (`YYYY-MM-DDTHH:MM`), the school-event contract. */
export function publicationLocalMinute(value: Date | string, timeZone: string): string {
  return publicationLocalDateTime(value, timeZone).slice(0, 16);
}

/**
 * The public article path `/YYYY/MM/DD/<section>/<slug>/`, dated by the
 * publication's calendar day of the first publication. Empty when it cannot
 * be known yet (no slug, no section or no publication time).
 */
export function publicStoryPath(input: { slug: string | null | undefined; sectionSlug: string | null | undefined; publishedAt: Date | string | null | undefined; timeZone: string }): string {
  const slug = input.slug?.trim() ?? "";
  const section = input.sectionSlug?.trim() ?? "";
  const instant = publicationInstant(input.publishedAt ?? null);
  if (!slug || !section || !instant) return "";
  const [year, month, day] = publicationLocalDate(instant, input.timeZone).split("-");
  return `/${year}/${month}/${day}/${section}/${slug}/`;
}
