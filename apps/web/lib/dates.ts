/**
 * WordPress returns every date twice: `date` is the site's local wall-clock time
 * with no offset, and `date_gmt` is the same instant in UTC (also with no
 * offset). Machine-readable metadata (JSON-LD, Open Graph, sitemaps, feeds) must
 * be timezone-aware, so this is the one place those strings become instants.
 */

const WORDPRESS_DATE = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/i;

function isUnsetWordPressDate(value: string) {
  return value.startsWith("0000-00-00");
}

function offsetMinutes(designator: string) {
  const match = designator.match(/^([+-])(\d{2}):?(\d{2})$/);
  if (!match) return 0;
  return (match[1] === "-" ? -1 : 1) * (Number(match[2]) * 60 + Number(match[3]));
}

function timeZoneOffsetMs(instant: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).formatToParts(new Date(instant));
  const part = (type: string) => Number(parts.find((entry) => entry.type === type)?.value);

  return Date.UTC(part("year"), part("month") - 1, part("day"), part("hour"), part("minute"), part("second")) - Math.floor(instant / 1000) * 1000;
}

/** Parse a WordPress date string. Offset-less values are read in `assumedTimeZone` ("UTC" or an IANA zone). */
export function parseWordPressDate(value: string | null | undefined, assumedTimeZone = "UTC"): Date | null {
  const text = value?.trim();
  if (!text || isUnsetWordPressDate(text)) return null;

  const match = text.match(WORDPRESS_DATE);
  if (!match) return null;

  const [, year, month, day, hour, minute, second = "0", designator] = match;
  const wallClock = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second));
  const roundTrip = new Date(wallClock);
  // Date.UTC silently rolls impossible dates (2026-02-31) forward.
  if (roundTrip.getUTCFullYear() !== Number(year) || roundTrip.getUTCMonth() !== Number(month) - 1 || roundTrip.getUTCDate() !== Number(day)) return null;

  let instant: number;
  if (designator) {
    instant = wallClock - (designator.toUpperCase() === "Z" ? 0 : offsetMinutes(designator)) * 60_000;
  } else if (assumedTimeZone === "UTC") {
    instant = wallClock;
  } else {
    // Resolve the zone offset at (approximately) that instant, then re-check it
    // once so times beside a DST change still land on the right side.
    const first = wallClock - timeZoneOffsetMs(wallClock, assumedTimeZone);
    instant = wallClock - timeZoneOffsetMs(first, assumedTimeZone);
  }

  const date = new Date(instant);
  return Number.isFinite(date.getTime()) ? date : null;
}

type WordPressDateFields = {
  /** Local time in the publication's timezone. */
  local?: string | null;
  /** The same instant in UTC. Preferred when present. */
  gmt?: string | null;
};

/** The instant a post/page was published or modified, or null when WordPress gave nothing usable. */
export function getWordPressInstant({ gmt, local }: WordPressDateFields, publicationTimeZone: string): Date | null {
  return parseWordPressDate(gmt, "UTC") ?? parseWordPressDate(local, publicationTimeZone);
}

/** A valid ISO 8601 UTC timestamp (e.g. 2026-10-14T22:15:00.000Z), or undefined. */
export function getWordPressIsoTimestamp(fields: WordPressDateFields, publicationTimeZone: string): string | undefined {
  return getWordPressInstant(fields, publicationTimeZone)?.toISOString();
}
